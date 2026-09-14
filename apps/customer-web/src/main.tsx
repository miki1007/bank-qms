import React, { FormEvent, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  BellRing,
  Building2,
  Check,
  ChevronRight,
  Clock3,
  Download,
  Eye,
  EyeOff,
  Headphones,
  History,
  Landmark,
  ListChecks,
  LogOut,
  MapPin,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  TicketCheck,
  UserRound,
  WalletCards,
  Wifi,
  WifiOff,
} from "lucide-react";
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { io } from "socket.io-client";
import type {
  CustomerUser,
  PublicBranch,
  PublicService,
  TicketView,
} from "@qms/shared-types";
import { WorldLinkBrand } from "../../../packages/ui/src/index";
import "../../../packages/ui/src/theme.css";
import "./customer.css";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api/v1";
const SOCKET = import.meta.env.VITE_SOCKET_URL ?? "http://localhost:3000";
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 8_000 } },
});
let accessToken = "";
let refreshPromise: Promise<AuthResult> | null = null;

type AuthResult = { accessToken: string; user: CustomerUser };
type TicketHistoryItem = {
  id: string;
  publicNumber: string;
  status: TicketView["status"];
  priority: boolean;
  issuedAt: string;
  calledAt: string | null;
  completedAt: string | null;
  serviceName: string;
  counterLabel: string | null;
  version: number;
  branch: PublicBranch;
};

type CustomerBankAccount = {
  id: string;
  accountType: string;
  name: string;
  maskedNumber: string;
  currency: string;
  ledgerBalanceMinor: number;
  availableBalanceMinor: number;
  status: string;
};

type CustomerBankTransaction = {
  id: string;
  accountId: string;
  accountName: string;
  maskedNumber: string;
  postedAt: string;
  description: string;
  category: string;
  amountMinor: number;
  balanceMinor: number;
  status: string;
};

type CustomerPortfolio = {
  currency: string;
  totalAvailableMinor: number;
  accounts: CustomerBankAccount[];
  transactions: CustomerBankTransaction[];
};

function money(minor: number, currency = "ETB") {
  return new Intl.NumberFormat("en-ET", {
    style: "currency",
    currency,
    currencyDisplay: "code",
    minimumFractionDigits: 2,
  }).format(minor / 100);
}

function greeting() {
  const hour = Number(
    new Intl.DateTimeFormat("en", {
      hour: "numeric",
      hour12: false,
      timeZone: "Africa/Addis_Ababa",
    }).format(new Date()),
  );
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      payload.error?.message ?? "Something went wrong. Please try again.",
    );
  return payload as T;
}

async function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API}/customer-auth/refresh`, {
      method: "POST",
      credentials: "include",
    })
      .then(parseResponse<AuthResult>)
      .then((result) => {
        accessToken = result.accessToken;
        return result;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

async function api<T>(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init.headers,
    },
  });
  if (response.status === 401 && retry && !path.startsWith("/customer-auth/")) {
    try {
      await refreshSession();
      return api<T>(path, init, false);
    } catch {
      accessToken = "";
      window.dispatchEvent(new Event("qms-customer-session-expired"));
    }
  }
  return parseResponse<T>(response);
}

function AuthScreen({
  onAuthenticated,
}: {
  onAuthenticated: (value: AuthResult) => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await parseResponse<AuthResult>(
        await fetch(`${API}/customer-auth/${mode}`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            mode === "register"
              ? form
              : { email: form.email, password: form.password },
          ),
        }),
      );
      accessToken = result.accessToken;
      onAuthenticated(result);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to continue.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-screen">
      <section className="auth-hero">
        <WorldLinkBrand
          className="light"
          subtitle="Customer banking and queue portal"
        />
        <div className="hero-orbit orbit-one" />
        <div className="hero-orbit orbit-two" />
        <div className="auth-copy">
          <p className="eyebrow">Banking, without the guesswork</p>
          <h1>Your money and branch visits, clearly in one place.</h1>
          <p>
            Review your demonstration accounts, download a statement, join a
            branch queue, and follow your position live.
          </p>
          <div className="trust-row">
            <ShieldCheck size={18} /> Your queue history is private to your
            account.
          </div>
        </div>
      </section>
      <section className="auth-panel">
        <div className="segmented" aria-label="Account action">
          <button
            className={mode === "login" ? "active" : ""}
            onClick={() => setMode("login")}
          >
            Sign in
          </button>
          <button
            className={mode === "register" ? "active" : ""}
            onClick={() => setMode("register")}
          >
            Create account
          </button>
        </div>
        <div className="form-intro">
          <h2>{mode === "login" ? "Welcome back" : "Create your account"}</h2>
          <p>
            {mode === "login"
              ? "Continue to your accounts and live tickets."
              : "One secure account keeps your banking demo and branch tickets together."}
          </p>
        </div>
        <form onSubmit={submit} className="auth-form">
          {mode === "register" && (
            <label>
              Full name
              <input
                autoComplete="name"
                required
                minLength={2}
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
              />
            </label>
          )}
          <label>
            Email address
            <input
              type="email"
              autoComplete="email"
              required
              value={form.email}
              onChange={(event) =>
                setForm({ ...form, email: event.target.value })
              }
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              required
              minLength={mode === "register" ? 10 : 1}
              value={form.password}
              onChange={(event) =>
                setForm({ ...form, password: event.target.value })
              }
            />
          </label>
          {mode === "register" && (
            <p className="field-note">
              Use 10+ characters with uppercase, lowercase, and a number.
            </p>
          )}
          {error && (
            <div className="inline-error" role="alert">
              {error}
            </div>
          )}
          <button className="primary-action" disabled={busy}>
            {busy
              ? "Please wait…"
              : mode === "login"
                ? "Sign in securely"
                : "Create account"}
            <ChevronRight size={19} />
          </button>
        </form>
      </section>
    </main>
  );
}

function StatusPill({ status }: { status: TicketView["status"] }) {
  const label =
    status === "IN_SERVICE"
      ? "In service"
      : status.charAt(0) + status.slice(1).toLowerCase();
  return (
    <span className={`status-pill status-${status.toLowerCase()}`}>
      {label}
    </span>
  );
}

function BankingHome({
  user,
  connected,
}: {
  user: CustomerUser;
  connected: boolean;
}) {
  const portfolio = useQuery<CustomerPortfolio>({
    queryKey: ["customer-portfolio"],
    queryFn: () => api("/customers/me/portfolio"),
  });
  const [balancesHidden, setBalancesHidden] = useState(false);
  const [activityFilter, setActivityFilter] = useState<
    "ALL" | "INCOME" | "SPENDING"
  >("ALL");
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [downloadError, setDownloadError] = useState("");

  const transactions =
    portfolio.data?.transactions.filter((transaction) => {
      if (activityFilter === "INCOME") return transaction.amountMinor > 0;
      if (activityFilter === "SPENDING") return transaction.amountMinor < 0;
      return true;
    }) ?? [];

  const downloadStatement = async () => {
    setDownloadBusy(true);
    setDownloadError("");
    try {
      const request = () =>
        fetch(`${API}/customers/me/statement.csv`, {
          credentials: "include",
          headers: accessToken
            ? { Authorization: `Bearer ${accessToken}` }
            : {},
        });
      let response = await request();
      if (response.status === 401) {
        await refreshSession();
        response = await request();
      }
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(
          payload.error?.message ?? "The statement could not be downloaded.",
        );
      }
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `worldlink-statement-${new Date()
        .toISOString()
        .slice(0, 10)}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setDownloadError(
        caught instanceof Error
          ? caught.message
          : "The statement could not be downloaded.",
      );
    } finally {
      setDownloadBusy(false);
    }
  };

  return (
    <div className="banking-home page-enter">
      <aside className="banking-intro">
        <p className="eyebrow">Personal banking overview</p>
        <h1>
          {greeting()}.<span>Your money, clearly.</span>
        </h1>
        <p>
          Review your demonstration accounts and recent activity, then reserve a
          branch visit when you need in-person service.
        </p>
        <ul>
          <li>
            <WalletCards /> Account balances
          </li>
          <li>
            <ReceiptText /> Transaction history
          </li>
          <li>
            <TicketCheck /> Branch queue booking
          </li>
        </ul>
      </aside>

      <div className="banking-dashboard">
        <div className="banking-status-row">
          <span className={connected ? "portal-online" : "portal-offline"}>
            {connected ? <Wifi /> : <WifiOff />}
            {connected ? "Live services connected" : "Reconnecting"}
          </span>
          <span>Welcome, {user.name.split(" ")[0]}</span>
        </div>

        {portfolio.isError && (
          <div className="inline-error" role="alert">
            Your account overview is temporarily unavailable. You can safely
            retry.
            <button onClick={() => portfolio.refetch()}>Retry</button>
          </div>
        )}

        <section className="balance-hero" aria-live="polite">
          <div>
            <p>Total available balance</p>
            <h2>
              {portfolio.isLoading
                ? "Loading…"
                : balancesHidden
                  ? "••••••••"
                  : money(
                      portfolio.data?.totalAvailableMinor ?? 0,
                      portfolio.data?.currency,
                    )}
            </h2>
            <span>
              Across {portfolio.data?.accounts.length ?? 0} demonstration
              accounts
            </span>
          </div>
          <button
            className="balance-visibility"
            aria-label={balancesHidden ? "Show balances" : "Hide balances"}
            onClick={() => setBalancesHidden((value) => !value)}
          >
            {balancesHidden ? <Eye /> : <EyeOff />}
          </button>
          <span className="demo-funds">Demo funds</span>
        </section>

        <section className="quick-actions" aria-label="Quick actions">
          <Link to="/new">
            <TicketCheck />
            <span>
              <strong>Reserve a visit</strong>
              <small>Join a branch queue</small>
            </span>
            <ChevronRight />
          </Link>
          <button onClick={downloadStatement} disabled={downloadBusy}>
            <Download />
            <span>
              <strong>{downloadBusy ? "Preparing…" : "Get statement"}</strong>
              <small>Download secure CSV</small>
            </span>
            <ChevronRight />
          </button>
          <Link to="/new">
            <Landmark />
            <span>
              <strong>Loan consultation</strong>
              <small>Book an adviser</small>
            </span>
            <ChevronRight />
          </Link>
          <Link to="/new">
            <Headphones />
            <span>
              <strong>Customer support</strong>
              <small>Visit account services</small>
            </span>
            <ChevronRight />
          </Link>
        </section>
        {downloadError && (
          <div className="inline-error" role="alert">
            {downloadError}
          </div>
        )}

        <section className="accounts-section">
          <div className="banking-section-heading">
            <div>
              <p className="eyebrow">Your accounts</p>
              <h2>Balances at a glance</h2>
            </div>
            <button onClick={() => portfolio.refetch()}>Refresh</button>
          </div>
          <div className="account-card-grid">
            {portfolio.isLoading &&
              [0, 1].map((item) => (
                <div className="account-card account-skeleton" key={item} />
              ))}
            {portfolio.data?.accounts.map((account) => (
              <article className="account-card" key={account.id}>
                <div className="account-card-top">
                  <span className="account-icon">
                    <WalletCards />
                  </span>
                  <span className="account-state">Active</span>
                </div>
                <div>
                  <p>{account.name}</p>
                  <span>{account.maskedNumber}</span>
                </div>
                <strong>
                  {balancesHidden
                    ? "••••••"
                    : money(account.availableBalanceMinor, account.currency)}
                </strong>
                <small>Available balance</small>
              </article>
            ))}
          </div>
        </section>

        <section className="activity-section">
          <div className="banking-section-heading">
            <div>
              <p className="eyebrow">Recent activity</p>
              <h2>Transactions</h2>
            </div>
            <div className="activity-filters" aria-label="Filter transactions">
              {(["ALL", "INCOME", "SPENDING"] as const).map((filter) => (
                <button
                  key={filter}
                  className={activityFilter === filter ? "active" : ""}
                  onClick={() => setActivityFilter(filter)}
                >
                  {filter === "ALL"
                    ? "All"
                    : filter === "INCOME"
                      ? "Money in"
                      : "Money out"}
                </button>
              ))}
            </div>
          </div>
          <div className="transaction-list">
            {transactions.map((transaction) => {
              const incoming = transaction.amountMinor > 0;
              return (
                <article key={transaction.id}>
                  <span className={incoming ? "money-in" : "money-out"}>
                    {incoming ? <ArrowDownLeft /> : <ArrowUpRight />}
                  </span>
                  <div>
                    <strong>{transaction.description}</strong>
                    <small>
                      {transaction.accountName} ·{" "}
                      {new Date(transaction.postedAt).toLocaleDateString(
                        "en-ET",
                        { month: "short", day: "numeric" },
                      )}
                    </small>
                  </div>
                  <div className={incoming ? "amount-in" : "amount-out"}>
                    <strong>
                      {incoming ? "+" : ""}
                      {money(transaction.amountMinor, portfolio.data?.currency)}
                    </strong>
                    <small>{transaction.category}</small>
                  </div>
                </article>
              );
            })}
            {!portfolio.isLoading && transactions.length === 0 && (
              <div className="empty-card">
                <ReceiptText />
                <h3>No matching transactions</h3>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function QueueHome({
  user,
  connected,
}: {
  user: CustomerUser;
  connected: boolean;
}) {
  const history = useQuery<{ tickets: TicketHistoryItem[] }>({
    queryKey: ["customer-tickets"],
    queryFn: () => api("/customers/me/tickets"),
    refetchInterval: connected ? false : 10_000,
  });
  const active =
    history.data?.tickets.filter((ticket) =>
      ["WAITING", "CALLED", "IN_SERVICE"].includes(ticket.status),
    ) ?? [];
  return (
    <div className="screen-stack page-enter">
      <section className="welcome-card">
        <div>
          <p className="eyebrow">Good to see you</p>
          <h1>{user.name.split(" ")[0]}, where do you need to go?</h1>
        </div>
        <div className={`connection-chip ${connected ? "online" : "offline"}`}>
          {connected ? <Wifi size={15} /> : <WifiOff size={15} />}
          {connected ? "Live" : "Refreshing"}
        </div>
        <div className="welcome-glow" />
      </section>
      <Link to="/new" className="new-ticket-card">
        <span className="new-icon">
          <TicketCheck />
        </span>
        <span>
          <strong>Join a queue</strong>
          <small>Choose a branch and service</small>
        </span>
        <ChevronRight />
      </Link>
      <section>
        <div className="section-heading">
          <div>
            <p className="eyebrow">Right now</p>
            <h2>Active tickets</h2>
          </div>
          <span>{active.length}</span>
        </div>
        {history.isLoading && <div className="skeleton-card" />}
        {!history.isLoading && active.length === 0 && (
          <div className="empty-card">
            <Sparkles />
            <h3>No active queue</h3>
            <p>When you join one, live progress appears here.</p>
          </div>
        )}
        <div className="ticket-list">
          {active.map((ticket) => (
            <TicketCard key={ticket.id} ticket={ticket} />
          ))}
        </div>
      </section>
      <section>
        <div className="section-heading">
          <div>
            <p className="eyebrow">Recent</p>
            <h2>Your visits</h2>
          </div>
          <Link to="/history">View all</Link>
        </div>
        <div className="ticket-list compact">
          {history.data?.tickets
            .filter((ticket) => !active.includes(ticket))
            .slice(0, 3)
            .map((ticket) => (
              <TicketCard key={ticket.id} ticket={ticket} />
            ))}
        </div>
      </section>
    </div>
  );
}

function TicketCard({ ticket }: { ticket: TicketHistoryItem }) {
  return (
    <Link to={`/tickets/${ticket.id}`} className="ticket-card">
      <div className="ticket-number">{ticket.publicNumber}</div>
      <div className="ticket-copy">
        <strong>{ticket.serviceName}</strong>
        <small>
          <Building2 size={14} /> {ticket.branch.name}
        </small>
      </div>
      <StatusPill status={ticket.status} />
      <ChevronRight className="ticket-chevron" size={18} />
    </Link>
  );
}

function NewTicket() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [branch, setBranch] = useState<PublicBranch | null>(null);
  const [service, setService] = useState<PublicService | null>(null);
  const [priority, setPriority] = useState(false);
  const [reason, setReason] = useState("ELDERLY");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const branches = useQuery<PublicBranch[]>({
    queryKey: ["branches"],
    queryFn: () => api("/customers/branches"),
  });
  const services = useQuery<PublicService[]>({
    queryKey: ["services", branch?.code],
    queryFn: () => api(`/customers/branches/${branch!.code}/services`),
    enabled: Boolean(branch),
  });
  const submit = async () => {
    if (!branch || !service) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ ticket: TicketView }>(
        `/customers/branches/${branch.code}/tickets`,
        {
          method: "POST",
          body: JSON.stringify({
            serviceTypeId: service.id,
            priority,
            priorityReason: priority ? reason : null,
            idempotencyKey: crypto.randomUUID(),
          }),
        },
      );
      await queryClient.invalidateQueries({ queryKey: ["customer-tickets"] });
      navigate(`/tickets/${result.ticket.id}`, { replace: true });
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not join the queue.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="screen-stack page-enter">
      <header className="detail-header">
        <button
          aria-label="Go back"
          onClick={() => (step === 1 ? navigate("/queue") : setStep(step - 1))}
        >
          <ArrowLeft />
        </button>
        <div>
          <p>New ticket</p>
          <strong>Step {step} of 3</strong>
        </div>
        <span>{Math.round((step / 3) * 100)}%</span>
      </header>
      <div className="progress-track">
        <span style={{ width: `${(step / 3) * 100}%` }} />
      </div>
      {step === 1 && (
        <section>
          <p className="eyebrow">Choose location</p>
          <h1 className="screen-title">Which branch works for you?</h1>
          <div className="option-list">
            {branches.data?.map((item) => (
              <button
                key={item.code}
                className="option-card"
                onClick={() => {
                  setBranch(item);
                  setStep(2);
                }}
              >
                <span className="option-icon">
                  <MapPin />
                </span>
                <span>
                  <strong>{item.name}</strong>
                  <small>{item.location ?? "Branch services"}</small>
                </span>
                <ChevronRight />
              </button>
            ))}
          </div>
        </section>
      )}
      {step === 2 && (
        <section>
          <p className="eyebrow">Choose service</p>
          <h1 className="screen-title">What can we help with?</h1>
          <div className="option-list">
            {services.isLoading && <div className="skeleton-card" />}
            {services.data?.map((item) => (
              <button
                key={item.id}
                className="option-card service-option"
                onClick={() => {
                  setService(item);
                  setStep(3);
                }}
              >
                <span className="option-icon">
                  <ListChecks />
                </span>
                <span>
                  <strong>{item.name}</strong>
                  <small>
                    {item.waitingCount} waiting ·{" "}
                    {item.estimatedWaitMinutes == null
                      ? "No open counter"
                      : `about ${item.estimatedWaitMinutes} min`}
                  </small>
                </span>
                <ChevronRight />
              </button>
            ))}
          </div>
        </section>
      )}
      {step === 3 && branch && service && (
        <section>
          <p className="eyebrow">Review</p>
          <h1 className="screen-title">Ready to join?</h1>
          <div className="review-card">
            <div>
              <small>Branch</small>
              <strong>{branch.name}</strong>
            </div>
            <div>
              <small>Service</small>
              <strong>{service.name}</strong>
            </div>
            <div>
              <small>Estimated wait</small>
              <strong>
                {service.estimatedWaitMinutes == null
                  ? "Counter unavailable"
                  : `${service.estimatedWaitMinutes} minutes`}
              </strong>
            </div>
          </div>
          {service.priorityEnabled && (
            <div className="priority-card">
              <label>
                <input
                  type="checkbox"
                  checked={priority}
                  onChange={(event) => setPriority(event.target.checked)}
                />
                <span>
                  <strong>Priority assistance</strong>
                  <small>For eligible accessibility or care needs</small>
                </span>
              </label>
              {priority && (
                <select
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  aria-label="Priority reason"
                >
                  <option value="ELDERLY">Elderly customer</option>
                  <option value="DISABILITY">Disability</option>
                  <option value="PREGNANCY">Pregnancy</option>
                  <option value="OTHER">Other eligible need</option>
                </select>
              )}
            </div>
          )}
          {error && (
            <div className="inline-error" role="alert">
              {error}
            </div>
          )}
          <button
            className="primary-action"
            disabled={busy || service.estimatedWaitMinutes == null}
            onClick={submit}
          >
            {busy ? "Joining…" : "Confirm and join queue"}
            <Check size={19} />
          </button>
          <p className="privacy-note">
            <ShieldCheck size={16} /> Priority reasons are never shown on public
            displays.
          </p>
        </section>
      )}
    </div>
  );
}

function TicketDetails() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const ticket = useQuery<{ ticket: TicketView }>({
    queryKey: ["ticket", id],
    queryFn: () => api(`/customers/tickets/${id}`),
    refetchInterval: 10_000,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cancel = async () => {
    if (!window.confirm("Cancel this waiting ticket? This cannot be undone."))
      return;
    setBusy(true);
    setError("");
    try {
      await api(`/customers/tickets/${id}/cancel`, { method: "POST" });
      await Promise.all([
        ticket.refetch(),
        queryClient.invalidateQueries({ queryKey: ["customer-tickets"] }),
      ]);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to cancel ticket.",
      );
    } finally {
      setBusy(false);
    }
  };
  if (ticket.isLoading)
    return (
      <div className="screen-stack">
        <div className="skeleton-hero" />
      </div>
    );
  if (!ticket.data)
    return (
      <div className="screen-stack">
        <div className="empty-card">
          <h3>Ticket unavailable</h3>
          <button onClick={() => navigate("/queue")}>Return to queue</button>
        </div>
      </div>
    );
  const value = ticket.data.ticket;
  const called = value.status === "CALLED" || value.status === "IN_SERVICE";
  return (
    <div className="screen-stack page-enter">
      <header className="detail-header">
        <button aria-label="Go home" onClick={() => navigate("/queue")}>
          <ArrowLeft />
        </button>
        <div>
          <p>Live ticket</p>
          <strong>{value.serviceName}</strong>
        </div>
        <StatusPill status={value.status} />
      </header>
      <section className={`live-ticket ${called ? "called" : ""}`}>
        <div className="pulse-ring">
          <BellRing />
        </div>
        <p>{called ? "Please proceed to" : "Your queue number"}</p>
        <h1>{value.publicNumber}</h1>
        {called ? (
          <div className="counter-call">
            {value.counterLabel ?? "Assigned counter"}
          </div>
        ) : (
          <div className="wait-grid">
            <div>
              <strong>{value.peopleAhead ?? "—"}</strong>
              <small>people ahead</small>
            </div>
            <div>
              <strong>
                {value.estimatedWaitMinutes == null
                  ? "—"
                  : `~${value.estimatedWaitMinutes}`}
              </strong>
              <small>minutes</small>
            </div>
          </div>
        )}
        <div className="live-shimmer" />
      </section>
      <div className="notice-card">
        <Wifi size={18} />
        <div>
          <strong>Updates are live</strong>
          <p>
            Keep the app open or return any time. The database remains the
            source of truth.
          </p>
        </div>
      </div>
      <div className="timeline">
        <div className="done">
          <span>
            <Check />
          </span>
          <div>
            <strong>Ticket issued</strong>
            <small>{new Date(value.issuedAt).toLocaleString()}</small>
          </div>
        </div>
        <div className={value.status !== "WAITING" ? "done" : "current"}>
          <span>
            <Clock3 />
          </span>
          <div>
            <strong>
              {value.status === "WAITING"
                ? "Waiting in queue"
                : "Called to counter"}
            </strong>
            <small>
              {value.status === "WAITING"
                ? "We will update this screen automatically."
                : (value.counterLabel ?? "Check the public display.")}
            </small>
          </div>
        </div>
      </div>
      {error && (
        <div className="inline-error" role="alert">
          {error}
        </div>
      )}
      {value.status === "WAITING" && (
        <button className="danger-action" disabled={busy} onClick={cancel}>
          {busy ? "Cancelling…" : "Cancel ticket"}
        </button>
      )}
    </div>
  );
}

function HistoryScreen() {
  const history = useQuery<{ tickets: TicketHistoryItem[] }>({
    queryKey: ["customer-tickets"],
    queryFn: () => api("/customers/me/tickets"),
  });
  return (
    <div className="screen-stack page-enter">
      <header className="detail-header">
        <Link to="/queue" aria-label="Go to queue">
          <ArrowLeft />
        </Link>
        <div>
          <p>Your account</p>
          <strong>Ticket history</strong>
        </div>
        <History />
      </header>
      <div className="ticket-list">
        {history.data?.tickets.map((ticket) => (
          <TicketCard key={ticket.id} ticket={ticket} />
        ))}
      </div>
      {!history.isLoading && history.data?.tickets.length === 0 && (
        <div className="empty-card">
          <History />
          <h3>No tickets yet</h3>
        </div>
      )}
    </div>
  );
}

function AppShell({
  user,
  onLogout,
}: {
  user: CustomerUser;
  onLogout: () => void;
}) {
  const [connected, setConnected] = useState(false);
  const client = useQueryClient();
  const location = useLocation();
  useEffect(() => {
    const socket = io(`${SOCKET}/realtime`, {
      transports: ["websocket"],
      auth: { accessToken },
    });
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    for (const event of ["ticket.created", "ticket.updated"])
      socket.on(event, (envelope: { data?: { id?: string } }) => {
        client.invalidateQueries({ queryKey: ["customer-tickets"] });
        if (envelope.data?.id)
          client.invalidateQueries({ queryKey: ["ticket", envelope.data.id] });
      });
    return () => {
      socket.disconnect();
    };
  }, [client]);
  return (
    <div className="mobile-shell">
      <header className="app-header worldlink-app-header">
        <Link to="/" className="worldlink-home-link">
          <WorldLinkBrand subtitle="Customer portal" />
        </Link>
        <nav className="portal-switcher" aria-label="Customer portal">
          <Link
            to="/"
            className={
              location.pathname === "/" || location.pathname === "/customer"
                ? "active"
                : ""
            }
          >
            <WalletCards /> Accounts
          </Link>
          <Link
            to="/queue"
            className={
              location.pathname.startsWith("/queue") ||
              location.pathname.startsWith("/new") ||
              location.pathname.startsWith("/tickets") ||
              location.pathname.startsWith("/history")
                ? "active"
                : ""
            }
          >
            <TicketCheck /> Queue
          </Link>
        </nav>
        <div className="account-menu">
          <UserRound size={17} />
          <span>{user.name.split(" ")[0]}</span>
          <button aria-label="Sign out" onClick={onLogout}>
            <LogOut size={17} />
            <span>Log out</span>
          </button>
        </div>
      </header>
      <main className="app-content">
        <Routes>
          <Route
            path="/"
            element={<BankingHome user={user} connected={connected} />}
          />
          <Route
            path="/customer"
            element={<BankingHome user={user} connected={connected} />}
          />
          <Route
            path="/queue"
            element={<QueueHome user={user} connected={connected} />}
          />
          <Route path="/new" element={<NewTicket />} />
          <Route path="/tickets/:id" element={<TicketDetails />} />
          <Route path="/history" element={<HistoryScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <nav className="bottom-nav">
        <Link to="/">
          <WalletCards />
          <span>Accounts</span>
        </Link>
        <Link to="/queue" className="nav-primary">
          <TicketCheck />
          <span>Queue</span>
        </Link>
        <Link to="/history">
          <History />
          <span>History</span>
        </Link>
      </nav>
    </div>
  );
}

function Root() {
  const [session, setSession] = useState<CustomerUser | null>(null);
  const [restoring, setRestoring] = useState(true);
  useEffect(() => {
    refreshSession()
      .then((result) => setSession(result.user))
      .catch(() => setSession(null))
      .finally(() => setRestoring(false));
    const expired = () => setSession(null);
    window.addEventListener("qms-customer-session-expired", expired);
    return () =>
      window.removeEventListener("qms-customer-session-expired", expired);
  }, []);
  const logout = async () => {
    try {
      await api("/customer-auth/logout", { method: "POST" });
    } finally {
      accessToken = "";
      setSession(null);
      queryClient.clear();
    }
  };
  if (restoring)
    return (
      <div className="launch-screen">
        <div className="launch-mark">BQ</div>
        <p>Restoring your secure session…</p>
      </div>
    );
  if (!session)
    return (
      <AuthScreen
        onAuthenticated={(value) => {
          accessToken = value.accessToken;
          setSession(value.user);
        }}
      />
    );
  return <AppShell user={session} onLogout={logout} />;
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
