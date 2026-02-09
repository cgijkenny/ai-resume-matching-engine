from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from app.core.config import settings
from app.models import Job, Resume

try:
    from sentence_transformers import SentenceTransformer
except Exception:  # pragma: no cover
    SentenceTransformer = None


@dataclass
class MatchScore:
    semantic_score: float
    skill_score: float
    final_score: float
    missing_skills: list[str]


def _normalize_skill(value: str) -> str:
    return value.strip().lower()


class JobMatcher:
    def __init__(self) -> None:
        self._transformer = None
        self._tfidf_vectorizer = TfidfVectorizer(stop_words="english")

    def _load_transformer(self):
        if self._transformer is not None:
            return self._transformer
        if SentenceTransformer is None:
            return None
        try:
            # Use local cache only to avoid long network retries at request time.
            self._transformer = SentenceTransformer(
                settings.embedding_model_name,
                local_files_only=True,
            )
        except Exception:  # pragma: no cover
            self._transformer = None
        return self._transformer

    def semantic_similarity(self, job_text: str, resume_text: str) -> float:
        transformer = self._load_transformer()
        if transformer is not None:
            embeddings = transformer.encode(
                [job_text, resume_text],
                normalize_embeddings=True,
            )
            score = float(np.dot(embeddings[0], embeddings[1]))
        else:
            vectors = self._tfidf_vectorizer.fit_transform([job_text, resume_text])
            score = float(cosine_similarity(vectors[0:1], vectors[1:2])[0][0])
        return min(max(score, 0.0), 1.0)

    def skill_overlap(
        self,
        required_skills: list[str],
        resume_skills: list[str],
        resume_text: str,
    ) -> tuple[float, list[str]]:
        required = [_normalize_skill(skill) for skill in required_skills if skill.strip()]
        if not required:
            return 1.0, []

        resume_skill_set = {_normalize_skill(skill) for skill in resume_skills}
        resume_text_lower = resume_text.lower()
        matched = 0
        missing_skills: list[str] = []

        for skill in required:
            if skill in resume_skill_set or skill in resume_text_lower:
                matched += 1
            else:
                missing_skills.append(skill)

        return matched / len(required), missing_skills

    def match(self, job: Job, resume: Resume) -> MatchScore:
        semantic = self.semantic_similarity(job.description, resume.text)
        skill_score, missing_skills = self.skill_overlap(
            job.required_skills,
            resume.skills,
            resume.text,
        )
        final = (0.75 * semantic) + (0.25 * skill_score)
        return MatchScore(
            semantic_score=semantic,
            skill_score=skill_score,
            final_score=final,
            missing_skills=missing_skills,
        )


matcher = JobMatcher()
