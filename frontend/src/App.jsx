import { useEffect, useState } from "react";
import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "",
  timeout: 60000
});

function parseCsv(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function toPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function readApiDetail(detail) {
  if (!detail) {
    return "";
  }
  if (typeof detail === "string") {
    return detail;
  }
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (item && typeof item === "object" && typeof item.msg === "string") {
          return item.msg;
        }
        return JSON.stringify(item);
      })
      .join(" | ");
  }
  if (typeof detail === "object") {
    if (typeof detail.message === "string") {
      return detail.message;
    }
    return JSON.stringify(detail);
  }
  return String(detail);
}

function apiErrorMessage(error, fallback) {
  const detail = readApiDetail(error?.response?.data?.detail);
  if (detail) {
    return detail;
  }
  if (typeof error?.message === "string" && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

export default function App() {
  const [health, setHealth] = useState("checking");
  const [jobs, setJobs] = useState([]);
  const [resumes, setResumes] = useState([]);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [linkedinConnected, setLinkedinConnected] = useState(false);
  const [matches, setMatches] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const [jobTitle, setJobTitle] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [jobSkills, setJobSkills] = useState("");

  const [resumeName, setResumeName] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [resumeSkills, setResumeSkills] = useState("");

  const [uploadName, setUploadName] = useState("");
  const [uploadSkills, setUploadSkills] = useState("");
  const [uploadFile, setUploadFile] = useState(null);
  const [gmailMaxMessages, setGmailMaxMessages] = useState(5);
  const [gmailQuery, setGmailQuery] = useState("");
  const [gmailLabel, setGmailLabel] = useState("");
  const [isImportingGmail, setIsImportingGmail] = useState(false);
  const [isImportingLinkedin, setIsImportingLinkedin] = useState(false);
  const [isImportingCombined, setIsImportingCombined] = useState(false);

  async function loadDashboard() {
    try {
      const [healthRes, jobsRes, resumesRes, gmailStatusRes, linkedinStatusRes] = await Promise.all([
        api.get("/api/v1/health"),
        api.get("/api/v1/jobs"),
        api.get("/api/v1/resumes"),
        api.get("/api/v1/gmail/status"),
        api.get("/api/v1/linkedin/status")
      ]);
      setHealth(healthRes.data.status);
      setErrorMessage("");
      setJobs(jobsRes.data);
      setResumes(resumesRes.data);
      setGmailConnected(Boolean(gmailStatusRes.data.connected));
      setLinkedinConnected(Boolean(linkedinStatusRes.data.connected));
      if (!selectedJobId && jobsRes.data.length > 0) {
        setSelectedJobId(String(jobsRes.data[0].id));
      }
    } catch {
      setHealth("offline");
      setGmailConnected(false);
      setLinkedinConnected(false);
      setErrorMessage("Backend API is offline. Start backend server on port 8000.");
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gmailAuth = params.get("gmail_auth");
    const linkedinAuth = params.get("linkedin_auth");
    const message = params.get("message");

    if (gmailAuth === "connected") {
      setStatusMessage("Gmail sign-in successful. You can now import resumes.");
      setErrorMessage("");
      loadDashboard();
    } else if (gmailAuth === "error") {
      setErrorMessage(message || "Gmail authorization failed.");
    }

    if (linkedinAuth === "connected") {
      setStatusMessage("LinkedIn sign-in successful. You can now import profile.");
      setErrorMessage("");
      loadDashboard();
    } else if (linkedinAuth === "error") {
      setErrorMessage(message || "LinkedIn authorization failed.");
    }

    if (gmailAuth || linkedinAuth) {
      params.delete("gmail_auth");
      params.delete("linkedin_auth");
      params.delete("message");
      const queryString = params.toString();
      const cleanUrl = `${window.location.pathname}${queryString ? `?${queryString}` : ""}`;
      window.history.replaceState({}, "", cleanUrl);
    }
  }, []);

  function connectGmail() {
    setStatusMessage("");
    setErrorMessage("");
    window.location.assign("/api/v1/gmail/oauth/start");
  }

  function connectLinkedin() {
    setStatusMessage("");
    setErrorMessage("");
    window.location.assign("/api/v1/linkedin/oauth/start");
  }

  function connectBothAccounts() {
    setStatusMessage("");
    setErrorMessage("");

    if (!gmailConnected) {
      window.location.assign("/api/v1/gmail/oauth/start?next_provider=linkedin");
      return;
    }
    if (!linkedinConnected) {
      window.location.assign("/api/v1/linkedin/oauth/start");
      return;
    }
    setStatusMessage("Both Gmail and LinkedIn are already connected.");
  }

  async function createJob(event) {
    event.preventDefault();
    setErrorMessage("");
    setStatusMessage("");
    try {
      const response = await api.post("/api/v1/jobs", {
        title: jobTitle,
        description: jobDescription,
        required_skills: parseCsv(jobSkills)
      });
      const created = response.data;
      setJobs((current) => [...current, created]);
      setSelectedJobId(String(created.id));
      setJobTitle("");
      setJobDescription("");
      setJobSkills("");
      setStatusMessage("Job created.");
    } catch (error) {
      setErrorMessage(apiErrorMessage(error, "Failed to create job."));
    }
  }

  async function createResume(event) {
    event.preventDefault();
    setErrorMessage("");
    setStatusMessage("");
    try {
      const response = await api.post("/api/v1/resumes", {
        candidate_name: resumeName,
        text: resumeText,
        skills: parseCsv(resumeSkills)
      });
      setResumes((current) => [...current, response.data]);
      setResumeName("");
      setResumeText("");
      setResumeSkills("");
      setStatusMessage("Resume added.");
    } catch (error) {
      setErrorMessage(apiErrorMessage(error, "Failed to add resume."));
    }
  }

  async function uploadResume(event) {
    event.preventDefault();
    if (!uploadFile) {
      setErrorMessage("Choose a file first.");
      return;
    }

    setErrorMessage("");
    setStatusMessage("");
    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      if (uploadName.trim()) {
        formData.append("candidate_name", uploadName);
      }
      if (uploadSkills.trim()) {
        formData.append("skills", uploadSkills);
      }

      const response = await api.post("/api/v1/resumes/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      setResumes((current) => [...current, response.data]);
      setUploadFile(null);
      setUploadName("");
      setUploadSkills("");
      setStatusMessage("Resume file uploaded.");
    } catch (error) {
      setErrorMessage(apiErrorMessage(error, "Failed to upload file."));
    }
  }

  async function importFromGmail(event) {
    event.preventDefault();
    setErrorMessage("");
    setStatusMessage("");
    setIsImportingGmail(true);
    const requestedMax = Math.min(100, Math.max(1, Number(gmailMaxMessages) || 5));
    try {
      const response = await api.post("/api/v1/resumes/import/gmail", null, {
        params: {
          max_messages: requestedMax,
          query: gmailQuery.trim() || undefined,
          label: gmailLabel.trim() || undefined
        }
      });
      const data = response.data;
      setResumes((current) => [...current, ...data.resumes]);
      if (data.imported_count === 0 && data.skipped_count === 0 && (!data.errors || data.errors.length === 0)) {
        setStatusMessage("No resume attachments found in Gmail for the current filter.");
      } else {
        setStatusMessage(
          `Gmail import completed. Added ${data.imported_count}, skipped ${data.skipped_count}.`
        );
      }
      if (data.errors?.length) {
        setErrorMessage(data.errors[0]);
      }
    } catch (error) {
      setErrorMessage(apiErrorMessage(error, "Gmail import failed."));
    } finally {
      setIsImportingGmail(false);
    }
  }

  async function importFromLinkedin(event) {
    event.preventDefault();
    setErrorMessage("");
    setStatusMessage("");
    setIsImportingLinkedin(true);
    try {
      const response = await api.post("/api/v1/resumes/import/linkedin");
      setResumes((current) => [...current, response.data]);
      setStatusMessage("LinkedIn profile imported as resume.");
    } catch (error) {
      setErrorMessage(apiErrorMessage(error, "LinkedIn import failed."));
    } finally {
      setIsImportingLinkedin(false);
    }
  }

  async function importFromBothSources() {
    if (!gmailConnected || !linkedinConnected) {
      setErrorMessage("Connect both Gmail and LinkedIn before importing from both sources.");
      return;
    }

    setErrorMessage("");
    setStatusMessage("");
    setIsImportingCombined(true);

    const requestedMax = Math.min(100, Math.max(1, Number(gmailMaxMessages) || 5));
    try {
      const response = await api.post("/api/v1/resumes/import/combined", null, {
        params: {
          max_messages: requestedMax,
          query: gmailQuery.trim() || undefined,
          label: gmailLabel.trim() || undefined
        }
      });
      const data = response.data;
      setResumes((current) => [...current, ...data.resumes]);
      setStatusMessage(
        `Combined import completed. Gmail added ${data.gmail_imported_count}, LinkedIn added ${data.linkedin_imported_count}.`
      );
      if (Array.isArray(data.errors) && data.errors.length > 0) {
        setErrorMessage(data.errors[0]);
      } else if (Array.isArray(data.warnings) && data.warnings.length > 0) {
        setStatusMessage(
          `Combined import completed. Gmail added ${data.gmail_imported_count}, LinkedIn added ${data.linkedin_imported_count}. ${data.warnings[0]}`
        );
      }
    } catch (error) {
      setErrorMessage(apiErrorMessage(error, "Combined import failed."));
    } finally {
      setIsImportingCombined(false);
    }
  }

  async function runMatching() {
    if (!selectedJobId) {
      setErrorMessage("Select a job first.");
      return;
    }
    setErrorMessage("");
    setStatusMessage("");
    try {
      const response = await api.post(`/api/v1/resumes/match/${selectedJobId}`);
      setMatches(response.data);
      setStatusMessage("Matching completed.");
    } catch (error) {
      setErrorMessage(apiErrorMessage(error, "Matching failed."));
    }
  }

  const healthClass =
    health === "ok" ? "chip-ok" : health === "offline" ? "chip-offline" : "chip-pending";
  const healthLabel = typeof health === "string" ? health.toUpperCase() : String(health);

  return (
    <main className="layout">
      <header className="hero">
        <p className="hero-topline">Recruitment Intelligence Suite</p>
        <h1>One Stop Resume Engine</h1>
        <p className="hero-subtitle">
          Import resumes from Gmail, LinkedIn, or files, extract skills, and rank candidates by fit.
        </p>
        <div className="hero-metrics">
          <p className={`metric-chip ${healthClass}`}>
            API <strong>{healthLabel}</strong>
          </p>
          <p className="metric-chip">
            Jobs <strong>{jobs.length}</strong>
          </p>
          <p className="metric-chip">
            Resumes <strong>{resumes.length}</strong>
          </p>
          <p className={`metric-chip ${gmailConnected ? "chip-ok" : "chip-pending"}`}>
            Gmail <strong>{gmailConnected ? "CONNECTED" : "NOT CONNECTED"}</strong>
          </p>
          <p className={`metric-chip ${linkedinConnected ? "chip-ok" : "chip-pending"}`}>
            LinkedIn <strong>{linkedinConnected ? "CONNECTED" : "NOT CONNECTED"}</strong>
          </p>
        </div>
      </header>

      {(statusMessage || errorMessage) && (
        <section className="status-panel">
          {statusMessage && <p className="status-ok status-note">{statusMessage}</p>}
          {errorMessage && <p className="status-error status-note">{errorMessage}</p>}
        </section>
      )}

      <section className="card auth-quick">
        <div className="card-head">
          <h2>Quick Sign-In</h2>
          <span className="card-tag">Non-Technical Flow</span>
        </div>
        <p className="quick-hint">
          Step 1: sign in with Gmail or LinkedIn. Step 2: click import. No technical setup is needed for end users.
        </p>
        <div className="auth-actions">
          <button type="button" className="button-secondary" onClick={connectGmail}>
            {gmailConnected ? "Signed in to Gmail" : "Sign in with Gmail"}
          </button>
          <button type="button" className="button-linkedin" onClick={connectLinkedin}>
            {linkedinConnected ? "Signed in to LinkedIn" : "Sign in with LinkedIn"}
          </button>
          <button type="button" onClick={connectBothAccounts}>
            Connect Both Accounts
          </button>
        </div>
      </section>

      <section className="grid">
        <article className="card">
          <div className="card-head">
            <h2>Create Job</h2>
            <span className="card-tag">Role Setup</span>
          </div>
          <form onSubmit={createJob}>
            <input
              value={jobTitle}
              onChange={(event) => setJobTitle(event.target.value)}
              placeholder="Job title"
              required
            />
            <textarea
              value={jobDescription}
              onChange={(event) => setJobDescription(event.target.value)}
              placeholder="Job description"
              required
            />
            <input
              value={jobSkills}
              onChange={(event) => setJobSkills(event.target.value)}
              placeholder="Required skills (comma-separated)"
            />
            <button type="submit">Save Job</button>
          </form>
          <ul className="job-list">
            {jobs.map((job) => (
              <li key={job.id}>
                <strong>{job.title}</strong>
              </li>
            ))}
            {jobs.length === 0 && <li className="muted">No jobs created yet.</li>}
          </ul>
        </article>

        <article className="card">
          <div className="card-head">
            <h2>Add Resume Text</h2>
            <span className="card-tag">Manual Entry</span>
          </div>
          <form onSubmit={createResume}>
            <input
              value={resumeName}
              onChange={(event) => setResumeName(event.target.value)}
              placeholder="Candidate name"
              required
            />
            <textarea
              value={resumeText}
              onChange={(event) => setResumeText(event.target.value)}
              placeholder="Resume text"
              required
            />
            <input
              value={resumeSkills}
              onChange={(event) => setResumeSkills(event.target.value)}
              placeholder="Candidate skills (comma-separated)"
            />
            <button type="submit">Save Resume</button>
          </form>
        </article>

        <article className="card">
          <div className="card-head">
            <h2>Upload Resume File</h2>
            <span className="card-tag">PDF / DOCX / TXT</span>
          </div>
          <form onSubmit={uploadResume}>
            <input
              value={uploadName}
              onChange={(event) => setUploadName(event.target.value)}
              placeholder="Candidate name (optional)"
            />
            <input
              value={uploadSkills}
              onChange={(event) => setUploadSkills(event.target.value)}
              placeholder="Skills (optional, comma-separated)"
            />
            <input
              type="file"
              accept=".txt,.pdf,.docx"
              onChange={(event) => setUploadFile(event.target.files?.[0] || null)}
              required
            />
            <button type="submit">Upload</button>
          </form>
          <p className="muted">Total resumes: {resumes.length}</p>
        </article>

        <article className="card">
          <div className="card-head">
            <h2>Import from Gmail</h2>
            <span className="card-tag">OAuth</span>
          </div>
          <form onSubmit={importFromGmail}>
            <p className={`connection-status ${gmailConnected ? "is-connected" : "is-disconnected"}`}>
              Connection: <strong>{gmailConnected ? "Connected" : "Not connected"}</strong>
            </p>
            <button type="button" className="button-secondary" onClick={connectGmail}>
              {gmailConnected ? "Sign in again with Gmail" : "Sign in with Gmail"}
            </button>
            <button type="submit" disabled={isImportingGmail || !gmailConnected}>
              {isImportingGmail ? "Importing..." : "Import Resumes"}
            </button>
            <button
              type="button"
              onClick={importFromBothSources}
              disabled={isImportingCombined || !gmailConnected || !linkedinConnected}
            >
              {isImportingCombined ? "Importing Both..." : "Import Gmail + LinkedIn"}
            </button>
            <details className="advanced-options">
              <summary>Advanced filters (optional)</summary>
              <div className="advanced-grid">
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={gmailMaxMessages}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setGmailMaxMessages(Number.isNaN(value) ? 5 : value);
                  }}
                  placeholder="Max emails to scan"
                />
                <input
                  value={gmailLabel}
                  onChange={(event) => setGmailLabel(event.target.value)}
                  placeholder="Gmail label (optional)"
                />
                <input
                  value={gmailQuery}
                  onChange={(event) => setGmailQuery(event.target.value)}
                  placeholder="Extra Gmail query (optional)"
                />
              </div>
            </details>
            <button type="button" className="button-ghost" onClick={loadDashboard}>
              Refresh API Status
            </button>
          </form>
          {isImportingGmail && <p className="muted">Import in progress...</p>}
        </article>

        <article className="card">
          <div className="card-head">
            <h2>Import from LinkedIn</h2>
            <span className="card-tag">OAuth</span>
          </div>
          <form onSubmit={importFromLinkedin}>
            <p className={`connection-status ${linkedinConnected ? "is-connected" : "is-disconnected"}`}>
              Connection: <strong>{linkedinConnected ? "Connected" : "Not connected"}</strong>
            </p>
            <button type="button" className="button-linkedin" onClick={connectLinkedin}>
              {linkedinConnected ? "Sign in again with LinkedIn" : "Sign in with LinkedIn"}
            </button>
            <button type="submit" disabled={isImportingLinkedin || !linkedinConnected}>
              {isImportingLinkedin ? "Importing..." : "Import LinkedIn Profile"}
            </button>
          </form>
          <p className="muted">
            Imports your LinkedIn profile basics as one resume entry.
          </p>
        </article>
      </section>

      <section className="card card-wide">
        <div className="card-head">
          <h2>Match Resumes to Job</h2>
          <span className="card-tag">Ranking</span>
        </div>
        <div className="row">
          <select
            value={selectedJobId}
            onChange={(event) => setSelectedJobId(event.target.value)}
          >
            <option value="">Select job</option>
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.title}
              </option>
            ))}
          </select>
          <button type="button" onClick={runMatching}>
            Run Matching
          </button>
        </div>

        <div className="table-wrap">
          <table className="match-table">
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Final</th>
                <th>Semantic</th>
                <th>Skills</th>
                <th>Missing Skills</th>
              </tr>
            </thead>
            <tbody>
              {matches.map((result) => (
                <tr key={result.resume_id}>
                  <td>{result.candidate_name}</td>
                  <td className="score">{toPercent(result.final_score)}</td>
                  <td>{toPercent(result.semantic_score)}</td>
                  <td>{toPercent(result.skill_score)}</td>
                  <td>{result.missing_skills.join(", ") || "-"}</td>
                </tr>
              ))}
              {matches.length === 0 && (
                <tr>
                  <td colSpan="5" className="muted">
                    No matching results yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
