import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { io } from "socket.io-client";
import { Clock3, Radio, Volume2, WifiOff } from "lucide-react";
import type { RealtimeEnvelope } from "@qms/shared-types";
import { WorldLinkBrand } from "../../../packages/ui/src/index";
import "../../../packages/ui/src/theme.css";
import "./display.css";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api/v1";
const SOCKET =
  import.meta.env.VITE_SOCKET_URL ?? "http://localhost:3000/realtime";
const DEVICE_CODE = import.meta.env.VITE_DISPLAY_DEVICE_CODE;
const DEVICE_SECRET = import.meta.env.VITE_DISPLAY_DEVICE_SECRET;

if (!DEVICE_CODE || !DEVICE_SECRET) {
  throw new Error(
    "Display provisioning is missing. Configure VITE_DISPLAY_DEVICE_CODE and VITE_DISPLAY_DEVICE_SECRET.",
  );
}

type Call = {
  publicNumber: string;
  counterLabel: string;
  serviceName: string;
  calledAt: string;
  recall?: boolean;
};

function App() {
  const [branch, setBranch] = useState({
    name: "Main Branch",
    timezone: "Africa/Addis_Ababa",
  });
  const [calls, setCalls] = useState<Call[]>([]);
  const [connected, setConnected] = useState(false);
  const [highlight, setHighlight] = useState(false);
  const [clock, setClock] = useState(new Date());
  const eventIds = useRef(new Set<string>());

  const snapshot = async () => {
    const response = await fetch(
      `${API}/public/devices/${DEVICE_CODE}/bootstrap`,
      { headers: { "x-device-secret": DEVICE_SECRET } },
    );
    if (!response.ok) return;
    const data = await response.json();
    setBranch(data.branch);
    setCalls(
      data.calls.map((call: { calledAt: string | null } & Call) => ({
        ...call,
        calledAt: call.calledAt ?? new Date().toISOString(),
      })),
    );
  };

  useEffect(() => {
    const initial = window.setTimeout(() => void snapshot(), 0);
    const timer = window.setInterval(() => setClock(new Date()), 1000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    const socket = io(SOCKET, {
      auth: { deviceCode: DEVICE_CODE, deviceSecret: DEVICE_SECRET },
      reconnection: true,
    });
    socket.on("connect", () => {
      setConnected(true);
      void snapshot();
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("display.call", (envelope: RealtimeEnvelope<Call>) => {
      if (eventIds.current.has(envelope.eventId)) return;
      eventIds.current.add(envelope.eventId);
      if (eventIds.current.size > 200)
        eventIds.current.delete(eventIds.current.values().next().value!);
      setCalls((current) =>
        [
          { ...envelope.data, calledAt: envelope.occurredAt },
          ...current.filter(
            (call) => call.publicNumber !== envelope.data.publicNumber,
          ),
        ].slice(0, 5),
      );
      setHighlight(true);
      window.setTimeout(() => setHighlight(false), 900);
      try {
        const context = new AudioContext();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.frequency.value = 660;
        gain.gain.value = 0.06;
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.18);
      } catch {
        /* browsers may require a local gesture for sound */
      }
    });
    return () => {
      socket.close();
    };
  }, []);

  const current = calls[0];
  return (
    <main className="display-shell">
      <header className="display-header">
        <WorldLinkBrand
          className="light"
          subtitle={`${branch.name} · Queue calling display`}
        />
        <div className="row">
          <div className={`connection ${connected ? "online" : "offline"}`}>
            {connected ? <Radio size={17} /> : <WifiOff size={17} />}{" "}
            {connected ? "Live" : "Reconnecting · last safe view"}
          </div>
          <div className="display-clock">
            <Clock3 size={19} />
            {clock.toLocaleTimeString("en-ET", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              timeZone: branch.timezone,
            })}
          </div>
        </div>
      </header>
      <section className={`current-call ${highlight ? "highlight" : ""}`}>
        {current ? (
          <>
            <div>
              <div className="call-label">Now serving</div>
              <div className="display-ticket">{current.publicNumber}</div>
              <div className="service-line">
                {current.serviceName}
                {current.recall ? " · Recalled" : ""}
              </div>
            </div>
            <div className="counter-panel">
              <div className="call-label">Please proceed to</div>
              <div className="display-counter">
                {current.counterLabel.replace(/[^0-9]/g, "") ||
                  current.counterLabel}
              </div>
              <div className="counter-word">{current.counterLabel}</div>
            </div>
          </>
        ) : (
          <div className="waiting-empty">
            <Volume2 size={52} />
            <h1>Waiting for the next call</h1>
            <p>
              The latest safe queue snapshot will remain visible during
              reconnects.
            </p>
          </div>
        )}
      </section>
      <section className="recent">
        <div className="row between">
          <h2>Recent calls</h2>
          <span className="display-sub">
            Please watch the screen and keep your ticket ready
          </span>
        </div>
        <div className="recent-grid">
          {calls.slice(1).map((call) => (
            <article key={`${call.publicNumber}-${call.calledAt}`}>
              <strong>{call.publicNumber}</strong>
              <span>{call.counterLabel}</span>
              <small>{call.serviceName}</small>
            </article>
          ))}
          {calls.length <= 1 && (
            <div className="display-sub">
              No earlier calls in the current snapshot.
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
