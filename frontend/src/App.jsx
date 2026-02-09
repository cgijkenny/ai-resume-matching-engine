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

  async function loadDashboard() {
    try {
      const [healthRes, jobsRes, resumesRes] = await Promise.all([
        api.get("/api/v1/health"),
        api.get("/api/v1/jobs"),
        api.get("/api/v1/resumes")
      ]);
      setHealth(healthRes.data.status);
      setErrorMessage("");
      setJobs(jobsRes.data);
      setResumes(resumesRes.data);
      if (!selectedJobId && jobsRes.data.length > 0) {
        setSelectedJobId(String(jobsRes.data[0].id));
      }
    } catch {
      setHealth("offline");
      setErrorMessage("Backend API is offline. Start backend server on port 8000.");
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

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

  return (
    <main className="layout">
      <header className="hero">
        <h1>AI Resume Screening and Job Matching Engine</h1>
        <p>API status: <strong>{health}</strong></p>
      </header>

      {(statusMessage || errorMessage) && (
        <section className="status-panel">
          {statusMessage && <p className="status-ok">{statusMessage}</p>}
          {errorMessage && <p className="status-error">{errorMessage}</p>}
        </section>
      )}

      <section className="grid">
        <article className="card">
          <h2>Create Job</h2>
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
          <ul>
            {jobs.map((job) => (
              <li key={job.id}>
                <strong>{job.title}</strong>
              </li>
            ))}
          </ul>
        </article>

        <article className="card">
          <h2>Add Resume Text</h2>
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
          <h2>Upload Resume File</h2>
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
          <p>Total resumes: {resumes.length}</p>
        </article>

        <article className="card">
          <h2>Import from Gmail</h2>
          <form onSubmit={importFromGmail}>
            <input
              type="number"
              min="1"
              max="100"
              value={gmailMaxMessages}
              onChange={(event) => {
                const value = Number(event.target.value);
                setGmailMaxMessages(Number.isNaN(value) ? 20 : value);
              }}
              placeholder="Max emails to scan"
              required
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
            <button type="submit" disabled={isImportingGmail}>
              {isImportingGmail ? "Importing..." : "Connect and Import"}
            </button>
            <button type="button" onClick={loadDashboard}>
              Refresh API Status
            </button>
          </form>
          {isImportingGmail && <p>Import in progress...</p>}
        </article>
      </section>

      <section className="card">
        <h2>Match Resumes to Job</h2>
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

        <table>
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
                <td>{toPercent(result.final_score)}</td>
                <td>{toPercent(result.semantic_score)}</td>
                <td>{toPercent(result.skill_score)}</td>
                <td>{result.missing_skills.join(", ") || "-"}</td>
              </tr>
            ))}
            {matches.length === 0 && (
              <tr>
                <td colSpan="5">No matching results yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
