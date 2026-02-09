from pydantic import BaseModel, Field


class JobCreate(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    description: str = Field(min_length=20)
    required_skills: list[str] = Field(default_factory=list)


class Job(JobCreate):
    id: int


class ResumeCreate(BaseModel):
    candidate_name: str = Field(min_length=2, max_length=120)
    text: str = Field(min_length=30)
    skills: list[str] = Field(default_factory=list)


class Resume(ResumeCreate):
    id: int


class GmailImportResponse(BaseModel):
    imported_count: int
    skipped_count: int
    resumes: list[Resume]
    errors: list[str] = Field(default_factory=list)


class MatchResult(BaseModel):
    resume_id: int
    candidate_name: str
    semantic_score: float
    skill_score: float
    final_score: float
    missing_skills: list[str]


class HealthResponse(BaseModel):
    status: str
    app: str
