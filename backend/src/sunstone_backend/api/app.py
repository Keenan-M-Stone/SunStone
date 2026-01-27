from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from sunstone_backend.settings import get_settings
from .routes import artifacts, projects, runs


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="SunStone API", version="0.1.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allow_origins,
        allow_credentials=True,
        allow_methods=["*"] ,
        allow_headers=["*"],
        allow_origin_regex=r"^http://(localhost|127\.0\.0\.1)(:\d+)?$",
    )

    from .routes import logs
    app.include_router(projects.router)
    app.include_router(runs.router)
    app.include_router(artifacts.router)
    app.include_router(logs.router)

    @app.get("/health")
    def health() -> dict:
        return {"ok": True}

    return app
