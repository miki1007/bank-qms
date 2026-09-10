"use client";

import {
  AlertTriangle,
  Activity,
  ArrowRightLeft,
  BanknoteArrowDown,
  BanknoteArrowUp,
  BellRing,
  BriefcaseBusiness,
  Building2,
  Check,
  CircleDollarSign,
  Clock3,
  Download,
  LoaderCircle,
  LogOut,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Settings,
  TicketCheck,
  Tickets,
  UserRound,
  UserCog,
  UsersRound,
  Volume2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BankLogo } from "./bank-logo";
import {
  BANK_BRANCHES,
  BANK_NAME,
  DEFAULT_BRANCH_CODE,
  bankBranch,
} from "@/lib/bank-brand";
import { clientUuid } from "@/lib/client-id";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

export type QmsSurface = "kiosk" | "display" | "teller" | "manager" | "admin";

type Ticket = {
  id: string;
  public_number: string;
  service_code: string;
  service_name: string;
  priority: number;
  priority_requested?: number;
  status: string;
  counter: string | null;
  created_at: string;
  called_at: string | null;
  started_at: string | null;
  completed_at: string | null;
};

type QueueEvent = {
  id: string;
  ticket_id: string | null;
  type: string;
  detail: string;
  created_at: string;
};

type Service = {
  code: string;
  name: string;
  minutes: number;
  icon: string;
  waiting: number;
  priorityEnabled?: boolean;
};

type ServiceConfiguration = {
  code: string;
  name: string;
  target_minutes: number;
  priority_enabled: boolean;
  active: boolean;
};

type StaffDirectoryEntry = {
  id: string;
  username: string;
  display_name: string;
  role: "TELLER" | "MANAGER";
  assigned_counter: string | null;
  assigned_service_code: string | null;
  active: number;
  last_login_at: string | null;
};

type Analytics = {
  statusDistribution: Array<{ status: string; value: number }>;
  hourlyDemand: Array<{ hour: number; value: number }>;
  weeklyThroughput: Array<{
    date: string;
    label: string;
    issued: number;
    completed: number;
  }>;
  servicePerformance: Array<{
    code: string;
    name: string;
    targetMinutes: number;
    issued: number;
    waiting: number;
    completed: number;
    averageWaitMinutes: number;
    averageServiceMinutes: number;
    slaBreaches: number;
  }>;
  flow: {
    reserved: number;
    waiting: number;
    called: number;
    serving: number;
    completed: number;
  };
};

type Snapshot = {
  generatedAt: string;
  branch: { code: string; name: string; timezone: string };
  services: Service[];
  tickets: Ticket[];
  events: QueueEvent[];
  activeCall: Ticket | null;
  settings: { priorityStreak: number; priorityLimit: number };
  counters?: Array<{ counter: string; status: string; service_code: string }>;
  serviceConfiguration?: ServiceConfiguration[];
  staff?: StaffDirectoryEntry[];
  actorMetrics?: {
    servedToday: number;
    averageServiceMinutes: number;
    noShow: number;
  };
  analytics?: Analytics;
  actor?: {
    id: string;
    username: string;
    displayName: string;
    role: "TELLER" | "MANAGER";
    assignedCounter: string | null;
    assignedServiceCode: string | null;
  };
  metrics: {
    issued: number;
    waiting: number;
    serving: number;
    completed: number;
    noShow: number;
  };
};

const emptySnapshot: Snapshot = {
  generatedAt: new Date(0).toISOString(),
  branch: {
    code: "SUMMIT",
    name: "Summit Branch",
    timezone: "Africa/Addis_Ababa",
  },
  services: [],
  tickets: [],
  events: [],
  activeCall: null,
  settings: { priorityStreak: 0, priorityLimit: 2 },
  metrics: { issued: 0, waiting: 0, serving: 0, completed: 0, noShow: 0 },
};

const serviceIcons = {
  DEP: BanknoteArrowDown,
  WDR: BanknoteArrowUp,
  LON: BriefcaseBusiness,
  NAC: UserRound,
};

const counters = ["Counter 1", "Counter 2", "Counter 3", "Counter 4"];

function formatClock(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Addis_Ababa",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(value);
}

function formatTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Addis_Ababa",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function elapsed(value: string | null, now: Date) {
  if (!value) return "00:00";
  const seconds = Math.max(
    0,
    Math.floor((now.getTime() - new Date(value).getTime()) / 1000),
  );
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(
    seconds % 60,
  ).padStart(2, "0")}`;
}

function statusLabel(status: string) {
  return status.toLowerCase().replaceAll("_", " ");
}

export function QmsClient({ surface }: { surface: QmsSurface }) {
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [selectedService, setSelectedService] = useState("DEP");
  const [priority, setPriority] = useState(false);
  const [priorityReason, setPriorityReason] = useState("ELDERLY");
  const [issuedTicket, setIssuedTicket] = useState<Ticket | null>(null);
  const [lookupToken, setLookupToken] = useState("");
  const [transferService, setTransferService] = useState("WDR");
  const [now, setNow] = useState(new Date());
  const [branchCode, setBranchCode] = useState<string>(() => {
    if (typeof window === "undefined") return DEFAULT_BRANCH_CODE;
    const code = new URLSearchParams(window.location.search).get("branch");
    return bankBranch(code)?.code ?? DEFAULT_BRANCH_CODE;
  });
  const [arrival, setArrival] = useState<{
    code: string;
    expiresAt: string;
  } | null>(null);
  const [auditEntries, setAuditEntries] = useState<Array<{
    id: string;
    action: string;
    detail: string;
    created_at: string;
  }> | null>(null);
  const [reportFrom, setReportFrom] = useState(
    new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Addis_Ababa" }),
  );
  const [reportTo, setReportTo] = useState(reportFrom);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const requestIntents = useRef(
    new Map<string, { key: string; proof: string }>(),
  );

  const refresh = useCallback(
    async (quiet = false) => {
      try {
        const response = await fetch(
          `/api/showcase?surface=${surface}${surface === "kiosk" || surface === "display" ? `&branch=${branchCode}` : ""}`,
          {
            cache: "no-store",
          },
        );
        const data = (await response.json()) as Snapshot & { error?: string };
        if (response.status === 401 || response.status === 403) {
          window.location.assign(
            `/staff/login?next=${encodeURIComponent(`/${surface}`)}`,
          );
          return;
        }
        if (!response.ok)
          throw new Error(data.error || "Queue data is unavailable.");
        setSnapshot(data);
        setConnected(true);
        setError("");
      } catch (caught) {
        setConnected(false);
        if (!quiet) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Could not load queue data.",
          );
        }
      } finally {
        setLoading(false);
      }
    },
    [surface, branchCode],
  );

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const poll = window.setInterval(() => void refresh(true), 2_000);
    const clock = window.setInterval(() => setNow(new Date()), 1_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(poll);
      window.clearInterval(clock);
    };
  }, [refresh]);

  async function mutate(
    key: string,
    payload: Record<string, unknown>,
    successMessage: string,
  ) {
    setBusy(key);
    setError("");
    setNotice("");
    const intentKey = JSON.stringify(payload);
    if (!requestIntents.current.has(intentKey))
      requestIntents.current.set(intentKey, {
        key: clientUuid(),
        proof: clientUuid() + clientUuid(),
      });
    const intent = requestIntents.current.get(intentKey)!;
    try {
      const response = await fetch("/api/showcase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          idempotencyKey: intent.key,
          ...(payload.operation === "issue"
            ? { lookupToken: intent.proof, branchCode, channel: "KIOSK" }
            : {}),
        }),
      });
      const data = (await response.json()) as {
        ticket?: Ticket;
        lookupToken?: string;
        snapshot?: Snapshot;
        error?: string;
        code?: string;
        expiresAt?: string;
        entries?: Array<{
          id: string;
          action: string;
          detail: string;
          created_at: string;
        }>;
      };
      if (
        (response.status === 401 || response.status === 403) &&
        (surface === "teller" || surface === "manager" || surface === "admin")
      ) {
        window.location.assign(
          `/staff/login?next=${encodeURIComponent(`/${surface}`)}`,
        );
        return null;
      }
      if (!response.ok) throw new Error(data.error || "The operation failed.");
      requestIntents.current.delete(intentKey);
      if (data.code && data.expiresAt)
        setArrival({ code: data.code, expiresAt: data.expiresAt });
      if (data.entries) setAuditEntries(data.entries);
      if (data.snapshot) setSnapshot(data.snapshot);
      setConnected(true);
      setNotice(successMessage);
      return data;
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "The operation failed.",
      );
      return null;
    } finally {
      setBusy("");
    }
  }

  const assignedCounter = snapshot.actor?.assignedCounter ?? null;
  const counterState =
    snapshot.counters?.find((counter) => counter.counter === assignedCounter)
      ?.status ?? "CLOSED";
  const activeTicket = useMemo(
    () =>
      snapshot.tickets.find(
        (ticket) =>
          ticket.counter === assignedCounter &&
          (ticket.status === "CALLED" || ticket.status === "IN_SERVICE"),
      ) ?? null,
    [assignedCounter, snapshot.tickets],
  );

  const recentNoShow = useMemo(
    () =>
      snapshot.tickets.find(
        (ticket) =>
          ticket.counter === assignedCounter && ticket.status === "NO_SHOW",
      ) ?? null,
    [assignedCounter, snapshot.tickets],
  );

  const recentCalls = useMemo(
    () =>
      snapshot.events
        .filter((event) => event.type === "display.call")
        .slice(0, 6)
        .map((event) => ({
          event,
          ticket: snapshot.tickets.find(
            (ticket) => ticket.id === event.ticket_id,
          ),
        })),
    [snapshot.events, snapshot.tickets],
  );

  const displayedIssuedTicket = issuedTicket
    ? (snapshot.tickets.find((ticket) => ticket.id === issuedTicket.id) ??
      issuedTicket)
    : null;
  const transferOptions = activeTicket
    ? snapshot.services.filter(
        (service) => service.code !== activeTicket.service_code,
      )
    : snapshot.services;
  const transferCode = transferOptions.some(
    (service) => service.code === transferService,
  )
    ? transferService
    : (transferOptions[0]?.code ?? "");
  const calledDisplay = snapshot.activeCall ?? recentCalls[0]?.ticket ?? null;
  const totalWaitingMinutes = snapshot.services.reduce(
    (sum, service) => sum + service.waiting * service.minutes,
    0,
  );
  const assignedQueueWaiting =
    snapshot.services.find(
      (service) => service.code === snapshot.actor?.assignedServiceCode,
    )?.waiting ?? 0;
  const analytics = snapshot.analytics;
  const weeklyMaximum = Math.max(
    1,
    ...(analytics?.weeklyThroughput.flatMap((day) => [
      day.issued,
      day.completed,
    ]) ?? [1]),
  );
  const weeklyIssuedPoints =
    analytics?.weeklyThroughput
      .map(
        (day, index) =>
          `${35 + index * 105},${150 - (day.issued / weeklyMaximum) * 110}`,
      )
      .join(" ") ?? "";
  const weeklyCompletedPoints =
    analytics?.weeklyThroughput
      .map(
        (day, index) =>
          `${35 + index * 105},${150 - (day.completed / weeklyMaximum) * 110}`,
      )
      .join(" ") ?? "";
  const hourlyMaximum = Math.max(
    1,
    ...(analytics?.hourlyDemand.map((hour) => hour.value) ?? [1]),
  );

  async function issue() {
    const result = await mutate(
      "issue",
      {
        operation: "issue",
        serviceCode: selectedService,
        priority,
        priorityReason: priority ? priorityReason : null,
      },
      "Ticket issued successfully.",
    );
    if (result?.ticket) {
      setIssuedTicket(result.ticket);
      setLookupToken(result.lookupToken ?? "");
    }
  }

  async function transition(ticketId: string, action: string, message: string) {
    const result = await mutate(
      `${action}:${ticketId}`,
      {
        operation: "transition",
        ticketId,
        action,
        ...(action === "cancel" ? { lookupToken } : {}),
      },
      message,
    );
    if (result?.ticket && result.ticket.id === issuedTicket?.id) {
      setIssuedTicket(result.ticket);
    }
    return result;
  }

  async function logout() {
    setBusy("logout");
    setError("");
    try {
      const response = await fetch("/api/showcase/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(result.error || "Unable to log out safely.");
      window.location.assign("/staff/login");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to log out safely.",
      );
      setBusy("");
    }
  }

  async function exportCsv() {
    setBusy("export");
    setError("");
    try {
      const response = await fetch("/api/showcase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "export_csv",
          from: reportFrom,
          to: reportTo,
        }),
      });
      if (response.status === 401 || response.status === 403) {
        window.location.assign("/staff/login?next=%2Fmanager");
        return;
      }
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error || "Report export failed.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `bank-qms-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setNotice("Audited CSV report downloaded.");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Report export failed.",
      );
    } finally {
      setBusy("");
    }
  }

  return (
    <main className={`qms-shell surface-${surface}`}>
      {surface !== "display" && (
        <header className="qms-header">
          <Link
            className="qms-brand"
            aria-label={BANK_NAME}
            href={
              surface === "teller"
                ? "/teller"
                : surface === "manager" || surface === "admin"
                  ? "/manager"
                  : "/"
            }
          >
            <BankLogo />
            <span>
              <strong>{BANK_NAME}</strong>
            </span>
          </Link>
          {surface === "kiosk" ? (
            <div className="wl-inline">
              <label className="wl-branch-select">
                Branch
                <select
                  value={branchCode}
                  onChange={(event) => {
                    setBranchCode(event.target.value);
                    setIssuedTicket(null);
                    setLookupToken("");
                  }}
                >
                  {BANK_BRANCHES.map((branch) => (
                    <option key={branch.code} value={branch.code}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </label>
              <a className="staff-entry" href="/staff/login">
                Staff sign in
              </a>
            </div>
          ) : snapshot.actor ? (
            <nav className="staff-navigation" aria-label="Staff navigation">
              {snapshot.actor?.role === "TELLER" ? (
                <a href="/teller" aria-current="page">
                  Teller console
                </a>
              ) : (
                <a href="/manager" aria-current="page">
                  Manager dashboard
                </a>
              )}
            </nav>
          ) : null}
          <div className="header-meta">
            {snapshot.actor && (
              <span className="actor-name">{snapshot.actor.displayName}</span>
            )}
            <span className="branch-name">{snapshot.branch.name}</span>
            <span
              className={connected ? "connection online" : "connection offline"}
            >
              <i /> {connected ? "Live" : "Reconnecting"}
            </span>
            <span className="header-clock">
              <Clock3 /> {formatClock(now)}
            </span>
            {surface !== "kiosk" && (
              <button
                className="logout-button"
                onClick={() => void logout()}
                aria-label="Log out"
                disabled={busy === "logout"}
              >
                <LogOut />
                <span>{busy === "logout" ? "Logging out…" : "Log out"}</span>
              </button>
            )}
          </div>
        </header>
      )}

      {error && (
        <div className="system-message error-message" role="alert">
          <AlertTriangle /> <span>{error}</span>
          <button onClick={() => setError("")} aria-label="Dismiss error">
            <X />
          </button>
        </div>
      )}
      {notice && (
        <div className="system-message success-message" role="status">
          <Check /> <span>{notice}</span>
          <button onClick={() => setNotice("")} aria-label="Dismiss message">
            <X />
          </button>
        </div>
      )}

      <div className="route-stage" key={surface}>
        {(surface === "teller" || surface === "manager") &&
          snapshot.tickets.some(
            (ticket) =>
              ticket.priority_requested &&
              !ticket.priority &&
              ["WAITING", "RESERVED"].includes(ticket.status),
          ) && (
            <section className="wl-priority-approvals">
              <h2>Priority requests awaiting verification</h2>
              <p>
                Confirm the customer’s eligibility before approving. Reasons
                stay private.
              </p>
              {snapshot.tickets
                .filter(
                  (ticket) =>
                    ticket.priority_requested &&
                    !ticket.priority &&
                    ["WAITING", "RESERVED"].includes(ticket.status),
                )
                .map((ticket) => (
                  <div key={ticket.id}>
                    <strong>{ticket.public_number}</strong>
                    <span>{ticket.service_name}</span>
                    <Button
                      variant="outline"
                      disabled={!!busy}
                      onClick={() =>
                        void mutate(
                          `priority:${ticket.id}`,
                          {
                            operation: "approve_priority",
                            ticketId: ticket.id,
                          },
                          "Priority approved and audited.",
                        )
                      }
                    >
                      Verify & approve
                    </Button>
                  </div>
                ))}
            </section>
          )}
        {surface === "kiosk" && (
          <section className="kiosk-view">
            <div className="view-heading centered-heading">
              <span className="eyebrow">Customer self-service</span>
              <h1>How can we help you today?</h1>
              <p>
                Choose a service, confirm your priority option, and collect your
                ticket.
              </p>
            </div>

            {loading ? (
              <div className="loading-state">
                <LoaderCircle className="spin" /> Loading services…
              </div>
            ) : (
              <div className="service-grid">
                {snapshot.services.map((service) => {
                  const Icon =
                    serviceIcons[service.code as keyof typeof serviceIcons] ??
                    CircleDollarSign;
                  return (
                    <button
                      className={`service-card ${selectedService === service.code ? "selected" : ""}`}
                      key={service.code}
                      onClick={() => setSelectedService(service.code)}
                      aria-pressed={selectedService === service.code}
                    >
                      <span className="service-icon">
                        <Icon />
                      </span>
                      <span className="service-copy">
                        <strong>{service.name}</strong>
                        <small>About {service.minutes} min service</small>
                      </span>
                      <span className="queue-count">
                        {service.waiting}
                        <small>waiting</small>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="kiosk-action-bar">
              <label className="priority-control">
                <Switch checked={priority} onCheckedChange={setPriority} />
                <span>
                  <strong>Priority service</strong>
                  <small>For eligible customers</small>
                </span>
              </label>
              {priority && (
                <label className="priority-reason-control">
                  <span>Eligibility reason</span>
                  <select
                    value={priorityReason}
                    onChange={(event) => setPriorityReason(event.target.value)}
                  >
                    <option value="ELDERLY">Elderly customer</option>
                    <option value="DISABILITY">Customer with disability</option>
                    <option value="PREGNANCY">Pregnancy</option>
                    <option value="OTHER">Other eligible need</option>
                  </select>
                  <small>Private and never shown on the display.</small>
                </label>
              )}
              <Button
                className="primary-action"
                size="lg"
                onClick={issue}
                disabled={Boolean(busy) || loading}
              >
                {busy === "issue" ? (
                  <LoaderCircle className="spin" />
                ) : (
                  <TicketCheck />
                )}
                Get my ticket
              </Button>
            </div>

            {displayedIssuedTicket && (
              <div
                className="ticket-result"
                role="region"
                aria-label="Issued ticket"
              >
                <div className="ticket-result-copy">
                  <span className="eyebrow">Your queue ticket</span>
                  <strong>{displayedIssuedTicket.public_number}</strong>
                  <p>
                    {displayedIssuedTicket.service_name} ·{" "}
                    {displayedIssuedTicket.priority ? "Priority" : "Standard"}
                  </p>
                </div>
                <div className="ticket-result-side">
                  <span>Keep this number visible</span>
                  {displayedIssuedTicket.status === "WAITING" && (
                    <Button
                      variant="outline"
                      onClick={() =>
                        void transition(
                          displayedIssuedTicket.id,
                          "cancel",
                          "Ticket cancelled.",
                        )
                      }
                      disabled={Boolean(busy)}
                    >
                      Cancel ticket
                    </Button>
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {surface === "teller" && (
          <section className="teller-view">
            <div className="view-heading split-heading">
              <div>
                <span className="eyebrow">Teller workspace</span>
                <h1>Serve the next customer</h1>
                <p>
                  Queue changes are immediately reflected across every view.
                </p>
              </div>
              <div className="counter-picker locked-counter">
                <span>Manager-assigned counter</span>
                <strong>{assignedCounter ?? "Not assigned"}</strong>
                <small>{snapshot.actor?.username}</small>
                <small>
                  {snapshot.branch.name} · {counterState.toLowerCase()}
                </small>
              </div>
            </div>

            <div
              className="teller-shift-strip"
              aria-label="Today's shift summary"
            >
              <div>
                <TicketCheck />
                <span>
                  <small>Completed today</small>
                  <strong>{snapshot.actorMetrics?.servedToday ?? 0}</strong>
                </span>
              </div>
              <div>
                <Clock3 />
                <span>
                  <small>Average service</small>
                  <strong>
                    {snapshot.actorMetrics?.averageServiceMinutes ?? 0} min
                  </strong>
                </span>
              </div>
              <div>
                <Activity />
                <span>
                  <small>Your ready queue</small>
                  <strong>{assignedQueueWaiting}</strong>
                </span>
              </div>
            </div>

            <div className="wl-counter-toolbar">
              <Button
                disabled={!!busy || !!activeTicket}
                onClick={() =>
                  void mutate(
                    "counter",
                    {
                      operation: "counter",
                      action:
                        counterState === "CLOSED"
                          ? "open"
                          : counterState === "PAUSED"
                            ? "resume"
                            : "pause",
                    },
                    "Counter updated.",
                  )
                }
              >
                {counterState === "CLOSED"
                  ? "Open counter session"
                  : counterState === "PAUSED"
                    ? "Resume counter"
                    : "Pause counter"}
              </Button>
              {counterState !== "CLOSED" && (
                <Button
                  variant="outline"
                  disabled={!!busy || !!activeTicket}
                  onClick={() =>
                    void mutate(
                      "counter-close",
                      { operation: "counter", action: "close" },
                      "Counter session closed.",
                    )
                  }
                >
                  Close session
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() =>
                  void mutate(
                    "arrival",
                    { operation: "arrival_code" },
                    "Arrival code is ready for customers at this branch.",
                  )
                }
              >
                Show arrival code
              </Button>
            </div>
            {arrival && new Date(arrival.expiresAt) > now && (
              <div className="wl-arrival-code">
                <span>{snapshot.branch.name} arrival code</span>
                <strong>{arrival.code}</strong>
                <small>
                  Give this code to customers who have arrived. Valid until{" "}
                  {new Date(arrival.expiresAt).toLocaleTimeString("en-GB", {
                    timeZone: "Africa/Addis_Ababa",
                  })}
                  .
                </small>
              </div>
            )}
            <div className="teller-grid">
              <div className="current-ticket-panel">
                <div className="panel-label">
                  <BellRing /> Current customer
                </div>
                {activeTicket ? (
                  <>
                    <div className="current-ticket-number">
                      {activeTicket.public_number}
                    </div>
                    <div className="current-ticket-meta">
                      <span>{activeTicket.service_name}</span>
                      {activeTicket.priority ? (
                        <b>Priority</b>
                      ) : (
                        <b>Standard</b>
                      )}
                    </div>
                    <div className="service-timer">
                      <Clock3 />
                      <span>
                        {activeTicket.status === "CALLED"
                          ? "Called"
                          : "In service"}
                      </span>
                      <strong>
                        {elapsed(
                          activeTicket.started_at ?? activeTicket.called_at,
                          now,
                        )}
                      </strong>
                    </div>
                    <div className="teller-actions">
                      {activeTicket.status === "CALLED" && (
                        <>
                          <Button
                            variant="outline"
                            onClick={() =>
                              void transition(
                                activeTicket.id,
                                "recall",
                                "Customer recalled on the display.",
                              )
                            }
                            disabled={Boolean(busy)}
                          >
                            <Volume2 /> Recall
                          </Button>
                          <Button
                            onClick={() =>
                              void transition(
                                activeTicket.id,
                                "start",
                                "Service started.",
                              )
                            }
                            disabled={Boolean(busy)}
                          >
                            <Play /> Start service
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() =>
                              void transition(
                                activeTicket.id,
                                "no_show",
                                "Customer marked no-show.",
                              )
                            }
                            disabled={Boolean(busy)}
                          >
                            No-show
                          </Button>
                        </>
                      )}
                      {activeTicket.status === "IN_SERVICE" && (
                        <Button
                          className="complete-action"
                          onClick={() =>
                            void transition(
                              activeTicket.id,
                              "complete",
                              "Service completed.",
                            )
                          }
                          disabled={Boolean(busy)}
                        >
                          <Check /> Complete service
                        </Button>
                      )}
                    </div>
                    {activeTicket.status === "CALLED" && (
                      <div className="transfer-row">
                        <label>
                          <span>Transfer customer</span>
                          <select
                            value={transferCode}
                            onChange={(event) =>
                              setTransferService(event.target.value)
                            }
                          >
                            {transferOptions.map((service) => (
                              <option value={service.code} key={service.code}>
                                {service.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <Button
                          variant="outline"
                          onClick={() =>
                            void mutate(
                              "transfer",
                              {
                                operation: "transfer",
                                ticketId: activeTicket.id,
                                serviceCode: transferCode,
                              },
                              "Ticket transferred.",
                            )
                          }
                          disabled={Boolean(busy)}
                        >
                          <ArrowRightLeft /> Transfer
                        </Button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="empty-current">
                    <span>
                      <UsersRound />
                    </span>
                    <h2>No active customer</h2>
                    <p>
                      {assignedQueueWaiting
                        ? `${assignedQueueWaiting} customer${assignedQueueWaiting === 1 ? " is" : "s are"} ready in your service queue.`
                        : "The queue is clear."}
                    </p>
                    <Button
                      className="call-next-action"
                      size="lg"
                      onClick={() =>
                        void mutate(
                          "call-next",
                          { operation: "call_next" },
                          "Next customer called.",
                        )
                      }
                      disabled={
                        Boolean(busy) ||
                        !assignedCounter ||
                        counterState !== "OPEN" ||
                        assignedQueueWaiting === 0
                      }
                    >
                      {busy === "call-next" ? (
                        <LoaderCircle className="spin" />
                      ) : (
                        <BellRing />
                      )}
                      Call next
                    </Button>
                    {recentNoShow && (
                      <Button
                        variant="outline"
                        onClick={() =>
                          void transition(
                            recentNoShow.id,
                            "requeue",
                            `${recentNoShow.public_number} returned to the queue.`,
                          )
                        }
                        disabled={Boolean(busy)}
                      >
                        <RotateCcw /> Requeue {recentNoShow.public_number}
                      </Button>
                    )}
                  </div>
                )}
              </div>

              <aside className="queue-sidebar">
                <div className="sidebar-title">
                  <span>Live queue</span>
                  <strong>{snapshot.metrics.waiting} waiting</strong>
                </div>
                {snapshot.services.map((service) => (
                  <div className="queue-service-row" key={service.code}>
                    <span className="service-code">{service.code}</span>
                    <div>
                      <strong>{service.name}</strong>
                      <small>Target {service.minutes} min</small>
                    </div>
                    <b>{service.waiting}</b>
                  </div>
                ))}
                <div className="queue-policy">
                  <ShieldCheck />
                  <p>
                    <strong>Fair priority active</strong>
                    <span>
                      After {snapshot.settings.priorityLimit} consecutive
                      priority calls, the oldest standard ticket is selected.
                    </span>
                  </p>
                </div>
              </aside>
            </div>
          </section>
        )}

        {surface === "display" && (
          <section className="display-view">
            <div className="display-header">
              <div>
                <BankLogo />
                <strong>{BANK_NAME}</strong>
              </div>
              <div>
                <label className="wl-display-branch">
                  Branch
                  <select
                    aria-label="Display branch"
                    value={branchCode}
                    onChange={(event) => setBranchCode(event.target.value)}
                  >
                    {BANK_BRANCHES.map((branch) => (
                      <option value={branch.code} key={branch.code}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                </label>
                <strong>{formatClock(now)}</strong>
              </div>
            </div>
            <div className="display-main">
              <div className="display-call">
                <span>Now serving</span>
                <strong>{calledDisplay?.public_number ?? "—"}</strong>
                <small>
                  {calledDisplay
                    ? calledDisplay.service_name
                    : "Waiting for the next call"}
                </small>
              </div>
              <div className="display-counter">
                <span>Please proceed to</span>
                <strong>
                  {calledDisplay?.counter?.replace("Counter ", "") ?? "—"}
                </strong>
                <small>Counter</small>
              </div>
            </div>
            <div className="recent-call-strip">
              <span className="recent-title">Recent calls</span>
              {recentCalls.length ? (
                recentCalls.slice(0, 4).map(({ event, ticket }) => (
                  <div className="recent-call" key={event.id}>
                    <strong>{ticket?.public_number ?? "Ticket"}</strong>
                    <span>{ticket?.counter ?? "—"}</span>
                  </div>
                ))
              ) : (
                <div className="display-empty">No customers called yet</div>
              )}
            </div>
            {!connected && (
              <div className="display-warning">
                <RefreshCw className="spin" /> Reconnecting · Last safe queue
                snapshot remains visible
              </div>
            )}
          </section>
        )}

        {surface === "manager" && (
          <section className="manager-view">
            <div className="view-heading split-heading">
              <div>
                <span className="eyebrow">Operations overview</span>
                <h1>Branch dashboard</h1>
                <p>
                  Live queue performance from persisted ticket and event
                  records.
                </p>
              </div>
              <div className="manager-actions">
                <label className="fairness-setting">
                  <span>Priority call limit</span>
                  <select
                    value={snapshot.settings.priorityLimit}
                    onChange={(event) =>
                      void mutate(
                        "priority-limit",
                        {
                          operation: "set_priority_limit",
                          limit: Number(event.target.value),
                        },
                        "Priority fairness limit updated.",
                      )
                    }
                    disabled={Boolean(busy)}
                  >
                    {[1, 2, 3, 4, 5].map((limit) => (
                      <option value={limit} key={limit}>
                        {limit}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  variant="outline"
                  onClick={() => void exportCsv()}
                  disabled={Boolean(busy)}
                >
                  <Download /> Export CSV
                </Button>
                <Button variant="outline" onClick={() => void refresh()}>
                  <RefreshCw /> Refresh
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    void mutate(
                      "arrival",
                      { operation: "arrival_code" },
                      "Arrival code is ready.",
                    )
                  }
                >
                  Show arrival code
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    void mutate(
                      "audit",
                      { operation: "audit" },
                      "Audit log loaded.",
                    )
                  }
                >
                  View audit log
                </Button>
              </div>
            </div>

            <div className="wl-report-filters">
              <label>
                Report from
                <input
                  type="date"
                  value={reportFrom}
                  onChange={(event) => setReportFrom(event.target.value)}
                />
              </label>
              <label>
                Report to
                <input
                  type="date"
                  value={reportTo}
                  onChange={(event) => setReportTo(event.target.value)}
                />
              </label>
              <span>CSV exports use this range and your assigned branch.</span>
            </div>
            {arrival && new Date(arrival.expiresAt) > now && (
              <div className="wl-arrival-code">
                <span>{snapshot.branch.name} arrival code</span>
                <strong>{arrival.code}</strong>
                <small>
                  Valid for two minutes. Give it only to customers who have
                  arrived at this branch.
                </small>
              </div>
            )}
            {auditEntries && (
              <div className="wl-audit">
                <div className="wl-inline">
                  <h2>Audit log</h2>
                  <Button
                    variant="outline"
                    onClick={() => setAuditEntries(null)}
                  >
                    Close
                  </Button>
                </div>
                {auditEntries.length ? (
                  <table>
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Action</th>
                        <th>Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditEntries.map((entry) => (
                        <tr key={entry.id}>
                          <td>
                            {new Date(entry.created_at).toLocaleString(
                              "en-GB",
                              { timeZone: "Africa/Addis_Ababa" },
                            )}
                          </td>
                          <td>{entry.action}</td>
                          <td>{entry.detail}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p>No audit entries yet.</p>
                )}
              </div>
            )}
            <div className="metric-grid">
              <article>
                <span className="metric-icon mint">
                  <Tickets />
                </span>
                <div>
                  <small>Tickets issued</small>
                  <strong>{snapshot.metrics.issued}</strong>
                  <span>Today</span>
                </div>
              </article>
              <article>
                <span className="metric-icon amber">
                  <UsersRound />
                </span>
                <div>
                  <small>Waiting now</small>
                  <strong>{snapshot.metrics.waiting}</strong>
                  <span>{totalWaitingMinutes} estimated queue min</span>
                </div>
              </article>
              <article>
                <span className="metric-icon blue">
                  <Play />
                </span>
                <div>
                  <small>In service</small>
                  <strong>{snapshot.metrics.serving}</strong>
                  <span>Across {counters.length} counters</span>
                </div>
              </article>
              <article>
                <span className="metric-icon violet">
                  <Check />
                </span>
                <div>
                  <small>Completed</small>
                  <strong>{snapshot.metrics.completed}</strong>
                  <span>{snapshot.metrics.noShow} no-show</span>
                </div>
              </article>
            </div>

            <div className="manager-analytics-grid">
              <article className="manager-panel analytics-trend">
                <div className="manager-panel-head">
                  <div>
                    <strong>Seven-day throughput</strong>
                    <span>Issued and completed tickets from real records</span>
                  </div>
                  <div className="chart-legend" aria-label="Chart legend">
                    <span className="issued">Issued</span>
                    <span className="completed">Completed</span>
                  </div>
                </div>
                {analytics?.weeklyThroughput.some(
                  (day) => day.issued || day.completed,
                ) ? (
                  <div className="line-chart-wrap">
                    <svg
                      className="line-chart"
                      viewBox="0 0 700 190"
                      role="img"
                      aria-label="Issued and completed tickets over seven days"
                    >
                      {[40, 95, 150].map((y) => (
                        <line key={y} x1="35" y1={y} x2="665" y2={y} />
                      ))}
                      <polyline
                        className="issued-line"
                        points={weeklyIssuedPoints}
                      />
                      <polyline
                        className="completed-line"
                        points={weeklyCompletedPoints}
                      />
                      {analytics.weeklyThroughput.map((day, index) => (
                        <g key={day.date}>
                          <circle
                            className="issued-point"
                            cx={35 + index * 105}
                            cy={150 - (day.issued / weeklyMaximum) * 110}
                            r="4"
                          />
                          <circle
                            className="completed-point"
                            cx={35 + index * 105}
                            cy={150 - (day.completed / weeklyMaximum) * 110}
                            r="4"
                          />
                          <text x={35 + index * 105} y="178">
                            {day.label}
                          </text>
                        </g>
                      ))}
                    </svg>
                  </div>
                ) : (
                  <div className="chart-empty">
                    Create tickets to begin the trend.
                  </div>
                )}
              </article>

              <article className="manager-panel demand-chart">
                <div className="manager-panel-head">
                  <div>
                    <strong>Hourly demand</strong>
                    <span>Reservations by Addis Ababa hour</span>
                  </div>
                </div>
                <div className="hour-bars" aria-label="Hourly ticket demand">
                  {analytics?.hourlyDemand.map((hour) => (
                    <div key={hour.hour} title={`${hour.value} tickets`}>
                      <b>{hour.value}</b>
                      <span>
                        <i
                          style={{
                            height: `${Math.max(5, (hour.value / hourlyMaximum) * 100)}%`,
                          }}
                        />
                      </span>
                      <small>{String(hour.hour).padStart(2, "0")}</small>
                    </div>
                  ))}
                </div>
              </article>
            </div>

            <article className="manager-panel flow-panel">
              <div className="manager-panel-head">
                <div>
                  <strong>Live customer flow</strong>
                  <span>Current movement through the branch queue</span>
                </div>
                <Activity />
              </div>
              <div className="flow-diagram" aria-label="Live ticket flow">
                {[
                  ["Reserved", analytics?.flow.reserved ?? 0],
                  ["Checked in", analytics?.flow.waiting ?? 0],
                  ["Called", analytics?.flow.called ?? 0],
                  ["In service", analytics?.flow.serving ?? 0],
                  ["Completed", analytics?.flow.completed ?? 0],
                ].map(([label, value], index) => (
                  <div key={String(label)}>
                    <span>{index + 1}</span>
                    <strong>{value}</strong>
                    <small>{label}</small>
                    {index < 4 && <i aria-hidden="true">→</i>}
                  </div>
                ))}
              </div>
            </article>

            <article className="manager-panel service-performance-panel">
              <div className="manager-panel-head">
                <div>
                  <strong>Service performance</strong>
                  <span>Wait, service time and SLA comparison</span>
                </div>
              </div>
              <div className="service-performance-grid">
                {analytics?.servicePerformance.map((service) => (
                  <div key={service.code}>
                    <span className="service-code">{service.code}</span>
                    <p>
                      <strong>{service.name}</strong>
                      <small>{service.completed} completed today</small>
                    </p>
                    <dl>
                      <div>
                        <dt>Avg wait</dt>
                        <dd>{service.averageWaitMinutes}m</dd>
                      </div>
                      <div>
                        <dt>Avg service</dt>
                        <dd>{service.averageServiceMinutes}m</dd>
                      </div>
                      <div>
                        <dt>SLA breaches</dt>
                        <dd>{service.slaBreaches}</dd>
                      </div>
                    </dl>
                  </div>
                ))}
              </div>
            </article>

            <div className="manager-grid">
              <div className="manager-panel">
                <div className="manager-panel-head">
                  <div>
                    <strong>Service queues</strong>
                    <span>Current demand by service</span>
                  </div>
                  <span className="live-label">
                    <i /> Live
                  </span>
                </div>
                <div className="manager-service-list">
                  {snapshot.services.map((service) => (
                    <div key={service.code}>
                      <span className="service-code">{service.code}</span>
                      <p>
                        <strong>{service.name}</strong>
                        <small>{service.minutes} min target</small>
                      </p>
                      <div className="queue-bar">
                        <i
                          style={{
                            width: `${Math.min(100, service.waiting * 16)}%`,
                          }}
                        />
                      </div>
                      <b>{service.waiting}</b>
                    </div>
                  ))}
                </div>
              </div>
              <div className="manager-panel">
                <div className="manager-panel-head">
                  <div>
                    <strong>Counter status</strong>
                    <span>Active assignments</span>
                  </div>
                </div>
                <div className="counter-list">
                  {counters.map((counter) => {
                    const ticket = snapshot.tickets.find(
                      (item) =>
                        item.counter === counter &&
                        ["CALLED", "IN_SERVICE"].includes(item.status),
                    );
                    return (
                      <div key={counter}>
                        <span
                          className={
                            ticket ? "counter-dot busy" : "counter-dot"
                          }
                        />
                        <p>
                          <strong>{counter}</strong>
                          <small>
                            {ticket
                              ? ticket.public_number
                              : (snapshot.counters
                                  ?.find((item) => item.counter === counter)
                                  ?.status?.toLowerCase() ?? "closed")}
                          </small>
                        </p>
                        <span
                          className={`status-pill ${ticket ? ticket.status.toLowerCase() : "available"}`}
                        >
                          {ticket
                            ? statusLabel(ticket.status)
                            : (snapshot.counters
                                ?.find((item) => item.counter === counter)
                                ?.status?.toLowerCase() ?? "closed")}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="manager-panel table-panel">
              <div className="manager-panel-head">
                <div>
                  <strong>Ticket activity</strong>
                  <span>Latest authoritative queue records</span>
                </div>
                <span>{snapshot.tickets.length} records</span>
              </div>
              <div className="ticket-table-wrap">
                <table className="ticket-table">
                  <thead>
                    <tr>
                      <th>Ticket</th>
                      <th>Service</th>
                      <th>Class</th>
                      <th>Status</th>
                      <th>Counter</th>
                      <th>Issued</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.tickets.length ? (
                      snapshot.tickets.slice(0, 12).map((ticket) => (
                        <tr key={ticket.id}>
                          <td>
                            <strong>{ticket.public_number}</strong>
                          </td>
                          <td>{ticket.service_name}</td>
                          <td>{ticket.priority ? "Priority" : "Standard"}</td>
                          <td>
                            <span
                              className={`status-pill ${ticket.status.toLowerCase()}`}
                            >
                              {statusLabel(ticket.status)}
                            </span>
                          </td>
                          <td>{ticket.counter ?? "—"}</td>
                          <td>{formatTime(ticket.created_at)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="empty-table">
                          No tickets yet. Issue one from the kiosk.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="manager-panel audit-panel">
              <div className="manager-panel-head">
                <div>
                  <strong>Event trail</strong>
                  <span>Immutable workflow activity</span>
                </div>
              </div>
              <div className="event-list">
                {snapshot.events.length ? (
                  snapshot.events.slice(0, 8).map((event) => (
                    <div key={event.id}>
                      <span className="event-mark" />
                      <p>
                        <strong>{event.detail}</strong>
                        <small>{event.type}</small>
                      </p>
                      <time>{formatTime(event.created_at)}</time>
                    </div>
                  ))
                ) : (
                  <div className="empty-table">
                    Workflow events will appear here.
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {surface === "admin" && (
          <section className="admin-view">
            <div className="view-heading split-heading">
              <div>
                <span className="eyebrow">Manager-only administration</span>
                <h1>Branch control center</h1>
                <p>
                  Configure staff and services without changing operational
                  history or exposing customer information.
                </p>
              </div>
              <div className="admin-identity">
                <ShieldCheck />
                <span>
                  <small>Authorized administrator</small>
                  <strong>{snapshot.actor?.displayName}</strong>
                  <b>{snapshot.branch.name}</b>
                </span>
              </div>
            </div>

            <div className="admin-summary-grid">
              <article>
                <UserCog />
                <span>
                  <small>Active staff</small>
                  <strong>
                    {snapshot.staff?.filter((staff) => staff.active).length ??
                      0}
                  </strong>
                </span>
              </article>
              <article>
                <Building2 />
                <span>
                  <small>Configured counters</small>
                  <strong>{counters.length}</strong>
                </span>
              </article>
              <article>
                <Settings />
                <span>
                  <small>Active services</small>
                  <strong>
                    {snapshot.serviceConfiguration?.filter(
                      (service) => service.active,
                    ).length ?? 0}
                  </strong>
                </span>
              </article>
              <article>
                <ShieldCheck />
                <span>
                  <small>Priority fairness</small>
                  <strong>{snapshot.settings.priorityLimit}:1</strong>
                </span>
              </article>
            </div>

            <div className="admin-grid">
              <article className="manager-panel admin-staff-panel">
                <div className="manager-panel-head">
                  <div>
                    <strong>Staff and counter assignments</strong>
                    <span>
                      Each teller keeps one manager-controlled identity
                    </span>
                  </div>
                  <UserCog />
                </div>
                <div className="admin-staff-list">
                  {snapshot.staff?.map((staff) => (
                    <div
                      key={staff.id}
                      className={!staff.active ? "is-inactive" : ""}
                    >
                      <span className="staff-avatar">
                        {staff.display_name
                          .split(" ")
                          .map((name) => name[0])
                          .join("")
                          .slice(0, 2)}
                      </span>
                      <p>
                        <strong>{staff.display_name}</strong>
                        <small>
                          {staff.username} · {staff.role.toLowerCase()}
                        </small>
                      </p>
                      {staff.role === "TELLER" ? (
                        <>
                          <label>
                            <span>Counter</span>
                            <select
                              value={staff.assigned_counter ?? "Counter 1"}
                              disabled={!!busy || !staff.active}
                              onChange={(event) =>
                                void mutate(
                                  `staff-counter:${staff.id}`,
                                  {
                                    operation: "admin_staff_update",
                                    staffId: staff.id,
                                    assignedCounter: event.target.value,
                                    assignedServiceCode:
                                      staff.assigned_service_code ?? "DEP",
                                    active: Boolean(staff.active),
                                  },
                                  `${staff.display_name}'s counter was updated.`,
                                )
                              }
                            >
                              {counters.map((counter) => (
                                <option key={counter}>{counter}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            <span>Service</span>
                            <select
                              value={staff.assigned_service_code ?? "DEP"}
                              disabled={!!busy || !staff.active}
                              onChange={(event) =>
                                void mutate(
                                  `staff-service:${staff.id}`,
                                  {
                                    operation: "admin_staff_update",
                                    staffId: staff.id,
                                    assignedCounter:
                                      staff.assigned_counter ?? "Counter 1",
                                    assignedServiceCode: event.target.value,
                                    active: Boolean(staff.active),
                                  },
                                  `${staff.display_name}'s service was updated.`,
                                )
                              }
                            >
                              {snapshot.serviceConfiguration
                                ?.filter((service) => service.active)
                                .map((service) => (
                                  <option
                                    value={service.code}
                                    key={service.code}
                                  >
                                    {service.code} · {service.name}
                                  </option>
                                ))}
                            </select>
                          </label>
                          <Button
                            variant="outline"
                            disabled={!!busy}
                            onClick={() =>
                              void mutate(
                                `staff-active:${staff.id}`,
                                {
                                  operation: "admin_staff_update",
                                  staffId: staff.id,
                                  assignedCounter:
                                    staff.assigned_counter ?? "Counter 1",
                                  assignedServiceCode:
                                    staff.assigned_service_code ?? "DEP",
                                  active: !Boolean(staff.active),
                                },
                                `${staff.display_name} is now ${staff.active ? "inactive" : "active"}.`,
                              )
                            }
                          >
                            {staff.active ? "Deactivate" : "Activate"}
                          </Button>
                        </>
                      ) : (
                        <span className="protected-role">
                          <ShieldCheck /> Protected manager account
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </article>

              <article className="manager-panel admin-service-panel">
                <div className="manager-panel-head">
                  <div>
                    <strong>Service configuration</strong>
                    <span>Targets and private priority availability</span>
                  </div>
                  <Settings />
                </div>
                <div className="admin-service-list">
                  {snapshot.serviceConfiguration?.map((service) => (
                    <div
                      key={service.code}
                      className={!service.active ? "is-inactive" : ""}
                    >
                      <span className="service-code">{service.code}</span>
                      <p>
                        <strong>{service.name}</strong>
                        <small>
                          {service.active ? "Available" : "Unavailable"}
                        </small>
                      </p>
                      <label>
                        <span>Target</span>
                        <select
                          value={service.target_minutes}
                          disabled={!!busy}
                          onChange={(event) =>
                            void mutate(
                              `service-target:${service.code}`,
                              {
                                operation: "admin_service_update",
                                serviceCode: service.code,
                                targetMinutes: Number(event.target.value),
                                priorityEnabled: service.priority_enabled,
                                active: service.active,
                              },
                              `${service.name} target updated.`,
                            )
                          }
                        >
                          {[2, 4, 5, 10, 15, 20, 30, 45, 60].map((minutes) => (
                            <option value={minutes} key={minutes}>
                              {minutes} min
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="admin-switch">
                        <Switch
                          checked={service.priority_enabled}
                          disabled={!!busy}
                          onCheckedChange={(checked) =>
                            void mutate(
                              `service-priority:${service.code}`,
                              {
                                operation: "admin_service_update",
                                serviceCode: service.code,
                                targetMinutes: service.target_minutes,
                                priorityEnabled: checked,
                                active: service.active,
                              },
                              `${service.name} priority setting updated.`,
                            )
                          }
                        />
                        <span>Priority</span>
                      </label>
                      <Button
                        variant="outline"
                        disabled={!!busy}
                        onClick={() =>
                          void mutate(
                            `service-active:${service.code}`,
                            {
                              operation: "admin_service_update",
                              serviceCode: service.code,
                              targetMinutes: service.target_minutes,
                              priorityEnabled: service.priority_enabled,
                              active: !service.active,
                            },
                            `${service.name} is now ${service.active ? "inactive" : "active"}.`,
                          )
                        }
                      >
                        {service.active ? "Deactivate" : "Activate"}
                      </Button>
                    </div>
                  ))}
                </div>
              </article>
            </div>

            <div className="admin-grid secondary-admin-grid">
              <article className="manager-panel branch-policy-panel">
                <div className="manager-panel-head">
                  <div>
                    <strong>Branch policy</strong>
                    <span>Queue safeguards for {snapshot.branch.name}</span>
                  </div>
                  <Building2 />
                </div>
                <dl>
                  <div>
                    <dt>Timezone</dt>
                    <dd>{snapshot.branch.timezone}</dd>
                  </div>
                  <div>
                    <dt>Remote tickets</dt>
                    <dd>3 per customer / day</dd>
                  </div>
                  <div>
                    <dt>Cancellation cooldown</dt>
                    <dd>10 minutes</dd>
                  </div>
                  <div>
                    <dt>Priority call limit</dt>
                    <dd>
                      <select
                        value={snapshot.settings.priorityLimit}
                        disabled={!!busy}
                        onChange={(event) =>
                          void mutate(
                            "priority-limit-admin",
                            {
                              operation: "set_priority_limit",
                              limit: Number(event.target.value),
                            },
                            "Priority fairness limit updated.",
                          )
                        }
                      >
                        {[1, 2, 3, 4, 5].map((limit) => (
                          <option value={limit} key={limit}>
                            {limit} consecutive calls
                          </option>
                        ))}
                      </select>
                    </dd>
                  </div>
                </dl>
              </article>

              <article className="manager-panel security-panel">
                <div className="manager-panel-head">
                  <div>
                    <strong>Security operations</strong>
                    <span>Manager actions are audited and branch-scoped</span>
                  </div>
                  <ShieldCheck />
                </div>
                <div className="security-actions">
                  <div>
                    <p>
                      <strong>Audit trail</strong>
                      <small>
                        Review recent administrative and queue actions.
                      </small>
                    </p>
                    <Button
                      variant="outline"
                      disabled={!!busy}
                      onClick={() =>
                        void mutate(
                          "audit-admin",
                          { operation: "audit" },
                          "Audit log loaded.",
                        )
                      }
                    >
                      View log
                    </Button>
                  </div>
                  <div>
                    <p>
                      <strong>Revoke teller sessions</strong>
                      <small>
                        Require every teller at this branch to sign in again.
                      </small>
                    </p>
                    {confirmRevoke ? (
                      <span className="admin-confirm">
                        <Button
                          variant="destructive"
                          disabled={!!busy}
                          onClick={async () => {
                            await mutate(
                              "revoke-teller-sessions",
                              { operation: "admin_revoke_teller_sessions" },
                              "All teller sessions were revoked.",
                            );
                            setConfirmRevoke(false);
                          }}
                        >
                          Confirm revoke
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setConfirmRevoke(false)}
                        >
                          Cancel
                        </Button>
                      </span>
                    ) : (
                      <Button
                        variant="outline"
                        onClick={() => setConfirmRevoke(true)}
                      >
                        Revoke sessions
                      </Button>
                    )}
                  </div>
                </div>
              </article>
            </div>

            {auditEntries && (
              <article className="manager-panel table-panel admin-audit-table">
                <div className="manager-panel-head">
                  <div>
                    <strong>Administrative audit log</strong>
                    <span>Immutable branch activity</span>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setAuditEntries(null)}
                  >
                    Close
                  </Button>
                </div>
                <div className="ticket-table-wrap">
                  <table className="ticket-table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Action</th>
                        <th>Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditEntries.map((entry) => (
                        <tr key={entry.id}>
                          <td>{formatTime(entry.created_at)}</td>
                          <td>{entry.action}</td>
                          <td>{entry.detail}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
