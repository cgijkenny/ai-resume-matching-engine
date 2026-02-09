from fastapi import APIRouter

from app.routers.health import router as health_router
from app.routers.jobs import router as jobs_router
from app.routers.resumes import router as resumes_router

api_router = APIRouter()
api_router.include_router(health_router, tags=["health"])
api_router.include_router(jobs_router, prefix="/jobs", tags=["jobs"])
api_router.include_router(resumes_router, prefix="/resumes", tags=["resumes"])
