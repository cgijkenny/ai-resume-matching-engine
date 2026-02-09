from fastapi import APIRouter, HTTPException

from app.models import Job, JobCreate
from app.store import store

router = APIRouter()


@router.get("", response_model=list[Job])
def list_jobs() -> list[Job]:
    return store.jobs


@router.get("/{job_id}", response_model=Job)
def get_job(job_id: int) -> Job:
    for job in store.jobs:
        if job.id == job_id:
            return job
    raise HTTPException(status_code=404, detail="Job not found")


@router.post("", response_model=Job, status_code=201)
def create_job(payload: JobCreate) -> Job:
    job = Job(id=store.next_job_id(), **payload.model_dump())
    store.jobs.append(job)
    return job
