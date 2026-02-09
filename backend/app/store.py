from app.models import Job, Resume


class InMemoryStore:
    def __init__(self) -> None:
        self.jobs: list[Job] = []
        self.resumes: list[Resume] = []
        self._job_id = 1
        self._resume_id = 1

    def next_job_id(self) -> int:
        current = self._job_id
        self._job_id += 1
        return current

    def next_resume_id(self) -> int:
        current = self._resume_id
        self._resume_id += 1
        return current


store = InMemoryStore()
