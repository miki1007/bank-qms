"use client";

import {
  ArrowRightLeft,
  BellRing,
  Building2,
  ChartNoAxesCombined,
  Check,
  CircleAlert,
  Clock3,
  Download,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Play,
  RefreshCw,
  RotateCcw,
  Smartphone,
  Tickets,
  UsersRound,
  Volume2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";

type Ticket = {
  id: string;
  public_number: string;
  service_code: string;
  service_name: string;
  priority: number;
  status: string;
  counter: string | null;
  called_at: string | null;
  started_at: string | null;
};

type Snapshot = {
  actor?: {
    displayName: string;
    username: string;
    role: "TELLER" | "MANAGER";
    assignedCounter: string | null;
    assignedServiceCode: string | null;
  };
  services: Array<{
    code: string;
    name: string;
    minutes: number;
    waiting: number;
  }>;
  tickets: Ticket[];
  metrics: {
    issued: number;
    waiting: number;
    serving: number;
    completed: number;
    noShow: number;
  };
};

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const emptySnapshot: Snapshot = {
  services: [],
  tickets: [],
  metrics: { issued: 0, waiting: 0, serving: 0, completed: 0, noShow: 0 },
};

function elapsed(value: string | null, now: Date) {
  if (!value) return "00:00";
  const total = Math.max(
    0,
    Math.floor((now.getTime() - new Date(value).getTime()) / 1000),
  );
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function MobileStaffClient() {
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  const [transferService, setTransferService] = useState("WDR");
  const [tab, setTab] = useState<"serve" | "queue" | "overview">("serve");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [online, setOnline] = useState(false);
  const [now, setNow] = useState(new Date());
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(
    null,
  );

  const refresh = useCallback(async (quiet = false) => {
    try {
      const response = await fetch("/api/showcase?surface=teller", {
        cache: "no-store",
      });
      const data = (await response.json()) as Snapshot & { error?: string };
      if (response.status === 401 || response.status === 403) {
        window.location.assign("/staff/login?next=%2Fstaff-app");
        return;
      }
      if (!response.ok)
        throw new Error(data.error || "Staff queue unavailable.");
      if (data.actor?.role === "MANAGER") {
        window.location.replace("/manager");
        return;
      }
      setSnapshot(data);
      setOnline(true);
      if (!quiet) setError("");
    } catch (caught) {
      setOnline(false);
      if (!quiet)
        setError(
          caught instanceof Error ? caught.message : "Staff queue unavailable.",
        );
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const queueTimer = window.setInterval(() => void refresh(true), 2_000);
    const clockTimer = window.setInterval(() => setNow(new Date()), 1_000);
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker.register("/mobile-sw.js");
    const onInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", onInstall);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(queueTimer);
      window.clearInterval(clockTimer);
      window.removeEventListener("beforeinstallprompt", onInstall);
    };
  }, [refresh]);

  const assignedCounter = snapshot.actor?.assignedCounter ?? null;
  const activeTicket = useMemo(
    () =>
      snapshot.tickets.find(
        (ticket) =>
          ticket.counter === assignedCounter &&
          ["CALLED", "IN_SERVICE"].includes(ticket.status),
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
  const assignedQueueWaiting =
    snapshot.services.find(
      (service) => service.code === snapshot.actor?.assignedServiceCode,
    )?.waiting ?? 0;

  async function mutate(
    key: string,
    payload: Record<string, unknown>,
    message: string,
  ) {
    setBusy(key);
    setError("");
    try {
      const response = await fetch("/api/showcase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as {
        snapshot?: Snapshot;
        error?: string;
      };
      if (response.status === 401 || response.status === 403) {
        window.location.assign("/staff/login?next=%2Fstaff-app");
        return;
      }
      if (!response.ok) throw new Error(data.error || "Operation failed.");
      if (data.snapshot) setSnapshot(data.snapshot);
      setNotice(message);
      window.setTimeout(() => setNotice(""), 2_400);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Operation failed.");
    } finally {
      setBusy("");
    }
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
      window.location.assign("/staff/login?next=%2Fstaff-app");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to log out safely.",
      );
      setBusy("");
    }
  }

  return (
    <main className="mobile-app mobile-staff-app">
      <header className="mobile-topbar staff-topbar">
        <div className="mobile-brand">
          <span>
            <Building2 />
          </span>
          <div>
            <strong>Bank QMS</strong>
            <small>{snapshot.actor?.displayName ?? "Secure staff"}</small>
          </div>
        </div>
        <div className="staff-header-actions">
          <span className={online ? "mobile-live" : "mobile-live offline"}>
            <i /> {online ? "Live" : "Offline"}
          </span>
          <button
            onClick={() => void logout()}
            aria-label="Log out"
            disabled={Boolean(busy)}
          >
            <LogOut />
            <span>{busy === "logout" ? "Logging out…" : "Log out"}</span>
          </button>
        </div>
      </header>

      <section className="mobile-content staff-mobile-content">
        {error && (
          <div className="mobile-alert" role="alert">
            <CircleAlert />
            <span>{error}</span>
            <button onClick={() => setError("")}>
              <X />
            </button>
          </div>
        )}
        {notice && (
          <div className="mobile-alert mobile-success" role="status">
            <Check />
            <span>{notice}</span>
          </div>
        )}

        <div className="staff-mobile-heading">
          <div>
            <span className="mobile-kicker">
              {snapshot.actor?.role ?? "Staff"} workspace
            </span>
            <h1>
              {tab === "serve"
                ? "Serve customers"
                : tab === "queue"
                  ? "Live queue"
                  : "Branch pulse"}
            </h1>
          </div>
          <div className="mobile-counter-lock">
            <span>Assigned counter</span>
            <strong>{assignedCounter ?? "Not assigned"}</strong>
            <small>{snapshot.actor?.username}</small>
          </div>
        </div>

        {tab === "serve" && (
          <div className="mobile-serve-view">
            <article className="mobile-current-ticket">
              <span className="mobile-kicker">
                <BellRing /> Current customer
              </span>
              {activeTicket ? (
                <>
                  <strong>{activeTicket.public_number}</strong>
                  <p>
                    {activeTicket.service_name} ·{" "}
                    {activeTicket.priority ? "Priority" : "Standard"}
                  </p>
                  <div className="mobile-service-clock">
                    <Clock3 />
                    <span>
                      {activeTicket.status === "CALLED"
                        ? "Called"
                        : "In service"}
                    </span>
                    <b>
                      {elapsed(
                        activeTicket.started_at ?? activeTicket.called_at,
                        now,
                      )}
                    </b>
                  </div>
                  <div className="mobile-action-grid">
                    {activeTicket.status === "CALLED" && (
                      <>
                        <Button
                          variant="outline"
                          onClick={() =>
                            void mutate(
                              "recall",
                              {
                                operation: "transition",
                                action: "recall",
                                ticketId: activeTicket.id,
                              },
                              "Customer recalled.",
                            )
                          }
                          disabled={Boolean(busy)}
                        >
                          <Volume2 /> Recall
                        </Button>
                        <Button
                          onClick={() =>
                            void mutate(
                              "start",
                              {
                                operation: "transition",
                                action: "start",
                                ticketId: activeTicket.id,
                              },
                              "Service started.",
                            )
                          }
                          disabled={Boolean(busy)}
                        >
                          <Play /> Start
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() =>
                            void mutate(
                              "no_show",
                              {
                                operation: "transition",
                                action: "no_show",
                                ticketId: activeTicket.id,
                              },
                              "Marked no-show.",
                            )
                          }
                          disabled={Boolean(busy)}
                        >
                          No-show
                        </Button>
                        <div className="mobile-transfer-row">
                          <select
                            value={transferCode}
                            onChange={(event) =>
                              setTransferService(event.target.value)
                            }
                            aria-label="Transfer service"
                          >
                            {transferOptions.map((service) => (
                              <option value={service.code} key={service.code}>
                                {service.name}
                              </option>
                            ))}
                          </select>
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
                                "Ticket transferred and requeued.",
                              )
                            }
                            disabled={Boolean(busy) || !transferCode}
                          >
                            <ArrowRightLeft /> Transfer
                          </Button>
                        </div>
                      </>
                    )}
                    {activeTicket.status === "IN_SERVICE" && (
                      <Button
                        className="mobile-complete-button"
                        onClick={() =>
                          void mutate(
                            "complete",
                            {
                              operation: "transition",
                              action: "complete",
                              ticketId: activeTicket.id,
                            },
                            "Service completed.",
                          )
                        }
                        disabled={Boolean(busy)}
                      >
                        <Check /> Complete service
                      </Button>
                    )}
                  </div>
                </>
              ) : (
                <div className="mobile-empty-ticket">
                  <Tickets />
                  <strong>Counter ready</strong>
                  <p>
                    {assignedQueueWaiting
                      ? `${assignedQueueWaiting} waiting in your service queue.`
                      : "Your service queue is currently clear."}
                  </p>
                </div>
              )}
            </article>
            <Button
              className="mobile-call-next"
              onClick={() =>
                void mutate(
                  "call",
                  { operation: "call_next" },
                  "Next customer called.",
                )
              }
              disabled={
                Boolean(busy) ||
                Boolean(activeTicket) ||
                !assignedCounter ||
                assignedQueueWaiting === 0
              }
            >
              {busy === "call" ? (
                <LoaderCircle className="spin" />
              ) : (
                <BellRing />
              )}{" "}
              Call next customer
            </Button>
            {!activeTicket && recentNoShow && (
              <Button
                className="mobile-requeue-button"
                variant="outline"
                onClick={() =>
                  void mutate(
                    "requeue",
                    {
                      operation: "transition",
                      action: "requeue",
                      ticketId: recentNoShow.id,
                    },
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

        {tab === "queue" && (
          <div className="mobile-queue-view">
            {snapshot.services.map((service) => (
              <article key={service.code}>
                <span>{service.code}</span>
                <div>
                  <strong>{service.name}</strong>
                  <small>{service.minutes} min target</small>
                </div>
                <b>
                  {service.waiting}
                  <small>waiting</small>
                </b>
              </article>
            ))}
            <Button variant="outline" onClick={() => void refresh()}>
              <RefreshCw /> Refresh queue
            </Button>
          </div>
        )}

        {tab === "overview" && snapshot.actor?.role === "MANAGER" && (
          <div className="mobile-overview-view">
            <div className="mobile-kpi-grid">
              <article>
                <Tickets />
                <span>Issued</span>
                <strong>{snapshot.metrics.issued}</strong>
              </article>
              <article>
                <UsersRound />
                <span>Waiting</span>
                <strong>{snapshot.metrics.waiting}</strong>
              </article>
              <article>
                <Play />
                <span>Serving</span>
                <strong>{snapshot.metrics.serving}</strong>
              </article>
              <article>
                <Check />
                <span>Completed</span>
                <strong>{snapshot.metrics.completed}</strong>
              </article>
            </div>
            <a className="mobile-desktop-link" href="/manager">
              <LayoutDashboard />
              <span>
                <strong>Open full manager dashboard</strong>
                <small>Reports, counters, audit and settings</small>
              </span>
            </a>
          </div>
        )}
      </section>

      <nav className="mobile-bottom-nav" aria-label="Staff mobile navigation">
        <button
          className={tab === "serve" ? "active" : ""}
          onClick={() => setTab("serve")}
        >
          <Smartphone />
          <span>Serve</span>
        </button>
        <button
          className={tab === "queue" ? "active" : ""}
          onClick={() => setTab("queue")}
        >
          <Tickets />
          <span>Queue</span>
        </button>
        {snapshot.actor?.role === "MANAGER" && (
          <button
            className={tab === "overview" ? "active" : ""}
            onClick={() => setTab("overview")}
          >
            <ChartNoAxesCombined />
            <span>Overview</span>
          </button>
        )}
      </nav>

      {installPrompt && (
        <button
          className="mobile-install-banner"
          onClick={async () => {
            await installPrompt.prompt();
            await installPrompt.userChoice;
            setInstallPrompt(null);
          }}
        >
          <Download /> Install Staff App
        </button>
      )}
    </main>
  );
}
