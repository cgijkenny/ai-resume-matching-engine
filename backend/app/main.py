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
    allow_credentials="*" not in settings.cors_origins_list,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.api_v1_prefix)

web_dir = Path(__file__).resolve().parent / "web"


if web_dir.exists():
    @app.get("/", include_in_schema=False)
    def serve_spa_root() -> FileResponse:
        return FileResponse(web_dir / "index.html")


    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_spa(full_path: str) -> FileResponse:
        api_prefix = settings.api_v1_prefix.strip("/")
        if full_path.startswith(api_prefix):
            raise HTTPException(status_code=404, detail="Not found")

        file_path = web_dir / full_path
        if file_path.is_file():
            return FileResponse(file_path)

        return FileResponse(web_dir / "index.html")
