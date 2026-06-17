from functools import lru_cache
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # App
    app_name: str = "AI20K Agent"
    app_env: Literal["development", "production", "test"] = "development"
    app_port: int = Field(default=8000, ge=1, le=65535)
    app_host: str = "0.0.0.0"
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    cors_origins: str = "http://localhost:3000"
    jwt_secret_key: str = "lecture_generator_super_secret_key"
    database_timeout: float = 15.0
    llm_local_timeout: int = 30
    gemini_api_keys: str = ""
    disable_query_expansion: bool = True

    # LLM
    openai_api_key: str = ""
    model_name: str = "gpt-4o-mini"
    llm_temperature: float = Field(default=0.7, ge=0.0, le=2.0)

    # Database
    database_url: str = "sqlite:///./lecture_generator.db"

    # Vector Store
    chroma_persist_dir: str = "./data/chroma"

    # Project specific settings (G02-Team023-LectureGenerator-V2)
    gemini_api_key: str = ""
    tavily_api_key: str = ""
    openrouter_api_key: str = ""

    # Local LLM config
    local_llm_url: str = ""
    local_llm_tunnel_url: str = ""
    local_llm_api_key: str = ""
    local_llm_model: str = ""

    # Langfuse config
    langfuse_public_key: str = ""
    langfuse_secret_key: str = ""
    langfuse_host: str = ""

    @model_validator(mode="after")
    def check_jwt_secret_in_production(self) -> 'Settings':
        if self.app_env == "production" and self.jwt_secret_key == "lecture_generator_super_secret_key":
            raise ValueError(
                "Security Risk: Default weak JWT secret key is not allowed in production environment."
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
