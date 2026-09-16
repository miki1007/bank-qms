import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  BrowserRouter,
  Navigate,
  NavLink,
  Route,
  Routes,
  useNavigate,
} from "react-router-dom";
import {
  Activity,
  ArrowRightLeft,
  BarChart3,
  BellRing,
  Building2,
  CheckCircle2,
  CirclePause,
  Download,
  FileClock,
  Gauge,
  LogOut,
  Play,
  RefreshCw,
  Settings,
  ShieldCheck,
  Square,
  Ticket,
  UserCog,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AuthUser } from "@qms/shared-types";
import { WorldLinkBrand } from "../../../packages/ui/src/index";
import "../../../packages/ui/src/theme.css";
import "./staff.css";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api/v1";
const queryClient = new QueryClient();
let accessToken = "";
let refreshPromise: Promise<User> | null = null;

async function refreshSession() {
  refreshPromise ??= fetch(`${API}/auth/refresh`, {
    method: "POST",
    credentials: "include",
  })
    .then(async (response) => {
      const payload = await response.json();
      if (!response.ok || !payload.accessToken || !payload.user) {
        throw new Error("Authentication expired.");
      }
      accessToken = payload.accessToken;
      return payload.user as User;
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

async function api<T>(
  path: string,
  init?: RequestInit,
  allowRefresh = true,
): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init?.headers,
    },
  });
  if (
    response.status === 401 &&
    allowRefresh &&
    !path.startsWith("/auth/login") &&
    !path.startsWith("/auth/refresh")
  ) {
    await refreshSession();
    return api<T>(path, init, false);
  }
  if (response.status === 204) return undefined as T;
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("text/csv")) return (await response.text()) as T;
  const payload = await response.json();
  if (!response.ok)
    throw new Error(payload.error?.message ?? "Request failed.");
  return payload;
}

type User = AuthUser & { branchCode: string; branchName: string };
type AdminOverviewResponse = {
  totalBranches: number;
  activeBranches: number;
  totalStaff: number;
  administrators: number;
  lockedStaff: number;
  activeServices: number;
  activeSessions: number;
};
type AdminBranch = {
  id: string;
  code: string;
  name: string;
  location: string | null;
  timezone: string;
  status: "ACTIVE" | "INACTIVE";
  _count: {
    staff: number;
    services: number;
    counters: number;
    tickets: number;
  };
};
type NamedService = { id: string; name: string; code?: string };
type ActiveTicket = {
  id: string;
  publicNumber: string;
  status: "CALLED" | "IN_SERVICE";
  noShowCount: number;
  recallCount: number;
  currentService?: { name: string };
};
type TellerSessionResponse = {
  session: {
    status: "OPEN" | "PAUSED";
    counter: { label: string };
    service: NamedService;
    activeTicket: ActiveTicket | null;
    queue: {
      waiting: number;
      oldestWaitSeconds: number;
    };
  } | null;
};
type AvailableCounter = {
  id: string;
  label: string;
  status: string;
  available: boolean;
  service?: { name: string } | null;
};
type ManagerService = NamedService & {
  averageServiceMinutes: number;
  status: string;
};
type ManagerCounter = {
  id: string;
  label: string;
  status: string;
  assignedService?: { name: string } | null;
  assignedStaff?: { id: string; name: string; username: string } | null;
};
type StaffListItem = {
  id: string;
  name: string;
  username: string;
  role: string;
  status: string;
  lastLoginAt: string | null;
  assignedCounter?: { id: string; label: string } | null;
};
type DashboardResponse = {
  kpis: { issued: number; waiting: number; active: number; completed: number };
  queues: Array<{
    id: string;
    code: string;
    name: string;
    oldestWaitMinutes: number;
    waiting: number;
  }>;
  counters: Array<{
    id: string;
    label: string;
    status: string;
    service?: { name: string } | null;
    teller?: { name: string } | null;
    activeTicket?: { publicNumber: string } | null;
  }>;
};
type ReportResponse = {
  metrics: {
    ticketsIssued: number;
    averageWaitMinutes: number;
    averageServiceMinutes: number;
    counterUtilization: number;
  };
  hourlyDemand: Array<{ hour: string; issued: number }>;
};
type AuditItem = {
  id: string;
  createdAt: string;
  action: string;
  actorId: string | null;
  actorType: string;
  targetType: string | null;
  outcome: string;
};
type SettingsForm = Record<string, string | number | boolean> & {
  timezone: string;
};
type SettingsResponse = {
  timezone: string;
  settings: Record<string, string | number | boolean>;
};
type AuthState = { user: User | null; setUser: (user: User | null) => void };
const AuthContext = React.createContext<AuthState>({
  user: null,
  setUser: () => undefined,
});

const ADMIN_BRANCH_KEY = "bank-qms-admin-branch";

function roleHome(role: User["role"]) {
  if (role === "ADMIN") return "/admin";
  if (role === "MANAGER") return "/manager";
  return "/teller";
}

function adminEndpoint(path: string) {
  const branchId =
    typeof window === "undefined"
      ? ""
      : (window.localStorage.getItem(ADMIN_BRANCH_KEY) ?? "");
  if (!branchId) return path;
  return `${path}${path.includes("?") ? "&" : "?"}branchId=${encodeURIComponent(branchId)}`;
}

function Login() {
  const { setUser } = React.useContext(AuthContext);
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const login = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api<{ accessToken: string; user: User }>(
        "/auth/login",
        { method: "POST", body: JSON.stringify(form) },
      );
      accessToken = result.accessToken;
      setUser(result.user);
      navigate(roleHome(result.user.role));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="login-shell">
      <section className="login-art">
        <WorldLinkBrand className="light" subtitle="Secure branch operations" />
        <div>
          <p className="eyebrow gold-text">Branch operations</p>
          <h1>
            One queue.
            <br />
            One clear next step.
          </h1>
          <p>
            Separate administrator, manager and teller access for the branch
            queue system.
          </p>
        </div>
        <div className="secure-note">
          <ShieldCheck />
          Role and branch scope are enforced by the API.
        </div>
      </section>
      <section className="login-panel">
        <form className="card stack" onSubmit={login}>
          <div>
            <p className="eyebrow">Staff access</p>
            <h2>Sign in to your workspace</h2>
            <p className="muted">
              Use the account issued by your system administrator.
            </p>
          </div>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <label className="field">
            <span>Username</span>
            <input
              autoComplete="username"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </label>
          <button className="primary" disabled={busy}>
            {busy ? "Signing in…" : "Sign in securely"}
          </button>
        </form>
      </section>
    </main>
  );
}

function Shell({
  children,
  mode,
}: React.PropsWithChildren<{ mode: "teller" | "manager" | "admin" }>) {
  const { user, setUser } = React.useContext(AuthContext);
  const navigate = useNavigate();
  const branches = useQuery<AdminBranch[]>({
    queryKey: ["admin-branches"],
    queryFn: () => api("/admin/branches"),
    enabled: mode === "admin",
  });
  const [selectedBranchId, setSelectedBranchId] = useState(() =>
    typeof window === "undefined"
      ? ""
      : (window.localStorage.getItem(ADMIN_BRANCH_KEY) ?? ""),
  );
  const effectiveBranchId =
    mode !== "admin"
      ? (user?.branchId ?? "")
      : branches.data?.some((branch) => branch.id === selectedBranchId)
        ? selectedBranchId
        : (branches.data?.find((branch) => branch.id === user?.branchId)?.id ??
          branches.data?.[0]?.id ??
          user?.branchId ??
          "");
  useEffect(() => {
    if (mode === "admin" && effectiveBranchId) {
      window.localStorage.setItem(ADMIN_BRANCH_KEY, effectiveBranchId);
    }
  }, [effectiveBranchId, mode]);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const logout = async () => {
    setLogoutBusy(true);
    setLogoutError("");
    try {
      await api("/auth/logout", { method: "POST" });
      accessToken = "";
      setUser(null);
      queryClient.clear();
      navigate("/login");
    } catch (caught) {
      setLogoutError(
        caught instanceof Error ? caught.message : "Unable to log out safely.",
      );
      setLogoutBusy(false);
    }
  };
  const managerLinks = [
    ["/manager", "Overview", Gauge],
    ["/manager/reports", "Reports", BarChart3],
  ] as const;
  const adminLinks = [
    ["/admin", "Overview", Gauge],
    ["/admin/branches", "Branches", Building2],
    ["/admin/staff", "Users", UserCog],
    ["/admin/services", "Services", Ticket],
    ["/admin/counters", "Counters", Activity],
    ["/admin/settings", "Configuration", Settings],
    ["/admin/audit", "Security & audit", FileClock],
  ] as const;
  const links = mode === "admin" ? adminLinks : managerLinks;
  const activeBranch = branches.data?.find(
    (branch) => branch.id === effectiveBranchId,
  );
  return (
    <div className="staff-shell">
      <aside className="sidebar">
        <WorldLinkBrand
          className="light"
          subtitle={`${
            mode === "admin"
              ? "Administrator"
              : mode === "manager"
                ? "Manager"
                : "Teller"
          } workspace`}
        />
        <div className="sidebar-role">
          <span>Secure workspace</span>
          <strong>
            {mode === "admin"
              ? "System control"
              : mode === "manager"
                ? "Branch operations"
                : "Counter service"}
          </strong>
        </div>
        <nav aria-label={mode + " workspace navigation"}>
          <span className="sidebar-nav-label">Workspace</span>
          {mode === "manager" || mode === "admin" ? (
            links.map(([path, label, Icon]) => (
              <NavLink key={label} end={label === "Overview"} to={path}>
                <Icon size={19} />
                {label}
              </NavLink>
            ))
          ) : (
            <NavLink to="/teller">
              <Activity size={19} />
              Queue workspace
            </NavLink>
          )}
        </nav>
        <div className="sidebar-user">
          <div className="avatar">
            {user?.name
              .split(" ")
              .map((x) => x[0])
              .slice(0, 2)}
          </div>
          <div>
            <strong>{user?.name}</strong>
            <div className="sidebar-caption">{user?.role}</div>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="workspace-header">
          <div className="workspace-branch">
            <span className="branch-live-dot" />
            <div>
              <strong>{activeBranch?.name ?? user?.branchName}</strong>
              <span>
                {activeBranch?.code ?? user?.branchCode} · Addis Ababa
              </span>
            </div>
            {mode === "admin" && branches.data && (
              <select
                aria-label="Administration branch scope"
                value={effectiveBranchId}
                onChange={(event) => {
                  window.localStorage.setItem(
                    ADMIN_BRANCH_KEY,
                    event.target.value,
                  );
                  setSelectedBranchId(event.target.value);
                  queryClient.clear();
                  window.location.reload();
                }}
              >
                {branches.data.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.code} · {branch.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="session-actions">
            <div className="row">
              <span className="status-pill status-success">● Live</span>
              <Clock />
              <button
                className="logout-control"
                aria-label="Log out"
                onClick={() => void logout()}
                disabled={logoutBusy}
              >
                <LogOut size={17} />
                <span>{logoutBusy ? "Logging out…" : "Log out"}</span>
              </button>
            </div>
            {logoutError && (
              <span className="session-error" role="alert">
                {logoutError}
              </span>
            )}
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="small muted">{now.toLocaleTimeString()}</span>;
}

function TellerWorkspace() {
  const qc = useQueryClient();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const current = useQuery<TellerSessionResponse>({
    queryKey: ["session"],
    queryFn: () => api("/teller/counter-session/current"),
    refetchInterval: 3000,
  });
  const counters = useQuery<AvailableCounter[]>({
    queryKey: ["available-counters"],
    queryFn: () => api("/teller/counters/available"),
    enabled: !current.data?.session,
    refetchInterval: 5000,
  });
  const perform = useMutation({
    mutationFn: ({
      path,
      body,
      idempotencyKey,
    }: {
      path: string;
      body?: unknown;
      idempotencyKey?: string;
    }) =>
      api(path, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
        headers: idempotencyKey
          ? { "Idempotency-Key": idempotencyKey }
          : undefined,
      }),
    onSuccess: () => {
      setError("");
      setNotice("Action completed successfully.");
      void qc.invalidateQueries();
      setTimeout(() => setNotice(""), 2500);
    },
    onError: (e) => setError(e.message),
  });
  const s = current.data?.session;
  const ticket = s?.activeTicket;
  if (current.isLoading)
    return (
      <Shell mode="teller">
        <main className="workspace-page">
          <div className="card">Loading counter workspace…</div>
        </main>
      </Shell>
    );
  if (!s)
    return (
      <Shell mode="teller">
        <main className="workspace-page">
          <section className="workspace-hero teller-shift-hero">
            <div>
              <p className="eyebrow">Secure teller workspace</p>
              <h1>Open your assigned counter</h1>
              <p>
                Your identity and counter assignment are locked by the
                administrator. Start the shift to serve your assigned queue.
              </p>
            </div>
            <div className="hero-security">
              <ShieldCheck size={28} />
              <span>
                <strong>Identity protected</strong>
                <small>No teller or counter switching</small>
              </span>
            </div>
          </section>
          {error && <div className="error">{error}</div>}
          <div className="grid">
            {counters.data?.length ? (
              counters.data.map((counter) => (
                <article className="card" key={counter.id}>
                  <div className="row between">
                    <Building2 />
                    <span
                      className={`status-pill ${counter.available ? "status-success" : ""}`}
                    >
                      {counter.available ? "Available" : counter.status}
                    </span>
                  </div>
                  <h2 style={{ marginTop: 22 }}>{counter.label}</h2>
                  <p className="muted">
                    {counter.service?.name ?? "No service assigned"}
                  </p>
                  <button
                    className="primary"
                    disabled={!counter.available || perform.isPending}
                    onClick={() =>
                      perform.mutate({
                        path: "/teller/counter-sessions",
                        body: { counterId: counter.id },
                      })
                    }
                  >
                    Open session
                  </button>
                </article>
              ))
            ) : (
              <article className="card">
                <ShieldCheck />
                <h2 style={{ marginTop: 18 }}>No counter assigned</h2>
                <p className="muted">
                  Ask your manager to assign an active counter before starting
                  your shift.
                </p>
              </article>
            )}
          </div>
        </main>
      </Shell>
    );
  return (
    <Shell mode="teller">
      <main className="workspace-page">
        {error && <div className="error">{error}</div>}
        {notice && <div className="success">{notice}</div>}
        <div className="row between teller-heading">
          <div>
            <p className="eyebrow">
              {s.counter.label} · {s.service.name}
            </p>
            <h1 className="section-title">Queue workspace</h1>
          </div>
          <div className="row teller-session-actions">
            {s.status === "OPEN" ? (
              <button
                className="secondary row"
                disabled={!!ticket || perform.isPending}
                onClick={() =>
                  perform.mutate({ path: "/teller/counter-session/pause" })
                }
              >
                <CirclePause size={18} />
                Pause
              </button>
            ) : (
              <button
                className="secondary row"
                onClick={() =>
                  perform.mutate({ path: "/teller/counter-session/resume" })
                }
              >
                <Play size={18} />
                Resume
              </button>
            )}
            <button
              className="secondary danger row"
              disabled={!!ticket || perform.isPending}
              onClick={() =>
                confirm("Close this counter session?") &&
                perform.mutate({ path: "/teller/counter-session/close" })
              }
            >
              <Square size={16} />
              Close
            </button>
          </div>
        </div>
        <div className="grid kpi-grid">
          <Metric
            label="Waiting"
            value={s.queue.waiting}
            icon={BellRing}
            note="Assigned queue"
          />
          <Metric
            label="Oldest wait"
            value={`${Math.floor(s.queue.oldestWaitSeconds / 60)}m`}
            icon={FileClock}
            note="Queue age"
            tone="green"
          />
        </div>
        <section
          className={
            "active-ticket card " + (ticket ? "has-ticket" : "is-empty")
          }
        >
          {!ticket ? (
            <>
              <div className="empty-icon">
                <BellRing />
              </div>
              <h2>Ready for the next customer</h2>
              <p className="muted">
                The server calls customers in first-in, first-out order.
              </p>
              <span className="queue-ready-note">
                {s.queue.waiting
                  ? s.queue.waiting +
                    " customer" +
                    (s.queue.waiting === 1 ? "" : "s") +
                    " ready in this service queue"
                  : "The assigned queue is currently clear"}
              </span>
              <button
                className="call-next"
                disabled={s.status !== "OPEN" || perform.isPending}
                onClick={() =>
                  perform.mutate({
                    path: "/teller/tickets/call-next",
                    idempotencyKey: crypto.randomUUID(),
                  })
                }
              >
                {perform.isPending ? "Calling…" : "Call next customer"}
              </button>
            </>
          ) : (
            <>
              <div className="row between">
                <span
                  className={`status-pill ${ticket.status === "IN_SERVICE" ? "status-success" : "status-warning"}`}
                >
                  {ticket.status.replace("_", " ")}
                </span>
                <span className="small muted">
                  No-shows: {ticket.noShowCount} · Recalls: {ticket.recallCount}
                </span>
              </div>
              <div className="ticket-focus">{ticket.publicNumber}</div>
              <p className="muted">{ticket.currentService?.name}</p>
              <div className="row actions">
                {ticket.status === "CALLED" && (
                  <>
                    <button
                      className="secondary row"
                      onClick={() =>
                        perform.mutate({
                          path: `/teller/tickets/${ticket.id}/recall`,
                          idempotencyKey: crypto.randomUUID(),
                        })
                      }
                    >
                      <RefreshCw size={18} />
                      Recall
                    </button>
                    <button
                      className="primary row"
                      onClick={() =>
                        perform.mutate({
                          path: `/teller/tickets/${ticket.id}/start`,
                          idempotencyKey: crypto.randomUUID(),
                        })
                      }
                    >
                      <Play size={18} />
                      Start service
                    </button>
                    <button
                      className="secondary danger"
                      onClick={() =>
                        confirm(
                          "Return this ticket to the queue as a no-show?",
                        ) &&
                        perform.mutate({
                          path: `/teller/tickets/${ticket.id}/no-show`,
                          idempotencyKey: crypto.randomUUID(),
                        })
                      }
                    >
                      Mark no-show
                    </button>
                  </>
                )}
                {ticket.status === "IN_SERVICE" && (
                  <button
                    className="primary row"
                    onClick={() =>
                      perform.mutate({
                        path: `/teller/tickets/${ticket.id}/complete`,
                        idempotencyKey: crypto.randomUUID(),
                      })
                    }
                  >
                    <CheckCircle2 size={18} />
                    Complete service
                  </button>
                )}
                <TransferButton
                  ticketId={ticket.id}
                  run={(body) =>
                    perform.mutate({
                      path: `/teller/tickets/${ticket.id}/transfer`,
                      body,
                      idempotencyKey: crypto.randomUUID(),
                    })
                  }
                />
              </div>
            </>
          )}
        </section>
      </main>
    </Shell>
  );
}
function TransferButton({
  ticketId,
  run,
}: {
  ticketId: string;
  run: (body: unknown) => void;
}) {
  const services = useQuery<NamedService[]>({
    queryKey: ["transfer-services"],
    queryFn: () => api("/public/branches/MAIN/services"),
  });
  const [open, setOpen] = useState(false);
  const [id, setId] = useState("");
  return (
    <>
      {
        <button className="secondary row" onClick={() => setOpen(!open)}>
          <ArrowRightLeft size={18} />
          Transfer
        </button>
      }
      {open && (
        <div className="transfer-box">
          <select value={id} onChange={(e) => setId(e.target.value)}>
            <option value="">Destination service…</option>
            {services.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            className="primary"
            disabled={!id}
            onClick={() => {
              run({
                destinationServiceTypeId: id,
                note: `Transferred from teller console for ${ticketId}`,
              });
              setOpen(false);
            }}
          >
            Confirm transfer
          </button>
        </div>
      )}
    </>
  );
}
function Metric({
  label,
  value,
  icon: Icon = Activity,
  note = "Live data",
  tone = "blue",
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ElementType;
  note?: string;
  tone?: "blue" | "green" | "amber" | "slate";
}) {
  return (
    <article className={"card flat metric-card metric-" + tone}>
      <div className="metric-card-head">
        <span className="metric-icon">
          <Icon size={20} />
        </span>
        <span className="metric-note">{note}</span>
      </div>
      <div className="metric-label">{label}</div>
      <div className="metric">{value}</div>
    </article>
  );
}

function ManagerOverview() {
  const dashboard = useQuery<DashboardResponse>({
    queryKey: ["dashboard"],
    queryFn: () => api("/manager/dashboard/live"),
    refetchInterval: 5000,
  });
  if (!dashboard.data)
    return (
      <ManagerPage title="Live branch overview">
        <div className="card">Loading live operations…</div>
      </ManagerPage>
    );
  const d = dashboard.data;
  return (
    <ManagerPage
      title="Live branch overview"
      subtitle="Authoritative queue and counter state refreshes every five seconds."
    >
      <div className="grid kpi-grid">
        <Metric
          label="Issued today"
          value={d.kpis.issued}
          icon={Ticket}
          note="Since opening"
        />
        <Metric
          label="Waiting now"
          value={d.kpis.waiting}
          icon={BellRing}
          note="Live queue"
          tone="amber"
        />
        <Metric
          label="Called / serving"
          value={d.kpis.active}
          icon={Activity}
          note="At counters"
          tone="green"
        />
        <Metric
          label="Completed today"
          value={d.kpis.completed}
          icon={CheckCircle2}
          note="Service output"
          tone="slate"
        />
      </div>
      <section className="card dashboard-chart">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Queue distribution</p>
            <h2>Live demand by service</h2>
          </div>
          <span className="status-pill status-success">● Live</span>
        </div>
        <div className="live-chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={d.queues}>
              <CartesianGrid stroke="#e5edf4" vertical={false} />
              <XAxis dataKey="code" axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: "#edf4f9" }}
                contentStyle={{
                  border: "1px solid #dce6f0",
                  borderRadius: 14,
                  boxShadow: "0 14px 34px rgba(20, 54, 86, 0.12)",
                }}
              />
              <Bar
                dataKey="waiting"
                name="Waiting"
                fill="#245d8b"
                radius={[7, 7, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
      <div className="split">
        <section>
          <h2>Queues by service</h2>
          <div className="stack">
            {d.queues.map((q) => (
              <article className="card flat queue-summary-card" key={q.id}>
                <div>
                  <strong>
                    {q.code} · {q.name}
                  </strong>
                  <div className="small muted">
                    Oldest wait {q.oldestWaitMinutes} min
                  </div>
                </div>
                <div className="metric small-metric">{q.waiting}</div>
                <div className="queue-load-bar" aria-hidden="true">
                  <span
                    style={{
                      width: Math.min(100, Math.max(7, q.waiting * 10)) + "%",
                    }}
                  />
                </div>
              </article>
            ))}
          </div>
        </section>
        <section>
          <h2>Counter state</h2>
          <div className="stack">
            {d.counters.map((c) => (
              <article className="card flat counter-state-card" key={c.id}>
                <div className="row between">
                  <strong>{c.label}</strong>
                  <span
                    className={`status-pill ${c.status === "OPEN" ? "status-success" : c.status === "PAUSED" ? "status-warning" : ""}`}
                  >
                    {c.status}
                  </span>
                </div>
                <div className="small muted" style={{ marginTop: 8 }}>
                  {c.service?.name ?? "Unassigned"} ·{" "}
                  {c.teller?.name ?? "No teller"}
                </div>
                {c.activeTicket && (
                  <div className="notice" style={{ marginTop: 10 }}>
                    Serving {c.activeTicket.publicNumber}
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
      </div>
    </ManagerPage>
  );
}
function ManagerPage({
  title,
  subtitle,
  children,
}: React.PropsWithChildren<{ title: string; subtitle?: string }>) {
  return (
    <Shell mode="manager">
      <main className="workspace-page">
        <section className="workspace-hero manager-page-hero">
          <div>
            <p className="eyebrow">Branch operations</p>
            <h1>{title}</h1>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <div className="hero-status">
            <span className="branch-live-dot" />
            <div>
              <strong>Live operations</strong>
              <small>Automatic five-second refresh</small>
            </div>
          </div>
        </section>
        {children}
      </main>
    </Shell>
  );
}

function AdminPage({
  title,
  subtitle,
  children,
}: React.PropsWithChildren<{ title: string; subtitle?: string }>) {
  return (
    <Shell mode="admin">
      <main className="workspace-page">
        <section className="workspace-hero admin-page-hero">
          <div>
            <p className="eyebrow">System administration</p>
            <h1>{title}</h1>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <div className="hero-status admin-guard">
            <ShieldCheck size={24} />
            <div>
              <strong>Administrator protected</strong>
              <small>Configuration and security only</small>
            </div>
          </div>
        </section>
        {children}
      </main>
    </Shell>
  );
}

function AdminOverview() {
  const overview = useQuery<AdminOverviewResponse>({
    queryKey: ["admin-overview"],
    queryFn: () => api("/admin/overview"),
  });
  if (!overview.data)
    return (
      <AdminPage title="Administration overview">
        <div className="card">Loading system administration…</div>
      </AdminPage>
    );
  const data = overview.data;
  return (
    <AdminPage
      title="Administration overview"
      subtitle="System-wide identity, branch, configuration and security controls. Operational queue work remains in the Manager workspace."
    >
      <div className="grid kpi-grid">
        <Metric
          label="Active branches"
          value={data.activeBranches + "/" + data.totalBranches}
          icon={Building2}
          note="Network coverage"
        />
        <Metric
          label="Staff identities"
          value={data.totalStaff}
          icon={UserCog}
          note="All roles"
          tone="green"
        />
        <Metric
          label="Administrators"
          value={data.administrators}
          icon={ShieldCheck}
          note="Privileged users"
          tone="slate"
        />
        <Metric
          label="Locked accounts"
          value={data.lockedStaff}
          icon={FileClock}
          note="Security review"
          tone="amber"
        />
      </div>
      <div className="split admin-overview-grid">
        <section className="card stack admin-overview-panel">
          <div className="admin-panel-icon">
            <Settings size={24} />
          </div>
          <p className="eyebrow">Branch controls</p>
          <h2>Configuration scope</h2>
          <p className="muted">
            Use the branch selector above to administer that branch’s users,
            counters, services and queue policy.
          </p>
          <div className="row between">
            <span>Active services across the system</span>
            <strong>{data.activeServices}</strong>
          </div>
        </section>
        <section className="card stack admin-overview-panel security-panel">
          <div className="admin-panel-icon">
            <ShieldCheck size={24} />
          </div>
          <p className="eyebrow">Access protection</p>
          <h2>Security posture</h2>
          <p className="muted">
            Administrative changes are role-protected and written to the audit
            log. Administrators cannot enter Manager or Teller routes.
          </p>
          <div className="row between">
            <span>Open or paused teller sessions</span>
            <strong>{data.activeSessions}</strong>
          </div>
        </section>
      </div>
    </AdminPage>
  );
}

function BranchesPage() {
  const qc = useQueryClient();
  const branches = useQuery<AdminBranch[]>({
    queryKey: ["admin-branches"],
    queryFn: () => api("/admin/branches"),
  });
  const [form, setForm] = useState({
    code: "",
    name: "",
    location: "",
    timezone: "Africa/Addis_Ababa",
  });
  const [error, setError] = useState("");
  const create = async () => {
    setError("");
    try {
      await api("/admin/branches", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setForm({
        code: "",
        name: "",
        location: "",
        timezone: "Africa/Addis_Ababa",
      });
      await qc.invalidateQueries({ queryKey: ["admin-branches"] });
      await qc.invalidateQueries({ queryKey: ["admin-overview"] });
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not create branch.",
      );
    }
  };
  const toggle = async (branch: AdminBranch) => {
    setError("");
    try {
      await api(`/admin/branches/${branch.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: branch.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
        }),
      });
      await qc.invalidateQueries({ queryKey: ["admin-branches"] });
      await qc.invalidateQueries({ queryKey: ["admin-overview"] });
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not update branch.",
      );
    }
  };
  return (
    <AdminPage
      title="Branch registry"
      subtitle="Create branches and control whether they can accept operational traffic. Branch codes remain immutable after creation."
    >
      {error && <div className="error">{error}</div>}
      <div className="split">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Branch</th>
                <th>Staff</th>
                <th>Services</th>
                <th>Counters</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {branches.data?.map((branch) => (
                <tr key={branch.id}>
                  <td>
                    <strong>{branch.code}</strong> · {branch.name}
                    <div className="small muted">
                      {branch.location || branch.timezone}
                    </div>
                  </td>
                  <td>{branch._count.staff}</td>
                  <td>{branch._count.services}</td>
                  <td>{branch._count.counters}</td>
                  <td>{branch.status}</td>
                  <td>
                    <button
                      className="secondary"
                      onClick={() => void toggle(branch)}
                    >
                      {branch.status === "ACTIVE" ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card stack">
          <h2>Create branch</h2>
          <label className="field">
            <span>Branch code</span>
            <input
              maxLength={20}
              value={form.code}
              onChange={(event) =>
                setForm({ ...form, code: event.target.value.toUpperCase() })
              }
            />
          </label>
          <label className="field">
            <span>Name</span>
            <input
              value={form.name}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
            />
          </label>
          <label className="field">
            <span>Location</span>
            <input
              value={form.location}
              onChange={(event) =>
                setForm({ ...form, location: event.target.value })
              }
            />
          </label>
          <label className="field">
            <span>Timezone</span>
            <input
              value={form.timezone}
              onChange={(event) =>
                setForm({ ...form, timezone: event.target.value })
              }
            />
          </label>
          <button
            className="primary"
            disabled={!form.code || !form.name}
            onClick={() => void create()}
          >
            Create branch
          </button>
        </div>
      </div>
    </AdminPage>
  );
}

function ServicesPage() {
  const qc = useQueryClient();
  const list = useQuery<ManagerService[]>({
    queryKey: ["services"],
    queryFn: () => api(adminEndpoint("/admin/services")),
  });
  const [form, setForm] = useState({
    code: "",
    name: "",
    averageServiceMinutes: 5,
  });
  const [error, setError] = useState("");
  const save = async () => {
    try {
      await api(adminEndpoint("/admin/services"), {
        method: "POST",
        body: JSON.stringify(form),
      });
      setForm({
        code: "",
        name: "",
        averageServiceMinutes: 5,
      });
      void qc.invalidateQueries({ queryKey: ["services"] });
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <AdminPage
      title="Service configuration"
      subtitle="Changes are audited; deactivation is blocked while active tickets exist."
    >
      {error && <div className="error">{error}</div>}
      <div className="split">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Service</th>
                <th>Minutes</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {list.data?.map((s) => (
                <tr key={s.id}>
                  <td>
                    <strong>{s.code}</strong> · {s.name}
                  </td>
                  <td>{s.averageServiceMinutes}</td>
                  <td>{s.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card stack">
          <h2>Add service</h2>
          <label className="field">
            <span>Code</span>
            <input
              maxLength={10}
              value={form.code}
              onChange={(e) =>
                setForm({ ...form, code: e.target.value.toUpperCase() })
              }
            />
          </label>
          <label className="field">
            <span>Name</span>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Average minutes</span>
            <input
              type="number"
              min="1"
              max="240"
              value={form.averageServiceMinutes}
              onChange={(e) =>
                setForm({
                  ...form,
                  averageServiceMinutes: Number(e.target.value),
                })
              }
            />
          </label>
          <button className="primary" onClick={save}>
            Create service
          </button>
        </div>
      </div>
    </AdminPage>
  );
}
function CountersPage() {
  const qc = useQueryClient();
  const counters = useQuery<ManagerCounter[]>({
    queryKey: ["counters"],
    queryFn: () => api(adminEndpoint("/admin/counters")),
  });
  const services = useQuery<NamedService[]>({
    queryKey: ["services"],
    queryFn: () => api(adminEndpoint("/admin/services")),
  });
  const [form, setForm] = useState({ label: "", assignedServiceId: "" });
  const create = async () => {
    await api(adminEndpoint("/admin/counters"), {
      method: "POST",
      body: JSON.stringify(form),
    });
    setForm({ label: "", assignedServiceId: "" });
    void qc.invalidateQueries({ queryKey: ["counters"] });
  };
  return (
    <AdminPage title="Counter administration">
      <div className="split">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Counter</th>
                <th>Service</th>
                <th>Assigned teller</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {counters.data?.map((c) => (
                <tr key={c.id}>
                  <td>{c.label}</td>
                  <td>{c.assignedService?.name ?? "Unassigned"}</td>
                  <td>{c.assignedStaff?.name ?? "Unassigned"}</td>
                  <td>{c.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card stack">
          <h2>Add counter</h2>
          <label className="field">
            <span>Label</span>
            <input
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Assigned service</span>
            <select
              value={form.assignedServiceId}
              onChange={(e) =>
                setForm({ ...form, assignedServiceId: e.target.value })
              }
            >
              <option value="">Select…</option>
              {services.data?.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <button className="primary" onClick={create}>
            Create counter
          </button>
        </div>
      </div>
    </AdminPage>
  );
}
function StaffPage() {
  const qc = useQueryClient();
  const staff = useQuery<StaffListItem[]>({
    queryKey: ["staff"],
    queryFn: () => api(adminEndpoint("/admin/staff")),
  });
  const counters = useQuery<ManagerCounter[]>({
    queryKey: ["counters"],
    queryFn: () => api(adminEndpoint("/admin/counters")),
  });
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    staffCode: "",
    name: "",
    username: "",
    password: "",
    role: "TELLER",
    assignedCounterId: "",
  });
  const create = async () => {
    setError("");
    try {
      await api(adminEndpoint("/admin/staff"), {
        method: "POST",
        body: JSON.stringify({
          ...form,
          assignedCounterId:
            form.role === "TELLER" ? form.assignedCounterId : undefined,
        }),
      });
      setForm({
        staffCode: "",
        name: "",
        username: "",
        password: "",
        role: "TELLER",
        assignedCounterId: "",
      });
      void qc.invalidateQueries({ queryKey: ["staff"] });
      void qc.invalidateQueries({ queryKey: ["counters"] });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not create staff account.",
      );
    }
  };
  const reassign = async (staffId: string, assignedCounterId: string) => {
    setError("");
    try {
      await api(adminEndpoint(`/admin/staff/${staffId}`), {
        method: "PATCH",
        body: JSON.stringify({ assignedCounterId }),
      });
      void qc.invalidateQueries({ queryKey: ["staff"] });
      void qc.invalidateQueries({ queryKey: ["counters"] });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not reassign counter.",
      );
    }
  };
  const availableFor = (staffId: string) =>
    counters.data?.filter(
      (counter) =>
        !counter.assignedStaff || counter.assignedStaff.id === staffId,
    ) ?? [];
  return (
    <AdminPage
      title="Staff access"
      subtitle="Every actor has an independent account; tellers receive one administrator-controlled counter assignment."
    >
      {error && <div className="error">{error}</div>}
      <div className="split">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Staff</th>
                <th>Role</th>
                <th>Assigned counter</th>
                <th>Status</th>
                <th>Last login</th>
              </tr>
            </thead>
            <tbody>
              {staff.data?.map((s) => (
                <tr key={s.id}>
                  <td>
                    <strong>{s.name}</strong>
                    <div className="small muted">{s.username}</div>
                  </td>
                  <td>{s.role}</td>
                  <td>
                    {s.role === "TELLER" ? (
                      <select
                        aria-label={`Assigned counter for ${s.name}`}
                        value={s.assignedCounter?.id ?? ""}
                        onChange={(event) =>
                          void reassign(s.id, event.target.value)
                        }
                      >
                        <option value="" disabled>
                          Assign counter…
                        </option>
                        {availableFor(s.id).map((counter) => (
                          <option key={counter.id} value={counter.id}>
                            {counter.label} ·{" "}
                            {counter.assignedService?.name ?? "No service"}
                          </option>
                        ))}
                      </select>
                    ) : (
                      "No counter required"
                    )}
                  </td>
                  <td>{s.status}</td>
                  <td>
                    {s.lastLoginAt
                      ? new Date(s.lastLoginAt).toLocaleString()
                      : "Never"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card stack">
          <h2>Create staff account</h2>
          {(
            ["staffCode", "name", "username", "password"] as Array<
              keyof typeof form
            >
          ).map((key) => (
            <label className="field" key={key}>
              <span>
                {key
                  .replace(/[A-Z]/g, (m) => ` ${m}`)
                  .replace(/^./, (x) => x.toUpperCase())}
              </span>
              <input
                type={key === "password" ? "password" : "text"}
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            </label>
          ))}
          <label className="field">
            <span>Role</span>
            <select
              value={form.role}
              onChange={(e) =>
                setForm({
                  ...form,
                  role: e.target.value,
                  assignedCounterId:
                    e.target.value === "TELLER" ? form.assignedCounterId : "",
                })
              }
            >
              <option>TELLER</option>
              <option>MANAGER</option>
              <option>ADMIN</option>
            </select>
          </label>
          {form.role === "TELLER" && (
            <label className="field">
              <span>Assigned counter</span>
              <select
                value={form.assignedCounterId}
                onChange={(event) =>
                  setForm({ ...form, assignedCounterId: event.target.value })
                }
              >
                <option value="">Select an available counter…</option>
                {availableFor("").map((counter) => (
                  <option key={counter.id} value={counter.id}>
                    {counter.label} ·{" "}
                    {counter.assignedService?.name ?? "No service"}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            className="primary"
            onClick={create}
            disabled={form.role === "TELLER" && !form.assignedCounterId}
          >
            Create account
          </button>
        </div>
      </div>
    </AdminPage>
  );
}
function ReportsPage() {
  const report = useQuery<ReportResponse>({
    queryKey: ["report"],
    queryFn: () => api("/manager/reports/summary"),
  });
  const download = async () => {
    const csv = await api<string>("/manager/reports/tickets.csv");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "bank-qms-report.csv";
    a.click();
    URL.revokeObjectURL(url);
  };
  const r = report.data;
  return (
    <ManagerPage
      title="Operational reports"
      subtitle="Dashboard and export use the same event-based metric definitions."
    >
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="secondary row" onClick={download}>
          <Download size={18} />
          Export filtered CSV
        </button>
      </div>
      {r && (
        <>
          <div className="grid kpi-grid">
            <Metric label="Tickets issued" value={r.metrics.ticketsIssued} />
            <Metric
              label="Average wait"
              value={`${r.metrics.averageWaitMinutes.toFixed(1)}m`}
            />
            <Metric
              label="Average service"
              value={`${r.metrics.averageServiceMinutes.toFixed(1)}m`}
            />
            <Metric
              label="Utilization"
              value={`${r.metrics.counterUtilization.toFixed(0)}%`}
            />
          </div>
          <div className="card chart-card">
            <h2>Hourly demand</h2>
            <ResponsiveContainer width="100%" height={290}>
              <BarChart data={r.hourlyDemand}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hour" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="issued" fill="#0f5c45" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </ManagerPage>
  );
}
function AuditPage() {
  const logs = useQuery<AuditItem[]>({
    queryKey: ["audit"],
    queryFn: () => api(adminEndpoint("/admin/audit-logs")),
    refetchInterval: 10000,
  });
  return (
    <AdminPage title="Security and audit log">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Action</th>
              <th>Actor</th>
              <th>Target</th>
              <th>Outcome</th>
            </tr>
          </thead>
          <tbody>
            {logs.data?.map((l) => (
              <tr key={l.id}>
                <td>{new Date(l.createdAt).toLocaleString()}</td>
                <td>{l.action}</td>
                <td>{l.actorId ?? l.actorType}</td>
                <td>{l.targetType ?? "—"}</td>
                <td>{l.outcome}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminPage>
  );
}
function SettingsPage() {
  const settings = useQuery<SettingsResponse>({
    queryKey: ["settings"],
    queryFn: () => api(adminEndpoint("/admin/settings")),
  });
  const [form, setForm] = useState<SettingsForm | null>(null);
  const values =
    form ??
    (settings.data
      ? {
          announcementRepeatCount: 3,
          soundEnabled: true,
          timezone: settings.data.timezone,
          ...settings.data.settings,
        }
      : null);
  if (!values)
    return (
      <AdminPage title="Branch configuration">
        <div className="card">Loading settings…</div>
      </AdminPage>
    );
  const save = () =>
    api(adminEndpoint("/admin/settings"), {
      method: "PATCH",
      body: JSON.stringify(values),
    });
  return (
    <AdminPage title="Branch configuration">
      <div className="card stack" style={{ maxWidth: 700 }}>
        {[
          ["timezone", "Branch timezone"],
          ["noShowTimeoutSeconds", "No-show timeout (seconds)"],
          ["kioskIdleTimeoutSeconds", "Kiosk idle timeout (seconds)"],
          ["displayHistoryCount", "Recent calls on display"],
          ["announcementRepeatCount", "English announcement repeats (2 or 3)"],
          ["slaWaitMinutes", "Long-wait alert (minutes)"],
        ].map(([key, label]) => (
          <label className="field" key={key}>
            <span>{label}</span>
            <input
              type={key === "timezone" ? "text" : "number"}
              value={String(values[key] ?? "")}
              onChange={(e) =>
                setForm({
                  ...values,
                  [key]:
                    key === "timezone"
                      ? e.target.value
                      : Number(e.target.value),
                })
              }
            />
          </label>
        ))}
        <label className="settings-toggle">
          <span>
            <strong>English voice announcements</strong>
            <small>
              Announce each new or recalled ticket on the public display.
            </small>
          </span>
          <input
            type="checkbox"
            checked={values.soundEnabled !== false}
            onChange={(event) =>
              setForm({ ...values, soundEnabled: event.target.checked })
            }
          />
        </label>
        <button className="primary" onClick={save}>
          Save audited settings
        </button>
      </div>
    </AdminPage>
  );
}

function Protected({
  role,
  children,
}: {
  role: "TELLER" | "MANAGER" | "ADMIN";
  children: React.ReactNode;
}) {
  const { user } = React.useContext(AuthContext);
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to={roleHome(user.role)} replace />;
  return children;
}
function Root() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    void refreshSession()
      .then((restored) => {
        if (active) setUser(restored);
      })
      .catch(() => {
        accessToken = "";
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  if (!ready) {
    return (
      <main className="login-shell" aria-busy="true">
        <section className="login-panel">
          <div className="card">Restoring your secure session…</div>
        </section>
      </main>
    );
  }
  return (
    <AuthContext.Provider value={{ user, setUser }}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/teller"
          element={
            <Protected role="TELLER">
              <TellerWorkspace />
            </Protected>
          }
        />
        <Route
          path="/manager"
          element={
            <Protected role="MANAGER">
              <ManagerOverview />
            </Protected>
          }
        />
        <Route
          path="/manager/reports"
          element={
            <Protected role="MANAGER">
              <ReportsPage />
            </Protected>
          }
        />
        <Route
          path="/admin"
          element={
            <Protected role="ADMIN">
              <AdminOverview />
            </Protected>
          }
        />
        <Route
          path="/admin/branches"
          element={
            <Protected role="ADMIN">
              <BranchesPage />
            </Protected>
          }
        />
        <Route
          path="/admin/services"
          element={
            <Protected role="ADMIN">
              <ServicesPage />
            </Protected>
          }
        />
        <Route
          path="/admin/counters"
          element={
            <Protected role="ADMIN">
              <CountersPage />
            </Protected>
          }
        />
        <Route
          path="/admin/staff"
          element={
            <Protected role="ADMIN">
              <StaffPage />
            </Protected>
          }
        />
        <Route
          path="/admin/audit"
          element={
            <Protected role="ADMIN">
              <AuditPage />
            </Protected>
          }
        />
        <Route
          path="/admin/settings"
          element={
            <Protected role="ADMIN">
              <SettingsPage />
            </Protected>
          }
        />
        <Route
          path="*"
          element={
            <Navigate to={user ? roleHome(user.role) : "/login"} replace />
          }
        />
      </Routes>
    </AuthContext.Provider>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Root />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
