# AI Resume Screening and Job Matching Engine

Web app to screen resumes and rank candidates against a job using NLP and semantic similarity.

## Features
- Create and manage job descriptions with required skills.
- Import resumes from Gmail attachments (`.pdf`, `.docx`, `.txt`).
- Upload resume files manually from the UI.
- Run matching and get ranked candidates with:
  - final score
  - semantic score
  - skill score
  - missing skills

## Tech Stack
- Backend: FastAPI (Python)
- Frontend: React + Vite
- NLP:
  - SentenceTransformer embeddings when model is available
  - TF-IDF fallback when embeddings are unavailable
- Deployment: Docker, Docker Compose, Render Blueprint

## Project Structure
```text
backend/
  app/
    core/            # settings/config
    routers/         # API endpoints
    services/        # matcher, resume parser, gmail client
    scripts/         # one-time setup scripts (gmail auth)
frontend/
  src/               # React app
Dockerfile           # single-service deploy image (Render)
docker-compose.yml   # local multi-service stack
render.yaml          # Render blueprint
```

## Quick Start (Local with Docker)
```bash
cd <project-root>
docker compose up --build
```

Open:
- Web UI: `http://localhost:5173`
- API docs: `http://localhost:8000/docs`

## Gmail OAuth Setup (One Time)
1. Place OAuth client file:
- `backend/oauth/credentials.json`

2. Generate Gmail token:
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
GMAIL_CREDENTIALS_PATH=oauth/credentials.json GMAIL_TOKEN_PATH=oauth/token.json python -m app.scripts.gmail_auth
```

3. Restart backend container:
```bash
cd <project-root>
docker compose restart backend
```

## How to Use
1. Open the web app.
2. Create a job.
3. Import resumes from Gmail or upload resume files.
4. Select the job and click `Run Matching`.

## Main API Endpoints
- `GET /api/v1/health`
- `POST /api/v1/jobs`
- `GET /api/v1/jobs`
- `POST /api/v1/resumes/upload`
- `POST /api/v1/resumes/import/gmail`
- `POST /api/v1/resumes/match/{job_id}`

## Deploy as Public Web App (Render)
1. Push project to GitHub.
2. In Render, create a Blueprint from this repository.
3. Render uses `render.yaml` and builds the service.
4. Add these environment variables in Render:
- `GMAIL_CREDENTIALS_JSON` = full JSON content of OAuth credentials file
- `GMAIL_TOKEN_JSON` = full JSON content of token file
5. Deploy latest commit.

## Environment Variables
See `.env.example` for all variables.

## Notes
- Keep Gmail credentials/token private.
- Do not commit secret files.
