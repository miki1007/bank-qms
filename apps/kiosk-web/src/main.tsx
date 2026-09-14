import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  CheckCircle2,
  Clock3,
  Languages,
  Printer,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { PublicService, TicketView } from "@qms/shared-types";
import { WorldLinkBrand } from "../../../packages/ui/src/index";
import "../../../packages/ui/src/theme.css";
import "./kiosk.css";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api/v1";
const BRANCH = import.meta.env.VITE_BRANCH_CODE ?? "MAIN";
const DEVICE_CODE = import.meta.env.VITE_KIOSK_DEVICE_CODE;
const DEVICE_SECRET = import.meta.env.VITE_KIOSK_DEVICE_SECRET;

if (!DEVICE_CODE || !DEVICE_SECRET) {
  throw new Error(
    "Kiosk provisioning is missing. Configure VITE_KIOSK_DEVICE_CODE and VITE_KIOSK_DEVICE_SECRET.",
  );
}
const queryClient = new QueryClient();

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-device-code": DEVICE_CODE,
      "x-device-secret": DEVICE_SECRET,
      ...init?.headers,
    },
  });
  const payload = await response.json();
  if (!response.ok)
    throw new Error(
      payload.error?.message ?? "The service is temporarily unavailable.",
    );
  return payload;
}

type CreatedTicket = TicketView & { lookupCode?: string; lookupToken: string };
type View =
  | "welcome"
  | "services"
  | "priority"
  | "confirm"
  | "result"
  | "lookup"
  | "status";

function App() {
  const [view, setView] = useState<View>("welcome");
  const [language, setLanguage] = useState<"en" | "am">("en");
  const [selected, setSelected] = useState<PublicService | null>(null);
  const [priority, setPriority] = useState(false);
  const [priorityReason, setPriorityReason] = useState("ELDERLY");
  const [ticket, setTicket] = useState<CreatedTicket | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lookup, setLookup] = useState({ publicNumber: "", lookupCode: "" });
  const [countdown, setCountdown] = useState(45);
  const [clock, setClock] = useState(new Date());
  const services = useQuery<PublicService[]>({
    queryKey: ["services"],
    queryFn: () => api(`/public/branches/${BRANCH}/services`),
    refetchInterval: 15_000,
  });

  const words =
    language === "en"
      ? {
          welcome: "Welcome to WorldLink Bank",
          choose: "Choose the service you need",
          get: "Get a ticket",
          check: "Check or cancel ticket",
          back: "Back",
          confirm: "Confirm and get ticket",
        }
      : {
          welcome: "እንኳን ደህና መጡ",
          choose: "የሚፈልጉትን አገልግሎት ይምረጡ",
          get: "ትኬት ይውሰዱ",
          check: "ትኬት ይመልከቱ ወይም ይሰርዙ",
          back: "ተመለስ",
          confirm: "አረጋግጥ እና ትኬት ውሰድ",
        };

  const reset = () => {
    setView("welcome");
    setSelected(null);
    setPriority(false);
    setTicket(null);
    setError("");
    setLookup({ publicNumber: "", lookupCode: "" });
    setCountdown(45);
  };
  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (view === "welcome") return;
    const timer = window.setInterval(
      () => setCountdown((value) => value - 1),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [view]);
  useEffect(() => {
    if (countdown > 0) return;
    const timer = window.setTimeout(reset, 0);
    return () => window.clearTimeout(timer);
  }, [countdown]);

  const createTicket = async () => {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ ticket: CreatedTicket }>(
        `/public/branches/${BRANCH}/tickets`,
        {
          method: "POST",
          body: JSON.stringify({
            serviceTypeId: selected.id,
            priority,
            priorityReason: priority ? priorityReason : null,
            idempotencyKey: crypto.randomUUID(),
          }),
        },
      );
      setTicket(result.ticket);
      setView("result");
      setCountdown(45);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Ticket could not be created.",
      );
    } finally {
      setBusy(false);
    }
  };

  const lookupTicket = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ ticket: TicketView }>(
        "/public/tickets/lookup",
        {
          method: "POST",
          body: JSON.stringify({ branchCode: BRANCH, ...lookup }),
        },
      );
      setTicket({ ...result.ticket, lookupToken: "" });
      setView("status");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ticket not found.");
    } finally {
      setBusy(false);
    }
  };

  const cancelTicket = async () => {
    if (
      !ticket ||
      !window.confirm("Cancel this waiting ticket? This cannot be undone.")
    )
      return;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ ticket: TicketView }>(
        `/public/tickets/${ticket.id}/cancel`,
        {
          method: "POST",
          body: JSON.stringify({
            branchCode: BRANCH,
            publicNumber: ticket.publicNumber,
            lookupCode: lookup.lookupCode || ticket.lookupCode,
            lookupToken: ticket.lookupToken || undefined,
          }),
        },
      );
      setTicket({ ...result.ticket, lookupToken: "" });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Ticket could not be cancelled.",
      );
    } finally {
      setBusy(false);
    }
  };

  const currentWait = useMemo(
    () =>
      selected?.estimatedWaitMinutes == null
        ? "Counter temporarily unavailable"
        : `About ${selected.estimatedWaitMinutes} min`,
    [selected],
  );

  return (
    <div className="kiosk-shell">
      <header className="kiosk-header">
        <WorldLinkBrand subtitle="Customer self-service · Queue ticketing" />
        <div className="kiosk-header-actions">
          <span className="kiosk-branch">
            <i />
            {BRANCH} branch
          </span>
          <span className="kiosk-clock">
            <Clock3 size={17} />
            {clock.toLocaleTimeString("en-ET", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          <button
            className="kiosk-language"
            onClick={() => setLanguage(language === "en" ? "am" : "en")}
          >
            <Languages size={18} />
            {language === "en" ? "አማ" : "EN"}
          </button>
        </div>
      </header>
      <main className="kiosk-main" onClick={() => setCountdown(45)}>
        {view !== "welcome" && (
          <div className="kiosk-flowbar">
            <button
              className="kiosk-back"
              onClick={() =>
                view === "services" || view === "lookup"
                  ? reset()
                  : setView(view === "priority" ? "services" : "welcome")
              }
            >
              <ArrowLeft size={18} />
              {words.back}
            </button>
            {["services", "priority", "confirm"].includes(view) ? (
              <div
                className="kiosk-progress"
                aria-label="Ticket creation steps"
              >
                {[1, 2, 3].map((step) => {
                  const currentStep =
                    view === "services" ? 1 : view === "priority" ? 2 : 3;
                  return (
                    <span
                      className={step <= currentStep ? "is-active" : ""}
                      key={step}
                    >
                      {step}
                    </span>
                  );
                })}
              </div>
            ) : (
              <span className="kiosk-flow-label">Private ticket access</span>
            )}
            <span className="kiosk-reset">Resets in {countdown}s</span>
          </div>
        )}
        {error && (
          <div className="error" role="alert" style={{ marginTop: 18 }}>
            {error}
          </div>
        )}

        {view === "welcome" && (
          <section className="kiosk-welcome">
            <div className="kiosk-welcome-copy">
              <p className="eyebrow">Simple · Fair · Private</p>
              <h1>{words.welcome}</h1>
              <p>
                Take a branch service ticket in three clear steps. No bank
                account or personal information is required.
              </p>
              <div className="kiosk-trust">
                <span>
                  <ShieldCheck size={18} />
                  Private by design
                </span>
                <span>
                  <Clock3 size={18} />
                  Live wait estimates
                </span>
              </div>
            </div>
            <div className="kiosk-action-grid">
              <button
                className="kiosk-action-card primary-choice"
                onClick={() => setView("services")}
              >
                <span className="kiosk-action-icon">
                  <Banknote size={31} />
                </span>
                <span className="kiosk-action-number">01</span>
                <h2>{words.get}</h2>
                <p>Choose a banking service and receive your number.</p>
                <span className="kiosk-action-link">
                  Start now <ArrowRight size={18} />
                </span>
              </button>
              <button
                className="kiosk-action-card"
                onClick={() => setView("lookup")}
              >
                <span className="kiosk-action-icon">
                  <Search size={31} />
                </span>
                <span className="kiosk-action-number">02</span>
                <h2>{words.check}</h2>
                <p>Use the number and private six-digit code on your ticket.</p>
                <span className="kiosk-action-link">
                  Find ticket <ArrowRight size={18} />
                </span>
              </button>
            </div>
          </section>
        )}

        {view === "services" && (
          <section className="kiosk-stage">
            <p className="eyebrow" style={{ marginTop: 36 }}>
              Step 1 of 3
            </p>
            <h1 className="title">{words.choose}</h1>
            {services.isLoading ? (
              <div className="card">Loading available services…</div>
            ) : services.isError ? (
              <div className="error">
                Services are unavailable. Please try again.
              </div>
            ) : (
              <div className="grid">
                {services.data?.map((service) => (
                  <button
                    key={service.id}
                    className="card service-button kiosk-service-card"
                    onClick={() => {
                      setSelected(service);
                      setView(service.priorityEnabled ? "priority" : "confirm");
                    }}
                  >
                    <div className="row between">
                      <span className="status-pill">{service.code}</span>
                      <span className="small muted">
                        <Users size={15} style={{ verticalAlign: "middle" }} />{" "}
                        {service.waitingCount} waiting
                      </span>
                    </div>
                    <h2 style={{ marginTop: 28 }}>{service.name}</h2>
                    <p className="muted">{service.description}</p>
                    <div className="row" style={{ marginTop: 20 }}>
                      <Clock3 size={17} />
                      <strong>
                        {service.estimatedWaitMinutes == null
                          ? "No open counter"
                          : `~${service.estimatedWaitMinutes} min`}
                      </strong>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {view === "priority" && selected && (
          <section className="kiosk-stage">
            <p className="eyebrow" style={{ marginTop: 36 }}>
              Step 2 of 3
            </p>
            <h1 className="title">Choose service lane</h1>
            <div className="grid">
              <button
                className="card service-button"
                onClick={() => {
                  setPriority(false);
                  setView("confirm");
                }}
              >
                <Users size={34} />
                <h2 style={{ marginTop: 20 }}>Standard service</h2>
                <p className="muted">Join the regular first-come queue.</p>
              </button>
              <div className="card">
                <ShieldCheck size={34} color="#0f5c45" />
                <h2 style={{ marginTop: 20 }}>Priority service</h2>
                <p className="muted">
                  For eligible customers. Staff may verify eligibility.
                </p>
                <label className="field">
                  <span>Eligibility reason</span>
                  <select
                    value={priorityReason}
                    onChange={(event) => setPriorityReason(event.target.value)}
                  >
                    <option value="ELDERLY">Elderly customer</option>
                    <option value="DISABILITY">Disability</option>
                    <option value="PREGNANCY">Pregnancy</option>
                    <option value="OTHER">Other approved reason</option>
                  </select>
                </label>
                <button
                  className="primary"
                  style={{ marginTop: 14, width: "100%" }}
                  onClick={() => {
                    setPriority(true);
                    setView("confirm");
                  }}
                >
                  Use priority service
                </button>
              </div>
            </div>
          </section>
        )}

        {view === "confirm" && selected && (
          <section className="kiosk-stage">
            <p className="eyebrow" style={{ marginTop: 36 }}>
              Step 3 of 3
            </p>
            <h1 className="title">Confirm your ticket</h1>
            <div className="card kiosk-confirm-card">
              <div className="row between">
                <div>
                  <span className="status-pill">{selected.code}</span>
                  <h2 style={{ marginTop: 16, fontSize: "2rem" }}>
                    {selected.name}
                  </h2>
                </div>
                <span
                  className={`status-pill ${priority ? "status-warning" : ""}`}
                >
                  {priority ? "Priority" : "Standard"}
                </span>
              </div>
              <hr
                style={{
                  border: 0,
                  borderTop: "1px solid #dce5df",
                  margin: "24px 0",
                }}
              />
              <div className="grid">
                <div>
                  <div className="small muted">Current waiting</div>
                  <div className="metric">{selected.waitingCount}</div>
                </div>
                <div>
                  <div className="small muted">Estimated wait</div>
                  <div className="metric" style={{ fontSize: "1.5rem" }}>
                    {currentWait}
                  </div>
                </div>
              </div>
              <button
                className="primary"
                style={{ marginTop: 28, width: "100%", minHeight: 60 }}
                disabled={busy}
                onClick={createTicket}
              >
                {busy ? "Creating your ticket…" : words.confirm}
              </button>
            </div>
          </section>
        )}

        {view === "result" && ticket && (
          <section className="kiosk-result">
            <CheckCircle2 size={48} color="#0f5c45" style={{ marginTop: 34 }} />
            <p className="eyebrow">Your ticket is ready</p>
            <div className="ticket-number">{ticket.publicNumber}</div>
            <p className="subtitle" style={{ margin: "0 auto" }}>
              {ticket.serviceName} · {priority ? "Priority" : "Standard"}
            </p>
            <div
              className="grid"
              style={{ maxWidth: 720, margin: "28px auto" }}
            >
              <div className="card flat">
                <div className="small muted">People ahead</div>
                <div className="metric">{ticket.peopleAhead ?? "—"}</div>
              </div>
              <div className="card flat">
                <div className="small muted">Estimated wait</div>
                <div className="metric">
                  {ticket.estimatedWaitMinutes == null
                    ? "—"
                    : `${ticket.estimatedWaitMinutes}m`}
                </div>
              </div>
              <div className="card flat">
                <div className="small muted">Private code</div>
                <div className="metric">{ticket.lookupCode ?? "Use QR"}</div>
              </div>
            </div>
            <p className="muted">
              Keep the private code secure. It is required to check or cancel
              this ticket.
            </p>
            <div className="row" style={{ justifyContent: "center" }}>
              <button className="secondary row" onClick={() => window.print()}>
                <Printer size={18} />
                Print ticket
              </button>
              <button className="primary" onClick={reset}>
                Done
              </button>
            </div>
          </section>
        )}

        {view === "lookup" && (
          <section className="kiosk-stage">
            <p className="eyebrow" style={{ marginTop: 36 }}>
              Private ticket lookup
            </p>
            <h1 className="title">Check your place in line</h1>
            <div className="card stack kiosk-form-card">
              <label className="field">
                <span>Ticket number</span>
                <input
                  placeholder="DEP-042"
                  value={lookup.publicNumber}
                  onChange={(event) =>
                    setLookup({
                      ...lookup,
                      publicNumber: event.target.value.toUpperCase(),
                    })
                  }
                />
              </label>
              <label className="field">
                <span>Private six-digit code</span>
                <input
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="739184"
                  value={lookup.lookupCode}
                  onChange={(event) =>
                    setLookup({
                      ...lookup,
                      lookupCode: event.target.value.replace(/\D/g, ""),
                    })
                  }
                />
              </label>
              <button
                className="primary"
                disabled={
                  busy || !lookup.publicNumber || lookup.lookupCode.length !== 6
                }
                onClick={lookupTicket}
              >
                {busy ? "Checking…" : "View ticket status"}
              </button>
            </div>
          </section>
        )}

        {view === "status" && ticket && (
          <section className="kiosk-stage">
            <p className="eyebrow" style={{ marginTop: 36 }}>
              Live ticket status
            </p>
            <h1 className="title">{ticket.publicNumber}</h1>
            <div className="card kiosk-status-card">
              <div className="row between">
                <div>
                  <h2>{ticket.serviceName}</h2>
                  <span className="muted">
                    Issued {new Date(ticket.issuedAt).toLocaleTimeString()}
                  </span>
                </div>
                <span
                  className={`status-pill ${ticket.status === "WAITING" ? "status-warning" : ticket.status === "CANCELLED" ? "status-danger" : "status-success"}`}
                >
                  {ticket.status.replace("_", " ")}
                </span>
              </div>
              {ticket.status === "WAITING" && (
                <div className="grid" style={{ marginTop: 26 }}>
                  <div>
                    <div className="small muted">People ahead</div>
                    <div className="metric">{ticket.peopleAhead}</div>
                  </div>
                  <div>
                    <div className="small muted">Estimated wait</div>
                    <div className="metric">
                      {ticket.estimatedWaitMinutes == null
                        ? "—"
                        : `${ticket.estimatedWaitMinutes}m`}
                    </div>
                  </div>
                </div>
              )}
              {ticket.status === "CALLED" && (
                <div
                  className="success"
                  style={{ marginTop: 24, fontSize: "1.2rem" }}
                >
                  Please go to <strong>{ticket.counterLabel}</strong>.
                </div>
              )}
              {ticket.status === "WAITING" && (
                <button
                  className="secondary danger"
                  style={{ marginTop: 26 }}
                  disabled={busy}
                  onClick={cancelTicket}
                >
                  Cancel this ticket
                </button>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
