"use client";

import {
  BanknoteArrowDown,
  BanknoteArrowUp,
  Bell,
  BriefcaseBusiness,
  Building2,
  Check,
  CircleAlert,
  Clock3,
  Download,
  LoaderCircle,
  RefreshCw,
  Share2,
  TicketCheck,
  UserRound,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

type Ticket = {
  id: string;
  public_number: string;
  service_code: string;
  service_name: string;
  priority: number;
  status: string;
  counter: string | null;
  created_at: string;
};

type Service = {
  code: string;
  name: string;
  minutes: number;
  waiting: number;
};

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const iconByService = {
  DEP: BanknoteArrowDown,
  WDR: BanknoteArrowUp,
  LON: BriefcaseBusiness,
  NAC: UserRound,
};

const ticketStorageKey = "bank-qms-customer-ticket";

export function MobileCustomerClient() {
  const [services, setServices] = useState<Service[]>([]);
  const [selectedService, setSelectedService] = useState("DEP");
  const [priority, setPriority] = useState(false);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [lookupToken, setLookupToken] = useState("");
  const [position, setPosition] = useState<number | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [online, setOnline] = useState(true);
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(
    null,
  );
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const previousStatus = useRef<string | null>(null);

  const refreshServices = useCallback(async () => {
    try {
      const response = await fetch("/api/showcase?surface=kiosk", {
        cache: "no-store",
      });
      const data = (await response.json()) as {
        services?: Service[];
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || "Queue unavailable.");
      setServices(data.services ?? []);
      setOnline(true);
    } catch (caught) {
      setOnline(false);
      setError(caught instanceof Error ? caught.message : "Queue unavailable.");
    }
  }, []);

  const refreshTicket = useCallback(async (id: string, proof: string) => {
    try {
      const response = await fetch("/api/showcase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "lookup",
          ticketId: id,
          lookupToken: proof,
        }),
      });
      const data = (await response.json()) as {
        ticket?: Ticket;
        position?: number | null;
        error?: string;
      };
      if (!response.ok || !data.ticket)
        throw new Error(data.error || "Ticket unavailable.");
      if (
        previousStatus.current &&
        previousStatus.current !== data.ticket.status &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        const registration = await navigator.serviceWorker?.ready;
        await registration?.showNotification("Bank QMS ticket update", {
          body:
            data.ticket.status === "CALLED"
              ? `${data.ticket.public_number}: please go to ${data.ticket.counter}.`
              : `${data.ticket.public_number} is now ${data.ticket.status.toLowerCase().replaceAll("_", " ")}.`,
          icon: "/favicon.svg",
          tag: `ticket-${data.ticket.id}`,
        });
      }
      previousStatus.current = data.ticket.status;
      setTicket(data.ticket);
      setPosition(data.position ?? null);
      setOnline(true);
    } catch (caught) {
      setOnline(false);
      setError(
        caught instanceof Error ? caught.message : "Ticket unavailable.",
      );
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => {
      void refreshServices();
      if ("Notification" in window) {
        setAlertsEnabled(Notification.permission === "granted");
      }
      const saved = window.localStorage.getItem(ticketStorageKey);
      if (saved) {
        try {
          const value = JSON.parse(saved) as {
            id: string;
            lookupToken: string;
          };
          setLookupToken(value.lookupToken);
          void refreshTicket(value.id, value.lookupToken);
        } catch {
          window.localStorage.removeItem(ticketStorageKey);
        }
      }
    }, 0);
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker.register("/mobile-sw.js");
    const onInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", onInstall);
    return () => {
      window.clearTimeout(initial);
      window.removeEventListener("beforeinstallprompt", onInstall);
    };
  }, [refreshServices, refreshTicket]);

  useEffect(() => {
    if (
      !ticket ||
      !lookupToken ||
      ["COMPLETED", "CANCELLED"].includes(ticket.status)
    )
      return;
    const timer = window.setInterval(
      () => void refreshTicket(ticket.id, lookupToken),
      3_000,
    );
    return () => window.clearInterval(timer);
  }, [lookupToken, refreshTicket, ticket]);

  async function issueTicket() {
    setBusy("issue");
    setError("");
    try {
      const response = await fetch("/api/showcase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "issue",
          serviceCode: selectedService,
          priority,
        }),
      });
      const data = (await response.json()) as {
        ticket?: Ticket;
        lookupToken?: string;
        error?: string;
      };
      if (!response.ok || !data.ticket || !data.lookupToken) {
        throw new Error(data.error || "Ticket could not be issued.");
      }
      setTicket(data.ticket);
      setLookupToken(data.lookupToken);
      setPosition(1);
      window.localStorage.setItem(
        ticketStorageKey,
        JSON.stringify({ id: data.ticket.id, lookupToken: data.lookupToken }),
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

  async function cancelTicket() {
    if (!ticket) return;
    setBusy("cancel");
    try {
      const response = await fetch("/api/showcase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "transition",
          action: "cancel",
          ticketId: ticket.id,
          lookupToken,
        }),
      });
      const data = (await response.json()) as {
        ticket?: Ticket;
        error?: string;
      };
      if (!response.ok || !data.ticket)
        throw new Error(data.error || "Cancellation failed.");
      setTicket(data.ticket);
      setPosition(null);
      window.localStorage.removeItem(ticketStorageKey);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Cancellation failed.",
      );
    } finally {
      setBusy("");
    }
  }

  async function enableAlerts() {
    if (!("Notification" in window)) {
      setError("Notifications are not supported on this device.");
      return;
    }
    const permission = await Notification.requestPermission();
    setAlertsEnabled(permission === "granted");
    if (permission !== "granted")
      setError("Notification permission was not enabled.");
  }

  async function shareTicket() {
    if (!ticket) return;
    const shareData = {
      title: `Bank QMS ticket ${ticket.public_number}`,
      text: `${ticket.public_number} · ${ticket.service_name} · ${ticket.status.toLowerCase().replaceAll("_", " ")}`,
      url: window.location.href,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(
          `${shareData.text}\n${shareData.url}`,
        );
        setNotice("Ticket details copied.");
        window.setTimeout(() => setNotice(""), 2_000);
      }
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === "AbortError")) {
        setError("Ticket details could not be shared.");
      }
    }
  }

  const selected = useMemo(
    () => services.find((service) => service.code === selectedService),
    [selectedService, services],
  );

  return (
    <main className="mobile-app mobile-customer-app">
      <header className="mobile-topbar">
        <a href="/customer-app" className="mobile-brand">
          <span>
            <Building2 />
          </span>
          <strong>Bank QMS</strong>
        </a>
        <span className={online ? "mobile-live" : "mobile-live offline"}>
          <i /> {online ? "Live" : "Offline"}
        </span>
      </header>

      <section className="mobile-content">
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

        {ticket ? (
          <div className="mobile-ticket-screen">
            <div
              className={`mobile-ticket-hero status-${ticket.status.toLowerCase()}`}
            >
              <span className="mobile-kicker">Your live ticket</span>
              <strong>{ticket.public_number}</strong>
              <p>{ticket.service_name}</p>
              <div className="mobile-ticket-status">
                {ticket.status === "WAITING" && (
                  <>
                    <Clock3 /> Waiting in queue
                  </>
                )}
                {ticket.status === "CALLED" && (
                  <>
                    <Bell /> Go to {ticket.counter}
                  </>
                )}
                {ticket.status === "IN_SERVICE" && (
                  <>
                    <Check /> Now serving
                  </>
                )}
                {ticket.status === "COMPLETED" && (
                  <>
                    <Check /> Service complete
                  </>
                )}
                {ticket.status === "CANCELLED" && (
                  <>
                    <X /> Ticket cancelled
                  </>
                )}
              </div>
            </div>

            <div className="mobile-position-card">
              <span>Queue position</span>
              <strong>
                {ticket.status === "WAITING"
                  ? (position ?? "—")
                  : (ticket.counter ?? "—")}
              </strong>
              <small>
                {ticket.status === "WAITING"
                  ? `${Math.max(0, (position ?? 1) - 1)} customer${position === 2 ? "" : "s"} ahead`
                  : ticket.status === "CALLED"
                    ? "Please approach the counter"
                    : "Status updates automatically"}
              </small>
            </div>

            <div className="mobile-action-stack">
              <Button
                onClick={() => void refreshTicket(ticket.id, lookupToken)}
                disabled={Boolean(busy)}
              >
                <RefreshCw /> Refresh status
              </Button>
              <div className="mobile-secondary-actions">
                <Button variant="outline" onClick={() => void shareTicket()}>
                  <Share2 /> Share
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void enableAlerts()}
                  disabled={alertsEnabled}
                >
                  <Bell /> {alertsEnabled ? "Alerts on" : "Alert me"}
                </Button>
              </div>
              {ticket.status === "WAITING" && (
                <Button
                  variant="outline"
                  onClick={() => void cancelTicket()}
                  disabled={Boolean(busy)}
                >
                  Cancel ticket
                </Button>
              )}
              {["COMPLETED", "CANCELLED"].includes(ticket.status) && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setTicket(null);
                    setLookupToken("");
                    window.localStorage.removeItem(ticketStorageKey);
                  }}
                >
                  Get another ticket
                </Button>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="mobile-welcome">
              <span className="mobile-kicker">Customer queue</span>
              <h1>
                Skip the line.
                <br />
                <em>Keep your place.</em>
              </h1>
              <p>
                Choose what you need and receive a live ticket on your phone.
              </p>
            </div>

            <div className="mobile-service-list">
              {services.map((service) => {
                const Icon =
                  iconByService[service.code as keyof typeof iconByService] ??
                  TicketCheck;
                return (
                  <button
                    key={service.code}
                    className={
                      selectedService === service.code ? "selected" : ""
                    }
                    onClick={() => setSelectedService(service.code)}
                  >
                    <span className="mobile-service-icon">
                      <Icon />
                    </span>
                    <span>
                      <strong>{service.name}</strong>
                      <small>About {service.minutes} min</small>
                    </span>
                    <b>
                      {service.waiting}
                      <small>waiting</small>
                    </b>
                  </button>
                );
              })}
            </div>

            <label className="mobile-priority-card">
              <span>
                <strong>Priority service</strong>
                <small>For eligible customers</small>
              </span>
              <Switch checked={priority} onCheckedChange={setPriority} />
            </label>

            <Button
              className="mobile-primary-button"
              onClick={() => void issueTicket()}
              disabled={Boolean(busy) || !selected}
            >
              {busy === "issue" ? (
                <LoaderCircle className="spin" />
              ) : (
                <TicketCheck />
              )}
              Get {selected?.name ?? "queue"} ticket
            </Button>
          </>
        )}
      </section>

      {installPrompt && (
        <button
          className="mobile-install-banner"
          onClick={async () => {
            await installPrompt.prompt();
            await installPrompt.userChoice;
            setInstallPrompt(null);
          }}
        >
          <Download /> Install Customer App
        </button>
      )}
    </main>
  );
}
