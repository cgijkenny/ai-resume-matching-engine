from email.utils import parseaddr

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile

from app.models import GmailImportResponse, MatchResult, Resume, ResumeCreate
from app.services.gmail_client import GmailAuthRequiredError, gmail_resume_client
from app.services.linkedin_client import LinkedInAuthRequiredError, linkedin_resume_client
from app.services.matcher import matcher
from app.services.resume_parser import extract_text_from_bytes, extract_text_from_upload
from app.store import store

router = APIRouter()


def _parse_skill_csv(csv_value: str | None) -> list[str]:
    if not csv_value:
        return []
    return [skill.strip() for skill in csv_value.split(",") if skill.strip()]


def _text_fingerprint(text: str) -> str:
    return " ".join(text.lower().split())[:500]


def _is_duplicate_resume(candidate_name: str, text: str) -> bool:
    target_name = candidate_name.strip().lower()
    target_fingerprint = _text_fingerprint(text)
    for existing in store.resumes:
        if existing.candidate_name.strip().lower() != target_name:
            continue
        if _text_fingerprint(existing.text) == target_fingerprint:
            return True
    return False


def _infer_candidate_name(sender: str, filename: str) -> str:
    display_name, email_address = parseaddr(sender)
    if display_name.strip():
        return display_name.strip().strip('"')

    if email_address:
        local_part = email_address.split("@", 1)[0]
        return local_part.replace(".", " ").replace("_", " ").strip().title()

    base_name = (filename or "Unknown Candidate").rsplit(".", 1)[0]
    return base_name.replace("_", " ").strip() or "Unknown Candidate"


@router.get("", response_model=list[Resume])
def list_resumes() -> list[Resume]:
    return store.resumes


@router.post("", response_model=Resume, status_code=201)
def create_resume(payload: ResumeCreate) -> Resume:
    resume = Resume(id=store.next_resume_id(), **payload.model_dump())
    store.resumes.append(resume)
    return resume


@router.post("/upload", response_model=Resume, status_code=201)
async def upload_resume(
    file: UploadFile = File(...),
    candidate_name: str | None = Form(default=None),
    skills: str | None = Form(default=None),
) -> Resume:
    try:
        text = await extract_text_from_upload(file)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    inferred_name = (file.filename or "Unknown Candidate").rsplit(".", 1)[0]
    resume = Resume(
        id=store.next_resume_id(),
        candidate_name=candidate_name or inferred_name,
        text=text,
        skills=_parse_skill_csv(skills),
    )
    store.resumes.append(resume)
    return resume


@router.post("/import/gmail", response_model=GmailImportResponse)
def import_resumes_from_gmail(
    max_messages: int = Query(default=20, ge=1, le=100),
    query: str | None = Query(default=None),
    label: str | None = Query(default=None),
) -> GmailImportResponse:
    try:
        attachments = gmail_resume_client.fetch_recent_resume_attachments(
            max_messages=max_messages,
            query=query,
            label=label,
        )
    except GmailAuthRequiredError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Gmail import failed: {exc}") from exc

    imported_resumes: list[Resume] = []
    skipped_count = 0
    errors: list[str] = []

    for attachment in attachments:
        candidate_name = _infer_candidate_name(attachment.sender, attachment.filename)
        try:
            text = extract_text_from_bytes(
                raw=attachment.raw_bytes,
                filename=attachment.filename,
                content_type=attachment.mime_type,
            )
        except ValueError as exc:
            errors.append(f"{attachment.filename}: {exc}")
            continue

        if _is_duplicate_resume(candidate_name=candidate_name, text=text):
            skipped_count += 1
            continue

        resume = Resume(
            id=store.next_resume_id(),
            candidate_name=candidate_name,
            text=text,
            skills=[],
        )
        store.resumes.append(resume)
        imported_resumes.append(resume)

    return GmailImportResponse(
        imported_count=len(imported_resumes),
        skipped_count=skipped_count,
        resumes=imported_resumes,
        errors=errors,
    )


@router.post("/import/linkedin", response_model=Resume, status_code=201)
def import_resume_from_linkedin() -> Resume:
    try:
        profile = linkedin_resume_client.fetch_profile_resume()
    except LinkedInAuthRequiredError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"LinkedIn import failed: {exc}") from exc

    candidate_name = profile["candidate_name"]
    text = profile["text"]
    skills = profile.get("skills", [])

    if _is_duplicate_resume(candidate_name=candidate_name, text=text):
        raise HTTPException(status_code=409, detail="LinkedIn profile already imported.")

    resume = Resume(
        id=store.next_resume_id(),
        candidate_name=candidate_name,
        text=text,
        skills=skills,
    )
    store.resumes.append(resume)
    return resume


@router.post("/match/{job_id}", response_model=list[MatchResult])
def match_resumes_to_job(job_id: int) -> list[MatchResult]:
    selected_job = None
    for job in store.jobs:
        if job.id == job_id:
            selected_job = job
            break
    if selected_job is None:
        raise HTTPException(status_code=404, detail="Job not found")

    results: list[MatchResult] = []
    for resume in store.resumes:
        scored = matcher.match(selected_job, resume)
        results.append(
            MatchResult(
                resume_id=resume.id,
                candidate_name=resume.candidate_name,
                semantic_score=round(scored.semantic_score, 4),
                skill_score=round(scored.skill_score, 4),
                final_score=round(scored.final_score, 4),
                missing_skills=scored.missing_skills,
            )
        )

    results.sort(key=lambda item: item.final_score, reverse=True)
    return results
