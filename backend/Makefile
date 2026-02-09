VENV = .venv
PYTHON = $(VENV)/bin/python
UVICORN = $(VENV)/bin/uvicorn
PIP = $(VENV)/bin/pip

.PHONY: venv install run run-reload gmail-auth

venv:
	python3 -m venv $(VENV)

install:
	$(PIP) install -r requirements.txt

run:
	$(UVICORN) app.main:app --port 8000

run-reload:
	$(UVICORN) app.main:app --reload --port 8000

gmail-auth:
	$(PYTHON) -m app.scripts.gmail_auth
