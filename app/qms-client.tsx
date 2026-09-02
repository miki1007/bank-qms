"use client";

import {
  AlertTriangle,
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
  Settings2,
  ShieldCheck,
  TicketCheck,
  Tickets,
  UserRound,
  UsersRound,
  Volume2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

export type QmsSurface = "kiosk" | "display" | "teller" | "manager";

type Ticket = {
  id: string;
  public_number: string;
  service_code: string;
  service_name: string;
  priority: number;
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
};

type Snapshot = {
  generatedAt: string;
  branch: { code: string; name: string; timezone: string };
  services: Service[];
  tickets: Ticket[];
  events: QueueEvent[];
  activeCall: Ticket | null;
  settings: { priorityStreak: number; priorityLimit: number };
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
    code: "MAIN",
    name: "Main Branch",
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

  const refresh = useCallback(
    async (quiet = false) => {
      try {
        const response = await fetch(`/api/showcase?surface=${surface}`, {
          cache: "no-store",
        });
        const data = (await response.json()) as Snapshot & { error?: string };
        if (response.status === 401 || response.status === 403) {
          window.location.assign(
            `/staff/login?next=${encodeURIComponent(`/${surface}`)}`,
          );
          return;
        }
        if (!response.ok)
          throw new Error(data.error || "Queue data is unavailable.");
        if (surface === "teller" && data.actor?.role === "MANAGER") {
          window.location.replace("/manager");
          return;
        }
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
    [surface],
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
    try {
      const response = await fetch("/api/showcase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as {
        ticket?: Ticket;
        lookupToken?: string;
        snapshot?: Snapshot;
        error?: string;
      };
      if (
        (response.status === 401 || response.status === 403) &&
        (surface === "teller" || surface === "manager")
      ) {
        window.location.assign(
          `/staff/login?next=${encodeURIComponent(`/${surface}`)}`,
        );
        return null;
      }
      if (!response.ok) throw new Error(data.error || "The operation failed.");
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
    try {
      await fetch("/api/showcase/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
    } finally {
      window.location.assign("/staff/login");
    }
  }

  async function exportCsv() {
    setBusy("export");
    setError("");
    try {
      const response = await fetch("/api/showcase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "export_csv" }),
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
          <a className="qms-brand" aria-label="Bank QMS" href="/kiosk">
            <span className="brand-mark">
              <Building2 />
            </span>
            <span>
              <strong>Bank</strong> QMS
            </span>
          </a>
          {surface === "kiosk" ? (
            <a className="staff-entry" href="/staff/login">
              Staff sign in
            </a>
          ) : (
            <nav className="staff-navigation" aria-label="Staff navigation">
              <a
                href="/teller"
                aria-current={surface === "teller" ? "page" : undefined}
              >
                Teller console
              </a>
              {snapshot.actor?.role === "MANAGER" && (
                <a
                  href="/manager"
                  aria-current={surface === "manager" ? "page" : undefined}
                >
                  Manager dashboard
                </a>
              )}
            </nav>
          )}
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
              </div>
            </div>

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
                <span className="display-logo">
                  <Building2 />
                </span>
                <strong>Bank QMS</strong>
              </div>
              <div>
                <span>{snapshot.branch.name}</span>
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
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline">
                      <Settings2 /> Reset queue
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Reset all showcase queue data?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        This clears tickets, events, and daily showcase
                        sequences. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep data</AlertDialogCancel>
                      <AlertDialogAction
                        variant="destructive"
                        onClick={() => {
                          setIssuedTicket(null);
                          void mutate(
                            "reset",
                            { operation: "reset" },
                            "Showcase queue reset.",
                          );
                        }}
                      >
                        Reset queue
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>

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
                            {ticket ? ticket.public_number : "Available"}
                          </small>
                        </p>
                        <span
                          className={`status-pill ${ticket ? ticket.status.toLowerCase() : "available"}`}
                        >
                          {ticket ? statusLabel(ticket.status) : "open"}
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
      </div>
    </main>
  );
}
