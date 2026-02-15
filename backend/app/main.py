from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.core.config import settings
from app.routers import api_router

app = FastAPI(title=settings.app_name, version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.api_v1_prefix)

web_dir = Path(__file__).resolve().parent / "web"
web_dir_resolved = web_dir.resolve()
index_file = web_dir / "index.html"


@app.get("/", include_in_schema=False)
async def serve_root() -> FileResponse:
    if index_file.exists():
        return FileResponse(index_file)
    raise HTTPException(status_code=404, detail="Frontend build not found.")


@app.get("/{full_path:path}", include_in_schema=False)
async def serve_spa(full_path: str) -> FileResponse:
    candidate = (web_dir / full_path).resolve()
    if str(candidate).startswith(str(web_dir_resolved)) and candidate.is_file():
        return FileResponse(candidate)
    if index_file.exists():
        return FileResponse(index_file)
    raise HTTPException(status_code=404, detail="Frontend build not found.")
