from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, model_validator
from typing import Optional
import secrets


class Settings(BaseSettings):
    MONGODB_URL: str = "mongodb://localhost:27017"
    DATABASE_NAME: str = "baangs_fsm"

    SECRET_KEY: str = Field(default_factory=lambda: secrets.token_urlsafe(48))
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours

    CLOUDINARY_CLOUD_NAME: Optional[str] = None
    CLOUDINARY_API_KEY: Optional[str] = None
    CLOUDINARY_API_SECRET: Optional[str] = None

    APP_NAME: str = "Baangs FSM"
    ENVIRONMENT: str = "development"
    ALLOW_MOCK_DATABASE: bool = False
    ENABLE_BACKGROUND_REMINDERS: bool = True
    FRONTEND_URL: str = "http://localhost:5173"

    model_config = SettingsConfigDict(env_file=".env", extra="allow", protected_namespaces=())

    @model_validator(mode="after")
    def validate_production_secret(self):
        if len(self.SECRET_KEY) < 32 or self.SECRET_KEY.lower().startswith(
            ("change-", "your-", "replace-")
        ):
            raise ValueError("SECRET_KEY must be a unique value of at least 32 characters")
        if self.ENVIRONMENT.lower() != "development" and (
            "SECRET_KEY" not in self.model_fields_set
        ):
            raise ValueError("A SECRET_KEY of at least 32 characters is required outside development")
        if self.ENVIRONMENT.lower() != "development" and self.ALLOW_MOCK_DATABASE:
            raise ValueError("Mock database is only available in development")
        return self


settings = Settings()
