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
      standardWaiting: number;
      priorityWaiting: number;
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
  priorityEnabled: boolean;
  status: string;
};
type ManagerCounter = {
  id: string;
  label: string;
  status: string;
  assignedService?: { name: string } | null;
};
type StaffListItem = {
  id: string;
  name: string;
  username: string;
  role: string;
  status: string;
  lastLoginAt: string | null;
};
type DashboardResponse = {
  kpis: { issued: number; waiting: number; active: number; completed: number };
  queues: Array<{
    id: string;
    code: string;
    name: string;
    oldestWaitMinutes: number;
    priorityWaiting: number;
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
type SettingsForm = Record<string, string | number> & { timezone: string };
type SettingsResponse = {
  timezone: string;
  settings: Record<string, number>;
};
type AuthState = { user: User | null; setUser: (user: User | null) => void };
const AuthContext = React.createContext<AuthState>({
  user: null,
  setUser: () => undefined,
});

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
      navigate(result.user.role === "MANAGER" ? "/manager" : "/teller");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="login-shell">
      <section className="login-art">
        <div className="brand light">
          <div className="brand-mark gold">BQ</div>Bank QMS
        </div>
        <div>
          <p className="eyebrow gold-text">Branch operations</p>
          <h1>
            One queue.
            <br />
            One clear next step.
          </h1>
          <p>
            Secure teller and manager access for the Main Branch queue system.
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
              Use the staff account issued by your branch manager.
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
}: React.PropsWithChildren<{ mode: "teller" | "manager" }>) {
  const { user, setUser } = React.useContext(AuthContext);
  const navigate = useNavigate();
  const logout = async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      accessToken = "";
      setUser(null);
      navigate("/login");
    }
  };
  const managerLinks = [
    ["/manager", "Overview", Gauge],
    ["/manager/services", "Services", Ticket],
    ["/manager/counters", "Counters", Building2],
    ["/manager/staff", "Staff", UserCog],
    ["/manager/reports", "Reports", BarChart3],
    ["/manager/audit", "Audit log", FileClock],
    ["/manager/settings", "Settings", Settings],
  ] as const;
  return (
    <div className="staff-shell">
      <aside className="sidebar">
        <div className="brand light">
          <div className="brand-mark gold">BQ</div>
          <div>
            Bank QMS
            <div className="sidebar-caption">
              {mode === "manager" ? "Manager" : "Teller"} workspace
            </div>
          </div>
        </div>
        <nav>
          {mode === "manager" ? (
            managerLinks.map(([path, label, Icon]) => (
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
          <button aria-label="Logout" onClick={logout}>
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="workspace-header">
          <div>
            <strong>{user?.branchName}</strong>
            <span className="muted small"> · {user?.branchCode}</span>
          </div>
          <div className="row">
            <span className="status-pill status-success">● Live</span>
            <Clock />
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
          <p className="eyebrow">Start shift</p>
          <h1 className="section-title">Choose an available counter</h1>
          <p className="muted">
            One teller can hold one active counter session. The API resolves
            simultaneous claims safely.
          </p>
          {error && <div className="error">{error}</div>}
          <div className="grid">
            {counters.data?.map((counter) => (
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
            ))}
          </div>
        </main>
      </Shell>
    );
  return (
    <Shell mode="teller">
      <main className="workspace-page">
        {error && <div className="error">{error}</div>}
        {notice && <div className="success">{notice}</div>}
        <div className="row between">
          <div>
            <p className="eyebrow">
              {s.counter.label} · {s.service.name}
            </p>
            <h1 className="section-title">Queue workspace</h1>
          </div>
          <div className="row">
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
          <Metric label="Waiting" value={s.queue.waiting} />
          <Metric label="Standard" value={s.queue.standardWaiting} />
          <Metric label="Priority" value={s.queue.priorityWaiting} />
          <Metric
            label="Oldest wait"
            value={`${Math.floor(s.queue.oldestWaitSeconds / 60)}m`}
          />
        </div>
        <section className="active-ticket card">
          {!ticket ? (
            <>
              <div className="empty-icon">
                <BellRing />
              </div>
              <h2>Ready for the next customer</h2>
              <p className="muted">
                The server will apply FIFO order and the configured priority
                fairness limit.
              </p>
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
function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="card flat">
      <div className="small muted">{label}</div>
      <div className="metric">{value}</div>
    </div>
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
        <Metric label="Issued today" value={d.kpis.issued} />
        <Metric label="Waiting now" value={d.kpis.waiting} />
        <Metric label="Called / serving" value={d.kpis.active} />
        <Metric label="Completed today" value={d.kpis.completed} />
      </div>
      <div className="split">
        <section>
          <h2>Queues by service</h2>
          <div className="stack">
            {d.queues.map((q) => (
              <article className="card flat row between" key={q.id}>
                <div>
                  <strong>
                    {q.code} · {q.name}
                  </strong>
                  <div className="small muted">
                    Oldest wait {q.oldestWaitMinutes} min · {q.priorityWaiting}{" "}
                    priority
                  </div>
                </div>
                <div className="metric small-metric">{q.waiting}</div>
              </article>
            ))}
          </div>
        </section>
        <section>
          <h2>Counter state</h2>
          <div className="stack">
            {d.counters.map((c) => (
              <article className="card flat" key={c.id}>
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
        <p className="eyebrow">Branch management</p>
        <h1 className="section-title">{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
        {children}
      </main>
    </Shell>
  );
}

function ServicesPage() {
  const qc = useQueryClient();
  const list = useQuery<ManagerService[]>({
    queryKey: ["services"],
    queryFn: () => api("/manager/services"),
  });
  const [form, setForm] = useState({
    code: "",
    name: "",
    averageServiceMinutes: 5,
    priorityEnabled: true,
  });
  const [error, setError] = useState("");
  const save = async () => {
    try {
      await api("/manager/services", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setForm({
        code: "",
        name: "",
        averageServiceMinutes: 5,
        priorityEnabled: true,
      });
      void qc.invalidateQueries({ queryKey: ["services"] });
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <ManagerPage
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
                <th>Priority</th>
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
                  <td>{s.priorityEnabled ? "Enabled" : "Off"}</td>
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
    </ManagerPage>
  );
}
function CountersPage() {
  const qc = useQueryClient();
  const counters = useQuery<ManagerCounter[]>({
    queryKey: ["counters"],
    queryFn: () => api("/manager/counters"),
  });
  const services = useQuery<NamedService[]>({
    queryKey: ["services"],
    queryFn: () => api("/manager/services"),
  });
  const [form, setForm] = useState({ label: "", assignedServiceId: "" });
  const create = async () => {
    await api("/manager/counters", {
      method: "POST",
      body: JSON.stringify(form),
    });
    setForm({ label: "", assignedServiceId: "" });
    void qc.invalidateQueries({ queryKey: ["counters"] });
  };
  return (
    <ManagerPage title="Counter administration">
      <div className="split">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Counter</th>
                <th>Service</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {counters.data?.map((c) => (
                <tr key={c.id}>
                  <td>{c.label}</td>
                  <td>{c.assignedService?.name ?? "Unassigned"}</td>
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
    </ManagerPage>
  );
}
function StaffPage() {
  const qc = useQueryClient();
  const staff = useQuery<StaffListItem[]>({
    queryKey: ["staff"],
    queryFn: () => api("/manager/staff"),
  });
  const [form, setForm] = useState({
    staffCode: "",
    name: "",
    username: "",
    password: "",
    role: "TELLER",
  });
  const create = async () => {
    await api("/manager/staff", { method: "POST", body: JSON.stringify(form) });
    setForm({
      staffCode: "",
      name: "",
      username: "",
      password: "",
      role: "TELLER",
    });
    void qc.invalidateQueries({ queryKey: ["staff"] });
  };
  return (
    <ManagerPage title="Staff access">
      <div className="split">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Staff</th>
                <th>Role</th>
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
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              <option>TELLER</option>
              <option>MANAGER</option>
            </select>
          </label>
          <button className="primary" onClick={create}>
            Create account
          </button>
        </div>
      </div>
    </ManagerPage>
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
    queryFn: () => api("/manager/audit-logs"),
    refetchInterval: 10000,
  });
  return (
    <ManagerPage title="Immutable audit log">
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
    </ManagerPage>
  );
}
function SettingsPage() {
  const settings = useQuery<SettingsResponse>({
    queryKey: ["settings"],
    queryFn: () => api("/manager/settings"),
  });
  const [form, setForm] = useState<SettingsForm | null>(null);
  const values =
    form ??
    (settings.data
      ? { timezone: settings.data.timezone, ...settings.data.settings }
      : null);
  if (!values)
    return (
      <ManagerPage title="Branch settings">
        <div className="card">Loading settings…</div>
      </ManagerPage>
    );
  const save = () =>
    api("/manager/settings", {
      method: "PATCH",
      body: JSON.stringify(values),
    });
  return (
    <ManagerPage title="Branch settings">
      <div className="card stack" style={{ maxWidth: 700 }}>
        {[
          ["timezone", "Branch timezone"],
          ["noShowTimeoutSeconds", "No-show timeout (seconds)"],
          ["priorityFairnessLimit", "Maximum consecutive priority calls"],
          ["kioskIdleTimeoutSeconds", "Kiosk idle timeout (seconds)"],
          ["displayHistoryCount", "Recent calls on display"],
          ["slaWaitMinutes", "Long-wait alert (minutes)"],
        ].map(([key, label]) => (
          <label className="field" key={key}>
            <span>{label}</span>
            <input
              type={key === "timezone" ? "text" : "number"}
              value={values[key]}
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
        <button className="primary" onClick={save}>
          Save audited settings
        </button>
      </div>
    </ManagerPage>
  );
}

function Protected({
  role,
  children,
}: {
  role: "TELLER" | "MANAGER";
  children: React.ReactNode;
}) {
  const { user } = React.useContext(AuthContext);
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role)
    return (
      <Navigate to={user.role === "MANAGER" ? "/manager" : "/teller"} replace />
    );
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
          path="/manager/services"
          element={
            <Protected role="MANAGER">
              <ServicesPage />
            </Protected>
          }
        />
        <Route
          path="/manager/counters"
          element={
            <Protected role="MANAGER">
              <CountersPage />
            </Protected>
          }
        />
        <Route
          path="/manager/staff"
          element={
            <Protected role="MANAGER">
              <StaffPage />
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
          path="/manager/audit"
          element={
            <Protected role="MANAGER">
              <AuditPage />
            </Protected>
          }
        />
        <Route
          path="/manager/settings"
          element={
            <Protected role="MANAGER">
              <SettingsPage />
            </Protected>
          }
        />
        <Route
          path="*"
          element={
            <Navigate
              to={
                user
                  ? user.role === "MANAGER"
                    ? "/manager"
                    : "/teller"
                  : "/login"
              }
              replace
            />
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
