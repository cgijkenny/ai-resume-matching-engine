import { useEffect, useState } from "react";
import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "",
  timeout: 60000
});

const defaultGmailStatus = {
  connected: false,
  configured: false,
  ready_for_browser_oauth: false,
  client_type: "missing",
  callback_url: "",
  default_label: "",
  message: ""
};

function parseCsv(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function toPercent(value) {
  return `${(Math.max(0, Math.min(1, Number(value) || 0)) * 100).toFixed(1)}%`;
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
  const statusCode = Number(error?.response?.status || 0);
  if (statusCode === 503) {
    return "Server is temporarily busy. Wait 30-60 seconds, then retry with max emails set to 1-3.";
  }
  const detail = readApiDetail(error?.response?.data?.detail);
  if (detail) {
    return detail;
  }
  if (typeof error?.message === "string" && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

function scoreBand(score) {
  if (score >= 0.75) {
    return "Shortlist";
  }
  if (score >= 0.5) {
    return "Review";
  }
  return "Low Fit";
}

export default function App() {
  const [health, setHealth] = useState("checking");
  const [jobs, setJobs] = useState([]);
  const [resumes, setResumes] = useState([]);
  const [gmailStatus, setGmailStatus] = useState(defaultGmailStatus);
  const [linkedinConnected, setLinkedinConnected] = useState(false);
  const [matches, setMatches] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const [jobTitle, setJobTitle] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [jobSkills, setJobSkills] = useState("");

  const [uploadName, setUploadName] = useState("");
  const [uploadSkills, setUploadSkills] = useState("");
  const [uploadFile, setUploadFile] = useState(null);
  const [gmailMaxMessages, setGmailMaxMessages] = useState(5);
  const [gmailQuery, setGmailQuery] = useState("");
  const [gmailLabel, setGmailLabel] = useState("");
  const [isImportingGmail, setIsImportingGmail] = useState(false);
  const [isImportingLinkedin, setIsImportingLinkedin] = useState(false);
  const [isImportingCombined, setIsImportingCombined] = useState(false);
  const [isRunningMatch, setIsRunningMatch] = useState(false);

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
      setJobs(jobsRes.data);
      setResumes(resumesRes.data);
      setGmailStatus({
        ...defaultGmailStatus,
        ...gmailStatusRes.data
      });
      setLinkedinConnected(Boolean(linkedinStatusRes.data.connected));

      if (!selectedJobId && jobsRes.data.length > 0) {
        setSelectedJobId(String(jobsRes.data[0].id));
      }
    } catch {
      setHealth("offline");
      setGmailStatus(defaultGmailStatus);
      setLinkedinConnected(false);
      setErrorMessage("Backend API is offline. Start the backend server on port 8000.");
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
      setStatusMessage("Gmail connected successfully. You can now import resumes.");
      setErrorMessage("");
      loadDashboard();
    } else if (gmailAuth === "error") {
      setErrorMessage(message || "Gmail authorization failed.");
    }

    if (linkedinAuth === "connected") {
      setStatusMessage("LinkedIn connected successfully. You can now import profile data.");
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

    if (!gmailStatus.connected) {
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
      setStatusMessage("Job profile created successfully.");
    } catch (error) {
      setErrorMessage(apiErrorMessage(error, "Failed to create job."));
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
      setStatusMessage("Resume uploaded successfully.");
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
        setStatusMessage("No resume attachments found for the current Gmail filters.");
      } else {
        setStatusMessage(`Gmail import finished. Added ${data.imported_count} and skipped ${data.skipped_count}.`);
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

  async function importFromLinkedin() {
    setErrorMessage("");
    setStatusMessage("");
    setIsImportingLinkedin(true);

    try {
      const response = await api.post("/api/v1/resumes/import/linkedin");
      setResumes((current) => [...current, response.data]);
      setStatusMessage("LinkedIn profile imported successfully.");
    } catch (error) {
      setErrorMessage(apiErrorMessage(error, "LinkedIn import failed."));
    } finally {
      setIsImportingLinkedin(false);
    }
  }

  async function importFromBothSources() {
    if (!gmailStatus.connected || !linkedinConnected) {
      setErrorMessage("Connect both Gmail and LinkedIn before running combined import.");
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

      const warnings = Array.isArray(data.warnings) && data.warnings.length > 0 ? ` ${data.warnings[0]}` : "";
      setStatusMessage(
        `Combined import finished. Gmail added ${data.gmail_imported_count}, LinkedIn added ${data.linkedin_imported_count}.${warnings}`
      );

      if (Array.isArray(data.errors) && data.errors.length > 0) {
        setErrorMessage(data.errors[0]);
      }
    } catch (error) {
      setErrorMessage(apiErrorMessage(error, "Combined import failed."));
    } finally {
      setIsImportingCombined(false);
    }
  }

  async function runMatching() {
    if (!selectedJobId) {
      setErrorMessage("Create or select a job first.");
      return;
    }

    setErrorMessage("");
    setStatusMessage("");
    setIsRunningMatch(true);

    try {
      const response = await api.post(`/api/v1/resumes/match/${selectedJobId}`);
      setMatches(response.data);
      setStatusMessage("Candidate screening completed.");
    } catch (error) {
      setErrorMessage(apiErrorMessage(error, "Matching failed."));
    } finally {
      setIsRunningMatch(false);
    }
  }

  const gmailConnected = Boolean(gmailStatus.connected);
  const gmailReady = Boolean(gmailStatus.ready_for_browser_oauth);
  const healthClass =
    health === "ok" ? "chip-ok" : health === "offline" ? "chip-offline" : "chip-pending";
  const healthLabel = typeof health === "string" ? health.toUpperCase() : String(health);
  const gmailSetupTone = gmailConnected ? "is-connected" : gmailReady ? "is-pending" : "is-disconnected";
  const gmailSetupLabel = gmailConnected
    ? "Connected"
    : gmailReady
      ? "Ready to connect"
      : "Setup required";

  const selectedJob = jobs.find((job) => String(job.id) === String(selectedJobId)) || null;
  const rankedMatches = [...matches].sort((left, right) => right.final_score - left.final_score);
  const topCandidates = rankedMatches.slice(0, 5);
  const averageFinalScore =
    rankedMatches.length > 0 ? rankedMatches.reduce((sum, item) => sum + item.final_score, 0) / rankedMatches.length : 0;
  const averageSemanticScore =
    rankedMatches.length > 0 ? rankedMatches.reduce((sum, item) => sum + item.semantic_score, 0) / rankedMatches.length : 0;
  const averageSkillScore =
    rankedMatches.length > 0 ? rankedMatches.reduce((sum, item) => sum + item.skill_score, 0) / rankedMatches.length : 0;

  const shortlistCount = rankedMatches.filter((item) => item.final_score >= 0.75).length;
  const reviewCount = rankedMatches.filter((item) => item.final_score >= 0.5 && item.final_score < 0.75).length;
  const lowFitCount = rankedMatches.filter((item) => item.final_score < 0.5).length;
  const evaluatedCount = rankedMatches.length;
  const totalForChart = Math.max(1, evaluatedCount);

  const shortlistPercent = (shortlistCount / totalForChart) * 100;
  const reviewPercent = (reviewCount / totalForChart) * 100;
  const lowFitPercent = (lowFitCount / totalForChart) * 100;
  const sourceCompletion = resumes.length > 0 ? Math.min(1, evaluatedCount / resumes.length) : 0;

  const missingSkillMap = rankedMatches.reduce((acc, item) => {
    item.missing_skills.forEach((skill) => {
      acc[skill] = (acc[skill] || 0) + 1;
    });
    return acc;
  }, {});

  const topSkillGaps = Object.entries(missingSkillMap)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5);

  const donutStyle = {
    background: `conic-gradient(
      #0a6cad 0% ${shortlistPercent}%,
      #21a28c ${shortlistPercent}% ${shortlistPercent + reviewPercent}%,
      #d7e4ef ${shortlistPercent + reviewPercent}% 100%
    )`
  };

  return (
    <main className="layout">
      <header className="hero">
        <p className="hero-topline">AI-Powered HR Screening Dashboard</p>
        <h1>One Stop Resume Engine</h1>
        <p className="hero-subtitle">
          Screen candidates from Gmail, LinkedIn, and uploaded resumes in one simple workflow for HR teams.
        </p>
        <div className="hero-metrics">
          <p className={`metric-chip ${healthClass}`}>
            API <strong>{healthLabel}</strong>
          </p>
          <p className="metric-chip">
            Active Jobs <strong>{jobs.length}</strong>
          </p>
          <p className="metric-chip">
            Candidate Pool <strong>{resumes.length}</strong>
          </p>
          <p className={`metric-chip ${gmailConnected ? "chip-ok" : "chip-pending"}`}>
            Gmail <strong>{gmailConnected ? "CONNECTED" : "PENDING"}</strong>
          </p>
          <p className={`metric-chip ${linkedinConnected ? "chip-ok" : "chip-pending"}`}>
            LinkedIn <strong>{linkedinConnected ? "CONNECTED" : "PENDING"}</strong>
          </p>
        </div>
      </header>

      {(statusMessage || errorMessage) && (
        <section className="status-panel">
          {statusMessage && <p className="status-ok status-note">{statusMessage}</p>}
          {errorMessage && <p className="status-error status-note">{errorMessage}</p>}
        </section>
      )}

      <section className="workflow-strip">
        <article className="workflow-step">
          <span>1</span>
          <div>
            <strong>Connect Sources</strong>
            <p>Connect Gmail and LinkedIn once for the HR user.</p>
          </div>
        </article>
        <article className="workflow-step">
          <span>2</span>
          <div>
            <strong>Import Candidate Resumes</strong>
            <p>Pull resumes from portals and email attachments into one dashboard.</p>
          </div>
        </article>
        <article className="workflow-step">
          <span>3</span>
          <div>
            <strong>Run AI Screening</strong>
            <p>Generate ranked candidates, graphs, and shortlist insights instantly.</p>
          </div>
        </article>
      </section>

      <section className="grid dashboard-grid">
        <article className="card">
          <div className="card-head">
            <h2>Source Connections</h2>
            <span className="card-tag">HR Ready</span>
          </div>
          <div className="source-stack">
            <div className="source-box">
              <p className={`connection-status ${gmailSetupTone}`}>
                Gmail: <strong>{gmailSetupLabel}</strong>
              </p>
              <p className="source-copy">{gmailStatus.message || "Connect Gmail to import email attachments."}</p>
              {!gmailReady && (
                <p className="muted">
                  Redirect URI: <code>{gmailStatus.callback_url || "/api/v1/gmail/oauth/callback"}</code>
                </p>
              )}
              <button type="button" className="button-secondary" onClick={connectGmail}>
                {gmailConnected ? "Reconnect Gmail" : "Connect Gmail"}
              </button>
            </div>

            <div className="source-box">
              <p className={`connection-status ${linkedinConnected ? "is-connected" : "is-disconnected"}`}>
                LinkedIn: <strong>{linkedinConnected ? "Connected" : "Not connected"}</strong>
              </p>
              <p className="source-copy">Import LinkedIn profile data without leaving the dashboard.</p>
              <button type="button" className="button-linkedin" onClick={connectLinkedin}>
                {linkedinConnected ? "Reconnect LinkedIn" : "Connect LinkedIn"}
              </button>
            </div>
          </div>

          <button type="button" onClick={connectBothAccounts}>
            Connect Both Accounts
          </button>
        </article>

        <article className="card">
          <div className="card-head">
            <h2>Candidate Import</h2>
            <span className="card-tag">Naukri / Gmail / LinkedIn</span>
          </div>
          <form onSubmit={importFromGmail}>
            <button type="submit" disabled={isImportingGmail || !gmailConnected}>
              {isImportingGmail ? "Importing from Gmail..." : "Import from Gmail"}
            </button>
            <button
              type="button"
              onClick={importFromLinkedin}
              className="button-linkedin"
              disabled={isImportingLinkedin || !linkedinConnected}
            >
              {isImportingLinkedin ? "Importing LinkedIn..." : "Import from LinkedIn"}
            </button>
            <button
              type="button"
              onClick={importFromBothSources}
              disabled={isImportingCombined || !gmailConnected || !linkedinConnected}
            >
              {isImportingCombined ? "Importing All Sources..." : "Import All Connected Sources"}
            </button>

            <details className="advanced-options">
              <summary>Email filters (optional)</summary>
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
                  placeholder="Gmail label"
                />
                <input
                  value={gmailQuery}
                  onChange={(event) => setGmailQuery(event.target.value)}
                  placeholder="Extra Gmail search query"
                />
              </div>
            </details>

            <button type="button" className="button-ghost" onClick={loadDashboard}>
              Refresh Dashboard
            </button>
          </form>
        </article>

        <article className="card">
          <div className="card-head">
            <h2>Create Job Role</h2>
            <span className="card-tag">For Screening</span>
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
            <button type="submit">Create Job</button>
          </form>
          <ul className="job-list">
            {jobs.map((job) => (
              <li key={job.id}>
                <strong>{job.title}</strong>
              </li>
            ))}
            {jobs.length === 0 && <li className="muted">No job roles created yet.</li>}
          </ul>
        </article>

        <article className="card">
          <div className="card-head">
            <h2>Upload Resume</h2>
            <span className="card-tag">Fallback Option</span>
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
            <button type="submit">Upload Resume</button>
          </form>
          <p className="muted">Use this when a resume is shared manually outside the connected sources.</p>
        </article>
      </section>

      <section className="card card-wide screening-card">
        <div className="card-head">
          <h2>Screening Control Center</h2>
          <span className="card-tag">Final Demo</span>
        </div>

        <div className="screening-toolbar">
          <select value={selectedJobId} onChange={(event) => setSelectedJobId(event.target.value)}>
            <option value="">Select job role</option>
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.title}
              </option>
            ))}
          </select>
          <button type="button" onClick={runMatching}>
            {isRunningMatch ? "Running Screening..." : "Run AI Screening"}
          </button>
        </div>

        <div className="summary-grid">
          <article className="summary-card">
            <p>Selected Role</p>
            <strong>{selectedJob?.title || "No role selected"}</strong>
          </article>
          <article className="summary-card">
            <p>Candidates Evaluated</p>
            <strong>{evaluatedCount}</strong>
          </article>
          <article className="summary-card">
            <p>Shortlisted</p>
            <strong>{shortlistCount}</strong>
          </article>
          <article className="summary-card">
            <p>Average Match Score</p>
            <strong>{toPercent(averageFinalScore)}</strong>
          </article>
        </div>

        <div className="analytics-grid">
          <article className="insight-card">
            <div className="insight-head">
              <h3>Candidate Fit Distribution</h3>
              <span>Graph</span>
            </div>
            {evaluatedCount > 0 ? (
              <div className="distribution-layout">
                <div className="donut-chart" style={donutStyle}>
                  <div className="donut-hole">
                    <strong>{evaluatedCount}</strong>
                    <span>screened</span>
                  </div>
                </div>
                <div className="legend-list">
                  <div className="legend-item">
                    <span className="legend-dot dot-shortlist" />
                    <p>Shortlist</p>
                    <strong>{shortlistCount}</strong>
                  </div>
                  <div className="legend-item">
                    <span className="legend-dot dot-review" />
                    <p>Review</p>
                    <strong>{reviewCount}</strong>
                  </div>
                  <div className="legend-item">
                    <span className="legend-dot dot-lowfit" />
                    <p>Low Fit</p>
                    <strong>{lowFitCount}</strong>
                  </div>
                </div>
              </div>
            ) : (
              <p className="muted">Run AI screening to generate the fit distribution graph.</p>
            )}
          </article>

          <article className="insight-card">
            <div className="insight-head">
              <h3>Top Candidate Scores</h3>
              <span>Bar Graph</span>
            </div>
            {topCandidates.length > 0 ? (
              <div className="bar-chart">
                {topCandidates.map((candidate) => (
                  <div key={candidate.resume_id} className="bar-row">
                    <div className="bar-row-head">
                      <p>{candidate.candidate_name}</p>
                      <strong>{toPercent(candidate.final_score)}</strong>
                    </div>
                    <div className="progress-track tall">
                      <div className="progress-fill final" style={{ width: toPercent(candidate.final_score) }} />
                    </div>
                    <p className="bar-caption">{scoreBand(candidate.final_score)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">Candidate score graph will appear after screening.</p>
            )}
          </article>

          <article className="insight-card">
            <div className="insight-head">
              <h3>Screening KPIs</h3>
              <span>Performance</span>
            </div>
            <div className="kpi-stack">
              <div className="kpi-line">
                <label>Average Final Score</label>
                <strong>{toPercent(averageFinalScore)}</strong>
                <div className="progress-track">
                  <div className="progress-fill final" style={{ width: toPercent(averageFinalScore) }} />
                </div>
              </div>
              <div className="kpi-line">
                <label>Semantic Match</label>
                <strong>{toPercent(averageSemanticScore)}</strong>
                <div className="progress-track">
                  <div className="progress-fill semantic" style={{ width: toPercent(averageSemanticScore) }} />
                </div>
              </div>
              <div className="kpi-line">
                <label>Skill Match</label>
                <strong>{toPercent(averageSkillScore)}</strong>
                <div className="progress-track">
                  <div className="progress-fill skills" style={{ width: toPercent(averageSkillScore) }} />
                </div>
              </div>
              <div className="kpi-line">
                <label>Coverage</label>
                <strong>{toPercent(sourceCompletion)}</strong>
                <div className="progress-track">
                  <div className="progress-fill coverage" style={{ width: toPercent(sourceCompletion) }} />
                </div>
              </div>
            </div>
          </article>

          <article className="insight-card">
            <div className="insight-head">
              <h3>Top Missing Skills</h3>
              <span>Gap Analysis</span>
            </div>
            {topSkillGaps.length > 0 ? (
              <div className="gap-list">
                {topSkillGaps.map(([skill, count]) => (
                  <div key={skill} className="gap-row">
                    <div className="gap-row-head">
                      <p>{skill}</p>
                      <strong>{count}</strong>
                    </div>
                    <div className="progress-track">
                      <div
                        className="progress-fill readiness"
                        style={{ width: `${Math.max(18, (count / evaluatedCount) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">Missing skill analysis will appear after screening.</p>
            )}
          </article>
        </div>

        <div className="table-wrap">
          <table className="match-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Candidate</th>
                <th>Status</th>
                <th>Final Score</th>
                <th>Semantic</th>
                <th>Skills</th>
                <th>Missing Skills</th>
              </tr>
            </thead>
            <tbody>
              {rankedMatches.map((result, index) => (
                <tr key={result.resume_id}>
                  <td>#{index + 1}</td>
                  <td>{result.candidate_name}</td>
                  <td>
                    <span className={`result-badge badge-${scoreBand(result.final_score).toLowerCase().replace(" ", "")}`}>
                      {scoreBand(result.final_score)}
                    </span>
                  </td>
                  <td className="score">{toPercent(result.final_score)}</td>
                  <td>{toPercent(result.semantic_score)}</td>
                  <td>{toPercent(result.skill_score)}</td>
                  <td>{result.missing_skills.join(", ") || "-"}</td>
                </tr>
              ))}
              {rankedMatches.length === 0 && (
                <tr>
                  <td colSpan="7" className="muted table-empty">
                    No screening results yet. Create a job, import candidates, then run AI screening.
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
