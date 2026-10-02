import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Accessibility,
  ArrowDownUp,
  ArrowRight,
  Bell,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Droplets,
  Filter,
  Plus,
  Search,
  ShieldCheck,
  ThumbsUp,
  Wifi,
  Zap,
} from "lucide-react";
import {
  createIssue,
  fetchCampusConfig,
  fetchIssues,
  fetchVotedIssueIds,
  setIssueStatus,
  signInAdmin,
  signOutAdmin,
  toggleIssueVote,
  type Category,
  type Issue,
  type IssueDraft,
  type Status,
} from "./api";
import "./App.css";

const categories: Category[] = [
  "Wi-Fi",
  "Water",
  "Electricity",
  "Classroom",
  "Restroom",
  "Canteen",
  "Accessibility",
];
const statusOptions: Status[] = [
  "Reported",
  "Assigned",
  "In progress",
  "Resolved",
];
const today = new Date()
  .toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  })
  .toUpperCase();

function readPreference(key: string) {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function formatAge(value: string) {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  if (!Number.isFinite(elapsed)) return "Recently";
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  return new Date(value).toLocaleDateString();
}

function App() {
  const [collegeName, setCollegeName] = useState("Agni College of Technology");
  const [issues, setIssues] = useState<Issue[]>([]);
  const [view, setView] = useState<"Overview" | "All issues" | "My activity">(
    "Overview",
  );
  const [role, setRole] = useState<"Student" | "Admin">("Student");
  const [reporterName, setReporterName] = useState(() =>
    readPreference("campusbuddy.reporterName"),
  );
  const [department, setDepartment] = useState(() =>
    readPreference("campusbuddy.department"),
  );
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All categories");
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [sortByImpact, setSortByImpact] = useState(true);
  const [showReportForm, setShowReportForm] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminError, setAdminError] = useState("");
  const [selectedFile, setSelectedFile] = useState("");
  const [votedIds, setVotedIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [apiError, setApiError] = useState("");
  const [form, setForm] = useState<IssueDraft>({
    title: "",
    description: "",
    category: "Wi-Fi",
    location: "",
    priority: "Medium",
    reportedBy: reporterName,
    department,
  });

  async function loadCampusData() {
    try {
      const [config, savedIssues, savedVotes] = await Promise.all([
        fetchCampusConfig(),
        fetchIssues(),
        fetchVotedIssueIds(),
      ]);
      setCollegeName(config.collegeName);
      setIssues(savedIssues);
      setVotedIds(savedVotes);
      setApiError("");
    } catch (error) {
      setApiError(
        error instanceof Error
          ? error.message
          : "Could not connect to the CampusBuddy server.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    Promise.all([fetchCampusConfig(), fetchIssues(), fetchVotedIssueIds()])
      .then(([config, savedIssues, savedVotes]) => {
        if (!active) return;
        setCollegeName(config.collegeName);
        setIssues(savedIssues);
        setVotedIds(savedVotes);
        setApiError("");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setApiError(
          error instanceof Error
            ? error.message
            : "Could not connect to the CampusBuddy server.",
        );
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const filteredIssues = useMemo(() => {
    const filtered = issues.filter((issue) => {
      const matchesSearch =
        `${issue.title} ${issue.description} ${issue.location} ${issue.id}`
          .toLowerCase()
          .includes(search.toLowerCase());
      const matchesCategory =
        categoryFilter === "All categories" ||
        issue.category === categoryFilter;
      const matchesStatus =
        statusFilter === "All statuses" || issue.status === statusFilter;
      const isOpenOverviewIssue =
        view !== "Overview" ||
        statusFilter !== "All statuses" ||
        issue.status !== "Resolved";
      const matchesView =
        view !== "My activity" ||
        (Boolean(reporterName.trim()) &&
          issue.reportedBy.toLowerCase() === reporterName.trim().toLowerCase());
      return (
        matchesSearch &&
        matchesCategory &&
        matchesStatus &&
        matchesView &&
        isOpenOverviewIssue
      );
    });
    return [...filtered].sort((a, b) =>
      sortByImpact
        ? b.supporters - a.supporters
        : Number(b.id.slice(3)) - Number(a.id.slice(3)),
    );
  }, [
    issues,
    search,
    categoryFilter,
    statusFilter,
    sortByImpact,
    view,
    reporterName,
  ]);

  const openIssues = issues.filter(
    (issue) => issue.status !== "Resolved",
  ).length;
  const highPriorityIssues = issues.filter(
    (issue) => issue.priority === "High" && issue.status !== "Resolved",
  ).length;
  const resolvedIssues = issues.filter(
    (issue) => issue.status === "Resolved",
  ).length;
  const topCategories = categories
    .map((category) => ({
      category,
      count: issues.filter((issue) => issue.category === category).length,
    }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  async function submitIssue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setApiError("");
    try {
      const nextIssue = await createIssue({
        ...form,
        title: form.title.trim(),
        description: form.description.trim(),
        location: form.location.trim(),
        reportedBy: form.reportedBy.trim(),
        department: form.department.trim(),
        ...(selectedFile ? { image: selectedFile } : {}),
      });
      setIssues((current) => [nextIssue, ...current]);
      setReporterName(nextIssue.reportedBy);
      setDepartment(nextIssue.department);
      try {
        localStorage.setItem("campusbuddy.reporterName", nextIssue.reportedBy);
        localStorage.setItem("campusbuddy.department", nextIssue.department);
      } catch {
        /* Preferences are optional; the report is already saved on the server. */
      }
      setView("All issues");
      setShowReportForm(false);
      setForm({
        title: "",
        description: "",
        category: "Wi-Fi",
        location: "",
        priority: "Medium",
        reportedBy: nextIssue.reportedBy,
        department: nextIssue.department,
      });
      setSelectedFile("");
    } catch (error) {
      setApiError(
        error instanceof Error ? error.message : "Could not save this report.",
      );
    }
  }

  async function updateStatus(issueId: string, status: Status) {
    setApiError("");
    try {
      const updatedIssue = await setIssueStatus(issueId, status);
      setIssues((current) =>
        current.map((issue) => (issue.id === issueId ? updatedIssue : issue)),
      );
    } catch (error) {
      setApiError(
        error instanceof Error
          ? error.message
          : "Could not update issue status.",
      );
    }
  }

  async function toggleVote(issue: Issue) {
    const alreadyVoted = votedIds.includes(issue.id);
    setApiError("");
    try {
      const updatedIssue = await toggleIssueVote(issue.id);
      setIssues((current) =>
        current.map((item) => (item.id === issue.id ? updatedIssue : item)),
      );
      setVotedIds((current) =>
        alreadyVoted
          ? current.filter((id) => id !== issue.id)
          : [...current, issue.id],
      );
    } catch (error) {
      setApiError(
        error instanceof Error
          ? error.message
          : "Could not update your support vote.",
      );
    }
  }

  async function switchRole() {
    setApiError("");
    if (role === "Admin") {
      try {
        await signOutAdmin();
      } finally {
        setRole("Student");
      }
      return;
    }
    setAdminPassword("");
    setAdminError("");
    setShowAdminLogin(true);
  }

  async function submitAdminLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await signInAdmin(adminPassword);
      setRole("Admin");
      setShowAdminLogin(false);
      setAdminPassword("");
    } catch (error) {
      setAdminError(
        error instanceof Error ? error.message : "Admin sign-in failed.",
      );
    }
  }

  const title =
    view === "Overview"
      ? "Campus issue overview"
      : view === "My activity"
        ? "My activity"
        : "Campus issues";
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#overview"
          onClick={() => setView("Overview")}
          aria-label="CampusBuddy home"
        >
          <span className="brand-mark">
            <span />
          </span>
          <span>
            campus<span className="brand-light">buddy</span>
          </span>
        </a>
        <div className="campus-switcher">
          <span className="campus-monogram">A</span>
          <span className="campus-copy">
            <strong>{collegeName}</strong>
            <small>College campus</small>
          </span>
          <ChevronDown size={15} />
        </div>
        <span className="nav-label">WORKSPACE</span>
        <nav className="main-nav" aria-label="Main navigation">
          <button
            className={view === "Overview" ? "nav-item active" : "nav-item"}
            onClick={() => setView("Overview")}
          >
            <span className="nav-icon">
              <ArrowDownUp size={17} />
            </span>
            Overview
          </button>
          <button
            className={view === "All issues" ? "nav-item active" : "nav-item"}
            onClick={() => setView("All issues")}
          >
            <span className="nav-icon">
              <CircleHelp size={17} />
            </span>
            Issue reports<span className="nav-count">{openIssues}</span>
          </button>
          <button
            className={view === "My activity" ? "nav-item active" : "nav-item"}
            onClick={() => setView("My activity")}
          >
            <span className="nav-icon">
              <Clock3 size={17} />
            </span>
            My activity
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card">
            <span className="help-icon">
              <Accessibility size={17} />
            </span>
            <strong>Make campus better</strong>
            <p>Every report helps someone in our community.</p>
            <button onClick={() => setShowReportForm(true)}>
              Share an issue <ArrowRight size={14} />
            </button>
          </div>
          <button className="profile-row" onClick={() => void switchRole()}>
            <span className="avatar">
              {reporterName.slice(0, 2).toUpperCase() || "ST"}
            </span>
            <span className="profile-name">
              <strong>{reporterName || "Campus student"}</strong>
              <small>{role} view · switch role</small>
            </span>
            <ChevronDown size={15} />
          </button>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="breadcrumb">
            <span>{collegeName}</span>
            <span className="breadcrumb-separator">/</span>
            <strong>{view}</strong>
          </div>
          <div className="topbar-actions">
            <label className="search-box">
              <Search size={16} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search issues..."
                aria-label="Search issues"
              />
              <kbd>⌘ K</kbd>
            </label>
            <button
              className="icon-button notification-button"
              aria-label="Notifications"
            >
              <Bell size={18} />
              <i />
            </button>
            <button className="role-switch" onClick={() => void switchRole()}>
              <ShieldCheck size={15} />
              {role}
              <ChevronDown size={14} />
            </button>
          </div>
        </header>

        <div className="page-content">
          <section className="page-heading">
            <div>
              <div className="eyebrow">
                <span className="live-dot" /> {today}
              </div>
              <h1>
                {title}
                <span className="wave">.</span>
              </h1>
              <p>
                {view === "Overview"
                  ? `Live reports from ${collegeName}.`
                  : view === "My activity"
                    ? "Track reports submitted with your name."
                    : "Report an issue, add support, and follow its progress."}
              </p>
            </div>
            <button
              className="primary-button"
              onClick={() => setShowReportForm(true)}
            >
              <Plus size={17} /> Report an issue
            </button>
          </section>

          {apiError && (
            <div className="api-error" role="alert">
              <span>{apiError}</span>
              <button onClick={() => { setIsLoading(true); void loadCampusData(); }}>Retry</button>
            </div>
          )}

          {apiError && (
            <div className="api-error" role="alert">
              <span>{apiError}</span>
              <button onClick={() => { setIsLoading(true); void loadCampusData(); }}>Retry</button>
            </div>
          )}

          {view === "Overview" && (
            <>
              <section className="stat-grid" aria-label="Campus issue summary">
                <article className="stat-card">
                  <div className="stat-top">
                    <span>Open issues</span>
                    <span className="stat-icon orange">
                      <CircleHelp size={17} />
                    </span>
                  </div>
                  <div className="stat-value">
                    {String(openIssues).padStart(2, "0")}
                    <span className="stat-change">currently open</span>
                  </div>
                  <div className="stat-foot">
                    <span className="stat-bar">
                      <i
                        style={{ width: `${Math.min(openIssues * 9, 100)}%` }}
                      />
                    </span>
                    <span>need attention</span>
                  </div>
                </article>
                <article className="stat-card">
                  <div className="stat-top">
                    <span>High priority</span>
                    <span className="stat-icon red">
                      <Zap size={17} />
                    </span>
                  </div>
                  <div className="stat-value">
                    {String(highPriorityIssues).padStart(2, "0")}
                    <span className="stat-change urgent">
                      {highPriorityIssues > 0 ? "Needs a look" : "All clear"}
                    </span>
                  </div>
                  <div className="stat-foot">
                    <span className="stat-bar red-bar">
                      <i
                        style={{
                          width: `${Math.min(highPriorityIssues * 18, 100)}%`,
                        }}
                      />
                    </span>
                    <span>flagged by students</span>
                  </div>
                </article>
                <article className="stat-card">
                  <div className="stat-top">
                    <span>Resolved issues</span>
                    <span className="stat-icon green">
                      <Check size={17} />
                    </span>
                  </div>
                  <div className="stat-value">
                    {String(resolvedIssues).padStart(2, "0")}
                    <span className="stat-change positive">completed</span>
                  </div>
                  <div className="stat-foot">
                    <span className="stat-bar green-bar">
                      <i
                        style={{
                          width: `${issues.length ? (resolvedIssues / issues.length) * 100 : 0}%`,
                        }}
                      />
                    </span>
                    <span>of all reports</span>
                  </div>
                </article>
              </section>

              <section className="feature-row">
                <article className="pulse-card">
                  <div className="pulse-content">
                    <span className="section-kicker">
                      CAMPUS PULSE{" "}
                      <span className="live-pill">
                        <i /> LIVE
                      </span>
                    </span>
                    <h2>
                      Small fixes.
                      <br />A better campus.
                    </h2>
                    <p>
                      {issues.length
                        ? `${openIssues} reports need attention across ${collegeName}.`
                        : "The issue board is ready for your first campus report."}
                    </p>
                    <button
                      className="text-button"
                      onClick={() => setView("All issues")}
                    >
                      See campus reports <ArrowRight size={15} />
                    </button>
                  </div>
                  <div className="campus-art" aria-hidden="true">
                    <div className="art-sun" />
                    <div className="art-building building-one">
                      <i />
                      <i />
                      <i />
                      <i />
                    </div>
                    <div className="art-building building-two">
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                    </div>
                    <div className="art-path" />
                    <span className="art-pin pin-one">
                      <Droplets size={13} />
                    </span>
                    <span className="art-pin pin-two">
                      <Wifi size={13} />
                    </span>
                    <span className="art-tree tree-one" />
                    <span className="art-tree tree-two" />
                  </div>
                </article>
                <article className="category-card">
                  <div className="card-heading">
                    <div>
                      <span className="section-kicker">TOP CATEGORIES</span>
                      <h2>What students report</h2>
                    </div>
                    <button
                      className="subtle-icon"
                      aria-label="View all categories"
                      onClick={() => setView("All issues")}
                    >
                      <ArrowRight size={16} />
                    </button>
                  </div>
                  <div className="category-bars">
                    {topCategories.length ? (
                      topCategories.map((item, index) => (
                        <button
                          key={item.category}
                          className="category-row"
                          onClick={() => {
                            setCategoryFilter(item.category);
                            setView("All issues");
                          }}
                        >
                          <span
                            className={`category-icon ${["bar-blue", "bar-orange", "bar-teal"][index]}`}
                          >
                            {item.category === "Water" ? (
                              <Droplets size={16} />
                            ) : item.category === "Wi-Fi" ? (
                              <Wifi size={16} />
                            ) : (
                              <Zap size={16} />
                            )}
                          </span>
                          <span className="category-name">
                            {item.category}
                            <small>
                              {item.count} report{item.count === 1 ? "" : "s"}
                            </small>
                          </span>
                          <span className="category-progress">
                            <i
                              className={
                                ["bar-blue", "bar-orange", "bar-teal"][index]
                              }
                              style={{
                                width: `${Math.min(item.count * 12, 100)}%`,
                              }}
                            />
                          </span>
                        </button>
                      ))
                    ) : (
                      <p className="no-category-data">
                        Categories will appear here as reports are submitted.
                      </p>
                    )}
                  </div>
                  <button
                    className="all-categories"
                    onClick={() => {
                      setCategoryFilter("All categories");
                      setView("All issues");
                    }}
                  >
                    View all issues <ArrowRight size={14} />
                  </button>
                </article>
              </section>
            </>
          )}

          <section className="issues-section">
            <div className="section-heading">
              <div>
                <span className="section-kicker">
                  {view === "My activity" ? "YOUR REPORTS" : "COMMUNITY BOARD"}
                </span>
                <h2>
                  {view === "Overview"
                    ? "Needs attention"
                    : view === "My activity"
                      ? "Your submitted issues"
                      : "All campus issues"}
                  <span className="heading-count">{filteredIssues.length}</span>
                </h2>
              </div>
              <div className="list-actions">
                <label className="filter-select">
                  <Filter size={14} />
                  <select
                    aria-label="Filter by category"
                    value={categoryFilter}
                    onChange={(event) => setCategoryFilter(event.target.value)}
                  >
                    <option>All categories</option>
                    {categories.map((category) => (
                      <option key={category}>{category}</option>
                    ))}
                  </select>
                  <ChevronDown size={13} />
                </label>
                <label className="filter-select status-select">
                  <select
                    aria-label="Filter by status"
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value)}
                  >
                    <option>All statuses</option>
                    {statusOptions.map((status) => (
                      <option key={status}>{status}</option>
                    ))}
                  </select>
                  <ChevronDown size={13} />
                </label>
                <button
                  className="sort-button"
                  onClick={() => setSortByImpact((current) => !current)}
                >
                  <ArrowDownUp size={14} />
                  <span>{sortByImpact ? "Most supported" : "Newest"}</span>
                </button>
              </div>
            </div>
            {isLoading ? (
              <div className="empty-state">
                <Clock3 size={24} />
                <h3>Loading campus reports</h3>
                <p>Connecting to the Agni College issue database.</p>
              </div>
            ) : filteredIssues.length === 0 ? (
              <div className="empty-state">
                <CircleHelp size={24} />
                <h3>{issues.length === 0 ? "No campus reports yet" : "No reports match those filters"}</h3>
                <p>
                  {issues.length === 0
                    ? "Submit the first real report for your campus."
                    : "Try another search or clear a filter to see more campus issues."}
                </p>
                {issues.length === 0 ? (
                  <button className="text-button" onClick={() => setShowReportForm(true)}>
                    Report the first issue <ArrowRight size={15} />
                  </button>
                ) : (
                  <button className="text-button" onClick={() => { setSearch(""); setCategoryFilter("All categories"); setStatusFilter("All statuses"); }}>
                    Clear filters <ArrowRight size={15} />
                  </button>
                )}
              </div>
            ) : (
              <div className="issue-list">
                {filteredIssues
                  .slice(0, view === "Overview" ? 4 : undefined)
                  .map((issue) => (
                    <article className="issue-row" key={issue.id}>
                      <div
                        className={`issue-symbol ${issue.category === "Water" ? "water-symbol" : issue.category === "Accessibility" ? "access-symbol" : issue.category === "Wi-Fi" ? "wifi-symbol" : "facility-symbol"}`}
                      >
                        {issue.category === "Water" ? (
                          <Droplets size={19} />
                        ) : issue.category === "Accessibility" ? (
                          <Accessibility size={19} />
                        ) : issue.category === "Wi-Fi" ? (
                          <Wifi size={19} />
                        ) : (
                          <Zap size={19} />
                        )}
                      </div>
                      <div className="issue-main">
                        <div className="issue-title-line">
                          <h3>{issue.title}</h3>
                          {issue.priority === "High" && (
                            <span className="priority-tag">HIGH PRIORITY</span>
                          )}
                        </div>
                        <p>{issue.description}</p>
                        <div className="issue-meta">
                          <span>{issue.location}</span>
                          <i /> <span>{issue.reportedBy}</span>
                          <i /> <span>{formatAge(issue.createdAt)}</span>
                          <span className="issue-id">{issue.id}</span>
                        </div>
                        {issue.image && (
                          <img
                            className="issue-image"
                            src={issue.image}
                            alt="Attached campus issue"
                          />
                        )}
                      </div>
                      <div className="issue-actions">
                        <span
                          className={`status-badge status-${issue.status.toLowerCase().replace(" ", "-")}`}
                        >
                          <i />
                          {issue.status}
                        </span>
                        {role === "Admin" ? (
                          <label className="admin-status">
                            <span>Update</span>
                            <select
                              value={issue.status}
                              onChange={(event) =>
                                updateStatus(
                                  issue.id,
                                  event.target.value as Status,
                                )
                              }
                              aria-label={`Update status for ${issue.id}`}
                            >
                              {statusOptions.map((status) => (
                                <option key={status}>{status}</option>
                              ))}
                            </select>
                          </label>
                        ) : (
                          <button
                            className={
                              votedIds.includes(issue.id)
                                ? "vote-button voted"
                                : "vote-button"
                            }
                            onClick={() => toggleVote(issue)}
                            aria-label={`${votedIds.includes(issue.id) ? "Remove support from" : "Support"} ${issue.title}`}
                          >
                            <ThumbsUp
                              size={15}
                              fill={
                                votedIds.includes(issue.id)
                                  ? "currentColor"
                                  : "none"
                              }
                            />
                            <span>{issue.supporters}</span>
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
              </div>
            )}
            {view === "Overview" && filteredIssues.length > 0 && (
              <button
                className="view-all-button"
                onClick={() => setView("All issues")}
              >
                View all campus issues <ArrowRight size={15} />
              </button>
            )}
          </section>
          <footer className="page-footer">
            <span>
              CampusBuddy <span>·</span> {collegeName}
            </span>
            <span>
              <span className="footer-dot" />
              {isLoading ? "Connecting..." : apiError ? "Connection issue" : "Database connected"}
            </span>
          </footer>
        </div>
      </main>

      {showReportForm && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowReportForm(false);
          }}
        >
          <section
            className="report-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-title"
          >
            <div className="modal-heading">
              <div>
                <span className="section-kicker">{collegeName.toUpperCase()}</span>
                <h2 id="report-title">What needs fixing?</h2>
                <p>Enter the campus location and report details.</p>
              </div>
              <button
                className="modal-close"
                onClick={() => setShowReportForm(false)}
                aria-label="Close report form"
              >
                ×
              </button>
            </div>
            <form onSubmit={submitIssue}>
              <label className="form-field">
                Issue title
                <input
                  required
                  maxLength={90}
                  placeholder="e.g. Water fountain is leaking"
                  value={form.title}
                  onChange={(event) =>
                    setForm({ ...form, title: event.target.value })
                  }
                />
              </label>
              <label className="form-field">
                Tell us a little more
                <textarea
                  required
                  maxLength={1000}
                  rows={3}
                  placeholder="What happened, and who is affected?"
                  value={form.description}
                  onChange={(event) =>
                    setForm({ ...form, description: event.target.value })
                  }
                />
              </label>
              <div className="form-grid">
                <label className="form-field">
                  Category
                  <select
                    value={form.category}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        category: event.target.value as Category,
                      })
                    }
                  >
                    {categories.map((category) => (
                      <option key={category}>{category}</option>
                    ))}
                  </select>
                </label>
                <label className="form-field">
                  Campus location
                  <input
                    required
                    maxLength={120}
                    placeholder="e.g. CSE Block, second floor"
                    value={form.location}
                    onChange={(event) =>
                      setForm({ ...form, location: event.target.value })
                    }
                  />
                </label>
              </div>
              <div className="form-grid">
                <label className="form-field">
                  Your name
                  <input
                    required
                    maxLength={80}
                    autoComplete="name"
                    placeholder="Name shown on the report"
                    value={form.reportedBy}
                    onChange={(event) => setForm({ ...form, reportedBy: event.target.value })}
                  />
                </label>
                <label className="form-field">
                  Department (optional)
                  <input
                    maxLength={80}
                    placeholder="e.g. Computer Science"
                    value={form.department}
                    onChange={(event) => { setDepartment(event.target.value); setForm({ ...form, department: event.target.value }); }}
                  />
                </label>
              </div>
              <label className="form-field">
                Impact level
                <select
                  value={form.priority}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      priority: event.target.value as Issue["priority"],
                    })
                  }
                >
                  <option>Low</option>
                  <option>Medium</option>
                  <option>High</option>
                </select>
              </label>
              <label className="upload-field">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      if (file.size > 1_500_000) {
                        setSelectedFile("");
                        setApiError("Choose a photo smaller than 1.5 MB.");
                      } else {
                        const reader = new FileReader();
                        reader.onload = () => setSelectedFile(String(reader.result));
                        reader.readAsDataURL(file);
                      }
                    }
                  }}
                />
                <span className="upload-plus">
                  <Plus size={17} />
                </span>
                <span>
                  <strong>
                    {selectedFile ? "Photo attached" : "Add a photo"}{" "}
                    <small>Optional · image under 1.5 MB</small>
                  </strong>
                </span>
                {selectedFile && (
                  <img src={selectedFile} alt="Selected issue" />
                )}
              </label>
              <div className="form-footer">
                <span>
                  <ShieldCheck size={15} /> Your name is shared with campus
                  staff
                </span>
                <button className="primary-button" type="submit">
                  <Plus size={16} /> Submit report
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {showAdminLogin && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowAdminLogin(false);
          }}
        >
          <section
            className="report-modal admin-login-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-login-title"
          >
            <div className="modal-heading">
              <div>
                <span className="section-kicker">{collegeName.toUpperCase()}</span>
                <h2 id="admin-login-title">Admin sign in</h2>
                <p>Enter the password shown by the CampusBuddy server.</p>
              </div>
              <button
                className="modal-close"
                onClick={() => setShowAdminLogin(false)}
                aria-label="Close admin sign in"
              >
                ×
              </button>
            </div>
            <form onSubmit={submitAdminLogin}>
              <label className="form-field">
                Admin password
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={adminPassword}
                  onChange={(event) => setAdminPassword(event.target.value)}
                />
              </label>
              {adminError && <p className="upload-error" role="alert">{adminError}</p>}
              <div className="form-footer">
                <span>Status updates are restricted to admins.</span>
                <button className="primary-button" type="submit">Sign in</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

export default App;
