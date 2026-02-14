from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "AI Resume Screening and Job Matching Engine"
    api_v1_prefix: str = "/api/v1"
    cors_origins: str = "http://localhost:5173"
    embedding_model_name: str = "sentence-transformers/all-MiniLM-L6-v2"
    gmail_credentials_path: str = "credentials.json"
    gmail_token_path: str = "token.json"
    gmail_resume_label: str = ""
    linkedin_client_id: str = ""
    linkedin_client_secret: str = ""
    linkedin_token_path: str = "linkedin_token.json"
    linkedin_scopes: str = "openid profile email"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
