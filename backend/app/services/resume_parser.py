from io import BytesIO

import pdfplumber
from docx import Document
from fastapi import UploadFile

from app.core.config import settings


async def extract_text_from_upload(file: UploadFile) -> str:
    raw = await file.read()
    if not raw:
        raise ValueError("Uploaded file is empty.")

    return extract_text_from_bytes(
        raw=raw,
        filename=file.filename or "",
        content_type=file.content_type,
    )


def extract_text_from_bytes(
    raw: bytes,
    filename: str,
    content_type: str | None = None,
) -> str:
    if not raw:
        raise ValueError("Uploaded file is empty.")

    filename = (filename or "").lower()
    content_type = (content_type or "").lower()

    if filename.endswith(".txt") or content_type == "text/plain":
        text = raw.decode("utf-8", errors="ignore")
    elif filename.endswith(".pdf") or content_type == "application/pdf":
        text = _extract_pdf_text(raw)
    elif filename.endswith(".docx") or (
        content_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ):
        text = _extract_docx_text(raw)
    else:
        raise ValueError("Unsupported file type. Use .txt, .pdf, or .docx")

    normalized_text = text.strip()
    if not normalized_text:
        raise ValueError("No readable text found in uploaded file.")
    return normalized_text[: settings.resume_max_text_characters]


def _extract_pdf_text(raw: bytes) -> str:
    buffer = BytesIO(raw)
    collected: list[str] = []
    with pdfplumber.open(buffer) as pdf:
        for page in pdf.pages[: settings.resume_pdf_max_pages]:
            page_text = page.extract_text() or ""
            if page_text.strip():
                collected.append(page_text)
            current_size = sum(len(item) for item in collected)
            if current_size >= settings.resume_max_text_characters:
                break
    return "\n".join(collected)[: settings.resume_max_text_characters]


def _extract_docx_text(raw: bytes) -> str:
    document = Document(BytesIO(raw))
    lines = [paragraph.text for paragraph in document.paragraphs if paragraph.text.strip()]
    return "\n".join(lines)[: settings.resume_max_text_characters]
