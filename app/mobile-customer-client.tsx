"use client";

import {
  ArrowLeft,
  ArrowRight,
  BanknoteArrowDown,
  BanknoteArrowUp,
  Bell,
  BriefcaseBusiness,
  Check,
  CircleAlert,
  Clock3,
  Download,
  LoaderCircle,
  MapPin,
  RefreshCw,
  Share2,
  TicketCheck,
  UserRound,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { BankLogo } from "./bank-logo";
import {
  BANK_BRANCHES,
  BANK_NAME,
  BANK_TIMEZONE,
  DEFAULT_BRANCH_CODE,
  bankBranch,
} from "@/lib/bank-brand";
import { clientUuid } from "@/lib/client-id";

type Ticket = {
  id: string;
  branch_code: string;
  public_number: string;
  service_code: string;
  service_name: string;
  priority: number;
  priority_requested: number;
  status: string;
  counter: string | null;
  created_at: string;
  check_in_opens_at: string | null;
  check_in_deadline: string | null;
};
type Service = {
  code: string;
  name: string;
  minutes: number;
  waiting: number;
  reserved: number;
  activeCounters: number;
  estimatedWaitMinutes: number | null;
};
type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
const icons = {
  DEP: BanknoteArrowDown,
  WDR: BanknoteArrowUp,
  LON: BriefcaseBusiness,
  NAC: UserRound,
};
const ticketStorageKey = "bank-qms-customer-ticket";
const time = (value: string | null) =>
  value
    ? new Date(value).toLocaleTimeString("en-GB", {
        timeZone: BANK_TIMEZONE,
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

async function request(payload: Record<string, unknown>) {
  const response = await fetch("/api/showcase", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      "The server could not respond. Your request is safe to retry.",
    );
  }
  if (!response.ok)
    throw new Error(data.error ?? "The request could not be completed.");
  return data;
}

export function MobileCustomerClient() {
  const [branch, setBranch] = useState<string>(() => {
    if (typeof window === "undefined") return DEFAULT_BRANCH_CODE;
    const selected = new URLSearchParams(window.location.search).get("branch");
    return bankBranch(selected)?.code ?? DEFAULT_BRANCH_CODE;
  });
  const [step, setStep] = useState(1);
  const [services, setServices] = useState<Service[]>([]);
  const [selectedService, setSelectedService] = useState("DEP");
  const [priority, setPriority] = useState(false),
    [priorityReason, setPriorityReason] = useState("ELDERLY");
  const [ticket, setTicket] = useState<Ticket | null>(null),
    [lookupToken, setLookupToken] = useState("");
  const [position, setPosition] = useState<number | null>(null),
    [estimate, setEstimate] = useState<number | null>(null);
  const [history, setHistory] = useState<Ticket[]>([]),
    [showHistory, setShowHistory] = useState(false);
  const [arrivalCode, setArrivalCode] = useState("");
  const [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [online, setOnline] = useState(true),
    [loading, setLoading] = useState(true),
    [confirmCancel, setConfirmCancel] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(
    null,
  );
  const intent = useRef<{
    selection: string;
    key: string;
    proof: string;
  } | null>(null);
  const previousStatus = useRef<string | null>(null);

  const refreshServices = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/showcase?surface=kiosk&branch=${encodeURIComponent(branch)}`,
        { cache: "no-store" },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Queue unavailable.");
      setServices(data.services ?? []);
      setOnline(true);
    } catch (caught) {
      setOnline(false);
      setError(caught instanceof Error ? caught.message : "Queue unavailable.");
    } finally {
      setLoading(false);
    }
  }, [branch]);

  const refreshTicket = useCallback(async (id: string, proof: string) => {
    try {
      const data = await request({
        operation: "lookup",
        ticketId: id,
        lookupToken: proof,
      });
      if (!data.ticket) throw new Error("Ticket unavailable.");
      if (
        previousStatus.current &&
        previousStatus.current !== data.ticket.status
      ) {
        setNotice(
          data.ticket.status === "CALLED"
            ? `Your turn! Please go to ${data.ticket.counter}.`
            : `Ticket status: ${data.ticket.status.toLowerCase().replaceAll("_", " ")}.`,
        );
        if ("Notification" in window && Notification.permission === "granted") {
          // Notification delivery never blocks ticket state from updating.
          void navigator.serviceWorker
            ?.getRegistration()
            .then((registration) =>
              registration?.showNotification(`${BANK_NAME} ticket update`, {
                body:
                  data.ticket.status === "CALLED"
                    ? `${data.ticket.public_number}: go to ${data.ticket.counter}.`
                    : `${data.ticket.public_number}: ${data.ticket.status}`,
                icon: "/worldlink-bank-logo.jpeg",
                tag: `ticket-${id}`,
              }),
            )
            .catch(() => {});
        }
      }
      previousStatus.current = data.ticket.status;
      setTicket(data.ticket);
      setPosition(data.position ?? null);
      setEstimate(data.estimatedWaitMinutes ?? null);
      setOnline(true);
    } catch (caught) {
      setOnline(false);
      setError(
        caught instanceof Error ? caught.message : "Ticket unavailable.",
      );
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void refreshServices(), 0);
    return () => window.clearTimeout(initial);
  }, [refreshServices]);
  useEffect(() => {
    const saved = window.localStorage.getItem(ticketStorageKey);
    const restore = window.setTimeout(() => {
      if (saved)
        try {
          const value = JSON.parse(saved);
          setLookupToken(value.lookupToken ?? "");
          void refreshTicket(value.id, value.lookupToken ?? "");
        } catch {
          window.localStorage.removeItem(ticketStorageKey);
        }
    }, 0);
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker.register("/mobile-sw.js").catch(() => {});
    const install = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", install);
    return () => {
      window.clearTimeout(restore);
      window.removeEventListener("beforeinstallprompt", install);
    };
  }, [refreshTicket]);
  const ticketId = ticket?.id,
    ticketStatus = ticket?.status;
  useEffect(() => {
    if (
      !ticketId ||
      !ticketStatus ||
      ["COMPLETED", "CANCELLED", "EXPIRED"].includes(ticketStatus)
    )
      return;
    const timer = window.setInterval(
      () => void refreshTicket(ticketId, lookupToken),
      3000,
    );
    return () => window.clearInterval(timer);
  }, [ticketId, ticketStatus, lookupToken, refreshTicket]);

  async function issueTicket() {
    if (busy) return;
    setBusy("issue");
    setError("");
    const selection = JSON.stringify({
      branch,
      selectedService,
      priority,
      priorityReason,
    });
    if (intent.current?.selection !== selection)
      intent.current = {
        selection,
        key: clientUuid(),
        proof: clientUuid() + clientUuid(),
      };
    try {
      const data = await request({
        operation: "issue",
        channel: "REMOTE",
        branchCode: branch,
        serviceCode: selectedService,
        priority,
        priorityReason: priority ? priorityReason : null,
        idempotencyKey: intent.current.key,
        lookupToken: intent.current.proof,
      });
      setTicket(data.ticket);
      setLookupToken(data.lookupToken);
      setPosition(null);
      setEstimate(data.estimatedWaitMinutes ?? null);
      window.localStorage.setItem(
        ticketStorageKey,
        JSON.stringify({ id: data.ticket.id, lookupToken: data.lookupToken }),
      );
      intent.current = null;
      setNotice(
        "Your place is reserved. Confirm arrival at the branch before the deadline.",
      );
      await refreshTicket(data.ticket.id, data.lookupToken);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Ticket could not be issued.",
      );
    } finally {
      setBusy("");
    }
  }
  async function checkIn() {
    setBusy("check-in");
    setError("");
    try {
      const data = await request({
        operation: "check_in",
        ticketId: ticket?.id,
        lookupToken,
        arrivalCode,
      });
      setTicket(data.ticket);
      setNotice(
        "Arrival confirmed. Your original booking position is preserved.",
      );
      setArrivalCode("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Check-in failed.");
    } finally {
      setBusy("");
    }
  }
  async function cancelTicket() {
    setBusy("cancel");
    setError("");
    try {
      const data = await request({
        operation: "transition",
        action: "cancel",
        ticketId: ticket?.id,
        lookupToken,
      });
      setTicket(data.ticket);
      setNotice("Ticket cancelled. You can reserve again after 10 minutes.");
      setConfirmCancel(false);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Cancellation failed.",
      );
    } finally {
      setBusy("");
    }
  }
  async function loadHistory() {
    setShowHistory(true);
    setBusy("history");
    setError("");
    try {
      const response = await fetch("/api/showcase?surface=customer-history", {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setHistory(data.tickets ?? []);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "History unavailable.",
      );
    } finally {
      setBusy("");
    }
  }
  async function shareTicket() {
    if (!ticket) return;
    const data = {
      title: `${BANK_NAME} ${ticket.public_number}`,
      text: `${ticket.public_number} · ${ticket.service_name} · ${bankBranch(ticket.branch_code)?.name} Branch`,
    };
    try {
      if (navigator.share) await navigator.share(data);
      else {
        await navigator.clipboard.writeText(data.text);
        setNotice("Public ticket details copied.");
      }
    } catch {
      /* Dismissing the share sheet leaves the ticket unchanged. */
    }
  }
  const selected = services.find((service) => service.code === selectedService);
  const branchName =
    bankBranch(ticket?.branch_code ?? branch)?.name ?? "Summit";
  return (
    <main className="wl-customer">
      <header className="wl-topbar">
        <Link className="wl-brand" href="/">
          <BankLogo />
          <span>
            <strong>{BANK_NAME}</strong>
            <small>Customer queue portal</small>
          </span>
        </Link>
        <span className={`wl-connection ${online ? "" : "is-offline"}`}>
          <i />
          {online ? "Connected" : "Reconnecting"}
        </span>
      </header>
      <div className="wl-customer-layout">
        <aside className="wl-guide">
          <span className="wl-eyebrow">A little less waiting</span>
          <h1>
            Your time.
            <br />
            <em>Your place.</em>
          </h1>
          <p>
            Reserve your place from home. Check in when you reach the branch,
            and we’ll call you to the next available teller.
          </p>
          <div className="wl-guide-steps">
            <span>
              <b>01</b> Choose your branch
            </span>
            <span>
              <b>02</b> Select a service
            </span>
            <span>
              <b>03</b> Reserve & arrive
            </span>
          </div>
          <div className="wl-policy-note">
            <Clock3 />
            <p>
              On-time arrival keeps your original booking order. Customers
              already called continue their service.
            </p>
          </div>
          <small className="wl-demo-note">
            Academic demonstration · No banking transactions
            <br />
            Private demo sign-in is used here; SMS verification is not
            connected.
          </small>
        </aside>
        <section className="wl-booking" aria-label="Customer tickets">
          <nav className="wl-tabs" aria-label="Your queue">
            <button
              aria-current={!showHistory ? "page" : undefined}
              onClick={() => setShowHistory(false)}
            >
              <TicketCheck /> {ticket ? "My ticket" : "Reserve a ticket"}
            </button>
            <button
              aria-current={showHistory ? "page" : undefined}
              onClick={() => void loadHistory()}
            >
              <Clock3 /> Ticket history
            </button>
          </nav>
          {error && (
            <div className="wl-alert" role="alert">
              <CircleAlert />
              <span>{error}</span>
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X />
              </button>
            </div>
          )}
          {notice && (
            <div className="wl-notice" role="status">
              <Check />
              {notice}
            </div>
          )}
          {showHistory ? (
            <div className="wl-history">
              <h2>Your recent visits</h2>
              {busy === "history" ? (
                <p>Loading your tickets…</p>
              ) : history.length ? (
                history.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setShowHistory(false);
                      setLookupToken("");
                      void refreshTicket(item.id, "");
                    }}
                  >
                    <span>
                      <strong>{item.public_number}</strong>
                      <small>
                        {bankBranch(item.branch_code)?.name} ·{" "}
                        {item.service_name}
                      </small>
                    </span>
                    <span className="wl-status">
                      {item.status.replaceAll("_", " ")}
                    </span>
                    <ArrowRight />
                  </button>
                ))
              ) : (
                <div className="wl-empty">
                  <TicketCheck />
                  <h3>No visits yet</h3>
                  <p>
                    Your reservations will appear here after you create your
                    first ticket.
                  </p>
                </div>
              )}
            </div>
          ) : ticket ? (
            <div className="wl-ticket-view" key={ticket.id}>
              <div
                className={`wl-ticket-card status-${ticket.status.toLowerCase()}`}
              >
                <span>
                  {branchName} Branch · {ticket.service_name}
                </span>
                <strong>{ticket.public_number}</strong>
                <b>
                  {(
                    {
                      RESERVED: "Place reserved · Arrival required",
                      WAITING: "Checked in · Waiting",
                      CALLED: `Your turn · ${ticket.counter}`,
                      IN_SERVICE: `Now serving · ${ticket.counter}`,
                      COMPLETED: "Service complete",
                      CANCELLED: "Ticket cancelled",
                      EXPIRED: "Reservation expired",
                    } as Record<string, string>
                  )[ticket.status] ?? ticket.status}
                </b>
              </div>
              <div className="wl-ticket-facts">
                <div>
                  <small>People ahead</small>
                  <strong>
                    {position === null ? "—" : Math.max(0, position - 1)}
                  </strong>
                </div>
                <div>
                  <small>Estimated wait</small>
                  <strong>
                    {estimate === null ? "Unavailable" : `${estimate} min`}
                  </strong>
                </div>
              </div>
              {ticket.status === "RESERVED" && (
                <div className="wl-arrival">
                  <h3>
                    <MapPin /> Confirm you’ve arrived
                  </h3>
                  <p>
                    At <strong>{branchName} Branch</strong>, ask staff for the
                    current six-digit arrival code. Check in between{" "}
                    <strong>{time(ticket.check_in_opens_at)}</strong> and{" "}
                    <strong>{time(ticket.check_in_deadline)}</strong> (Addis
                    Ababa time).
                  </p>
                  <label htmlFor="arrival-code">Branch arrival code</label>
                  <div className="wl-inline">
                    <Input
                      id="arrival-code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={arrivalCode}
                      onChange={(event) =>
                        setArrivalCode(
                          event.target.value.replace(/\D/g, "").slice(0, 6),
                        )
                      }
                      placeholder="6-digit code"
                    />
                    <Button
                      onClick={() => void checkIn()}
                      disabled={arrivalCode.length !== 6 || !!busy}
                    >
                      {busy === "check-in" ? (
                        <LoaderCircle className="spin" />
                      ) : (
                        <Check />
                      )}{" "}
                      Check in
                    </Button>
                  </div>
                  <small>
                    Unconfirmed reservations are skipped. Late arrivals need a
                    new ticket at the back.
                  </small>
                </div>
              )}
              {ticket.priority_requested === 1 && (
                <p className="wl-priority-status">
                  {ticket.priority
                    ? "Priority eligibility approved by staff."
                    : "Priority requested. Branch staff must verify eligibility before priority ordering applies."}
                </p>
              )}
              <div className="wl-ticket-actions">
                <Button
                  variant="outline"
                  onClick={() => void refreshTicket(ticket.id, lookupToken)}
                  disabled={!!busy}
                >
                  <RefreshCw />
                  Refresh
                </Button>
                <Button variant="outline" onClick={() => void shareTicket()}>
                  <Share2 />
                  Share
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    if ("Notification" in window)
                      void Notification.requestPermission().then((value) =>
                        setNotice(
                          value === "granted"
                            ? "Alerts are enabled while the portal is open."
                            : "Notifications are not enabled. Keep this ticket open.",
                        ),
                      );
                    else
                      setNotice("Keep this ticket open to see live updates.");
                  }}
                >
                  <Bell />
                  Alerts
                </Button>
              </div>
              {["RESERVED", "WAITING"].includes(ticket.status) && (
                <div>
                  {confirmCancel ? (
                    <div className="wl-confirm" role="alert">
                      <p>Cancel this ticket and release your place?</p>
                      <Button
                        variant="destructive"
                        onClick={() => void cancelTicket()}
                        disabled={!!busy}
                      >
                        Yes, cancel ticket
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setConfirmCancel(false)}
                      >
                        Keep my place
                      </Button>
                    </div>
                  ) : (
                    <button
                      className="wl-text-button"
                      onClick={() => setConfirmCancel(true)}
                    >
                      Cancel ticket
                    </button>
                  )}
                </div>
              )}
              {["COMPLETED", "CANCELLED", "EXPIRED"].includes(
                ticket.status,
              ) && (
                <Button
                  onClick={() => {
                    setTicket(null);
                    setLookupToken("");
                    setStep(1);
                    setNotice("");
                    window.localStorage.removeItem(ticketStorageKey);
                  }}
                >
                  Reserve another ticket
                  <ArrowRight />
                </Button>
              )}
            </div>
          ) : (
            <div className="wl-booking-flow">
              <div className="wl-progress" aria-label={`Step ${step} of 3`}>
                {["Branch", "Service", "Confirm"].map((name, index) => (
                  <span
                    key={name}
                    className={step >= index + 1 ? "is-active" : ""}
                  >
                    <b>{step > index + 1 ? <Check /> : index + 1}</b>
                    {name}
                  </span>
                ))}
              </div>
              <div className="wl-step" key={step}>
                {step === 1 ? (
                  <>
                    <span className="wl-eyebrow">01 / Choose your branch</span>
                    <h2>Where are you visiting?</h2>
                    <p>Every branch has its own service queues.</p>
                    <div className="wl-branch-grid">
                      {BANK_BRANCHES.map((item) => (
                        <button
                          key={item.code}
                          aria-pressed={branch === item.code}
                          className={branch === item.code ? "is-selected" : ""}
                          onClick={() => {
                            setBranch(item.code);
                            setServices([]);
                            setLoading(true);
                          }}
                        >
                          <MapPin />
                          <strong>{item.name}</strong>
                          {branch === item.code && <Check />}
                        </button>
                      ))}
                    </div>
                    <Button className="wl-primary" onClick={() => setStep(2)}>
                      Continue with {bankBranch(branch)?.name}
                      <ArrowRight />
                    </Button>
                  </>
                ) : step === 2 ? (
                  <>
                    <button
                      className="wl-text-button"
                      onClick={() => setStep(1)}
                    >
                      <ArrowLeft /> Change branch
                    </button>
                    <span className="wl-eyebrow">02 / {branchName} Branch</span>
                    <h2>How can we help?</h2>
                    {loading ? (
                      <p>Loading branch services…</p>
                    ) : (
                      <div className="wl-services">
                        {services.map((service) => {
                          const Icon =
                            icons[service.code as keyof typeof icons] ??
                            TicketCheck;
                          return (
                            <button
                              key={service.code}
                              aria-pressed={selectedService === service.code}
                              className={
                                selectedService === service.code
                                  ? "is-selected"
                                  : ""
                              }
                              onClick={() => setSelectedService(service.code)}
                            >
                              <span className="wl-service-icon">
                                <Icon />
                              </span>
                              <span>
                                <strong>{service.name}</strong>
                                <small>
                                  {service.activeCounters
                                    ? `${service.waiting} waiting · estimated ${service.estimatedWaitMinutes} min`
                                    : "No counter open right now"}
                                </small>
                              </span>
                              {selectedService === service.code ? (
                                <Check />
                              ) : (
                                <ArrowRight />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <label className="wl-priority">
                      <span>
                        <strong>Request priority assistance</strong>
                        <small>Staff verify eligibility at the branch.</small>
                      </span>
                      <Switch
                        checked={priority}
                        onCheckedChange={setPriority}
                      />
                    </label>
                    {priority && (
                      <label className="wl-field">
                        Eligibility reason
                        <select
                          value={priorityReason}
                          onChange={(event) =>
                            setPriorityReason(event.target.value)
                          }
                        >
                          <option value="ELDERLY">Elderly customer</option>
                          <option value="DISABILITY">
                            Customer with disability
                          </option>
                          <option value="PREGNANCY">Pregnancy</option>
                          <option value="ACCESSIBILITY">
                            Accessibility need
                          </option>
                          <option value="OTHER">
                            Staff-approved exceptional case
                          </option>
                        </select>
                        <small>
                          Your reason is private and never appears on the
                          monitor.
                        </small>
                      </label>
                    )}
                    <Button
                      className="wl-primary"
                      disabled={!selected || loading}
                      onClick={() => setStep(3)}
                    >
                      Review reservation
                      <ArrowRight />
                    </Button>
                  </>
                ) : (
                  <>
                    <button
                      className="wl-text-button"
                      onClick={() => setStep(2)}
                    >
                      <ArrowLeft /> Change service
                    </button>
                    <span className="wl-eyebrow">03 / Confirm your visit</span>
                    <h2>Save your place.</h2>
                    <div className="wl-confirm-summary">
                      <BankLogo size={64} />
                      <strong>{branchName} Branch</strong>
                      <span>{selected?.name}</span>
                      <span>
                        {priority
                          ? "Priority requested · staff approval required"
                          : "Standard service"}
                      </span>
                    </div>
                    <div className="wl-policy-note">
                      <Clock3 />
                      <p>
                        You have one active reservation per branch and up to
                        three per day. Check your ticket’s arrival deadline
                        immediately after booking.
                      </p>
                    </div>
                    <Button
                      className="wl-primary"
                      onClick={() => void issueTicket()}
                      disabled={!!busy || !selected}
                    >
                      {busy === "issue" ? (
                        <LoaderCircle className="spin" />
                      ) : (
                        <TicketCheck />
                      )}
                      {busy === "issue"
                        ? "Reserving your place…"
                        : "Confirm & reserve ticket"}
                    </Button>
                    <p className="wl-caption">
                      Only checked-in customers can be called. Wait times can
                      change.
                    </p>
                  </>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
      {installPrompt && (
        <button
          className="wl-install"
          onClick={async () => {
            await installPrompt.prompt();
            await installPrompt.userChoice;
            setInstallPrompt(null);
          }}
        >
          <Download />
          Install customer portal
        </button>
      )}
    </main>
  );
}
