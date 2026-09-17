import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { io } from "socket.io-client";
import {
  CheckCircle2,
  Clock3,
  Maximize2,
  Radio,
  Volume2,
  VolumeX,
  WifiOff,
} from "lucide-react";
import type { RealtimeEnvelope } from "@qms/shared-types";
import { WorldLinkBrand } from "../../../packages/ui/src/index";
import { announcementText } from "./announcement";
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

type CallStatus = "CALLED" | "IN_SERVICE" | "COMPLETED";

type Call = {
  id: string;
  publicNumber: string;
  counterLabel: string;
  serviceName: string;
  calledAt: string;
  status: CallStatus;
  recall?: boolean;
};

type DisplaySettings = {
  historyCount: number;
  soundEnabled: boolean;
  announcementRepeatCount: 2 | 3;
};

type VoiceMode = "off" | "ready" | "unavailable";

const DEFAULT_SETTINGS: DisplaySettings = {
  historyCount: 8,
  soundEnabled: true,
  announcementRepeatCount: 3,
};

function statusLabel(status: CallStatus, isCurrent: boolean) {
  if (status === "COMPLETED") return "Completed";
  if (status === "IN_SERVICE") return "In service";
  return isCurrent ? "Now calling" : "Called";
}

function App() {
  const [branch, setBranch] = useState({
    name: "Main Branch",
    timezone: "Africa/Addis_Ababa",
  });
  const [settings, setSettings] = useState<DisplaySettings>(DEFAULT_SETTINGS);
  const [calls, setCalls] = useState<Call[]>([]);
  const [connected, setConnected] = useState(false);
  const [highlight, setHighlight] = useState(false);
  const [clock, setClock] = useState(new Date());
  // A fresh click is deliberately required after every page load so Chrome
  // permits later socket-driven announcements through the system voice.
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [voiceMode, setVoiceMode] = useState<VoiceMode>("off");
  const eventIds = useRef(new Set<string>());
  const settingsRef = useRef(settings);
  const audioEnabledRef = useRef(audioEnabled);
  const announcementQueue = useRef<Call[]>([]);
  const announcing = useRef(false);
  const audioGeneration = useRef(0);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    audioEnabledRef.current = audioEnabled;
  }, [audioEnabled]);

  const snapshot = async () => {
    const response = await fetch(
      API + "/public/devices/" + DEVICE_CODE + "/bootstrap",
      { headers: { "x-device-secret": DEVICE_SECRET } },
    );
    if (!response.ok) return;
    const data = (await response.json()) as {
      branch: { name: string; timezone: string };
      displaySettings?: Partial<DisplaySettings>;
      calls: Array<Partial<Call> & Pick<Call, "publicNumber" | "serviceName">>;
    };
    setBranch(data.branch);
    const repeat = data.displaySettings?.announcementRepeatCount === 2 ? 2 : 3;
    setSettings({
      historyCount: Math.max(
        1,
        Number(
          data.displaySettings?.historyCount ?? DEFAULT_SETTINGS.historyCount,
        ),
      ),
      soundEnabled:
        data.displaySettings?.soundEnabled ?? DEFAULT_SETTINGS.soundEnabled,
      announcementRepeatCount: repeat,
    });
    setCalls(
      data.calls.map((call, index) => ({
        id: call.id ?? call.publicNumber + "-" + index,
        publicNumber: call.publicNumber,
        counterLabel: call.counterLabel ?? "Counter",
        serviceName: call.serviceName,
        calledAt: call.calledAt ?? new Date().toISOString(),
        status: call.status ?? "CALLED",
        recall: call.recall,
      })),
    );
  };

  const systemEnglishVoice = () => {
    if (!("speechSynthesis" in window)) return undefined;
    const voices = window.speechSynthesis.getVoices();
    const englishVoices = voices.filter((voice) =>
      voice.lang.toLowerCase().startsWith("en"),
    );
    return (
      englishVoices.find(
        (voice) => voice.localService && voice.lang.toLowerCase() === "en-us",
      ) ??
      englishVoices.find((voice) => voice.localService && voice.default) ??
      englishVoices.find((voice) => voice.localService) ??
      englishVoices.find((voice) => voice.default) ??
      englishVoices[0]
    );
  };

  const speakWithSystemVoice = (text: string) =>
    new Promise<void>((resolve, reject) => {
      if (
        !("speechSynthesis" in window) ||
        !("SpeechSynthesisUtterance" in window)
      ) {
        reject(new Error("Speech synthesis is not available in this browser."));
        return;
      }
      const voice = systemEnglishVoice();
      const utterance = new SpeechSynthesisUtterance(text);
      if (voice) utterance.voice = voice;
      utterance.lang = voice?.lang || "en-US";
      utterance.rate = 0.84;
      utterance.pitch = 1;
      utterance.volume = 1;
      utterance.onend = () => resolve();
      utterance.onerror = () =>
        reject(new Error("The English system voice could not play."));
      window.speechSynthesis.resume();
      window.speechSynthesis.speak(utterance);
    });

  const pause = (milliseconds: number) =>
    new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

  const runNextAnnouncement = async () => {
    if (announcing.current) return;
    const call = announcementQueue.current.shift();
    if (!call) return;
    if (!audioEnabledRef.current || !settingsRef.current.soundEnabled) {
      window.setTimeout(runNextAnnouncement, 0);
      return;
    }
    const generation = audioGeneration.current;
    announcing.current = true;
    try {
      setVoiceMode("ready");
      for (
        let repeat = 0;
        repeat < settingsRef.current.announcementRepeatCount;
        repeat += 1
      ) {
        if (
          generation !== audioGeneration.current ||
          !audioEnabledRef.current ||
          !settingsRef.current.soundEnabled
        )
          break;
        await speakWithSystemVoice(announcementText(call));
        if (repeat + 1 < settingsRef.current.announcementRepeatCount)
          await pause(650);
      }
    } catch {
      if (generation === audioGeneration.current) setVoiceMode("unavailable");
    } finally {
      if (generation === audioGeneration.current) {
        announcing.current = false;
        window.setTimeout(() => void runNextAnnouncement(), 350);
      }
    }
  };

  const queueAnnouncement = (call: Call) => {
    announcementQueue.current.push(call);
    void runNextAnnouncement();
  };

  const setAnnouncements = async (enabled: boolean) => {
    const generation = ++audioGeneration.current;
    audioEnabledRef.current = enabled;
    setAudioEnabled(enabled);
    if (!enabled) {
      announcementQueue.current = [];
      announcing.current = false;
      setVoiceMode("off");
      window.speechSynthesis?.cancel();
      return;
    }

    // Speaking directly inside the click handler unlocks later announcements
    // that arrive from the queue's real-time socket events.
    try {
      window.speechSynthesis?.cancel();
      await speakWithSystemVoice("Voice announcements are enabled.");
      if (generation !== audioGeneration.current || !audioEnabledRef.current)
        return;
      setVoiceMode("ready");
    } catch {
      if (generation !== audioGeneration.current) return;
      audioEnabledRef.current = false;
      setAudioEnabled(false);
      setVoiceMode("unavailable");
    }
  };

  useEffect(() => {
    const initial = window.setTimeout(() => void snapshot(), 0);
    const clockTimer = window.setInterval(() => setClock(new Date()), 1000);
    const snapshotTimer = window.setInterval(() => void snapshot(), 7000);
    return () => {
      clearTimeout(initial);
      clearInterval(clockTimer);
      clearInterval(snapshotTimer);
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
    socket.on("connect_error", () => setConnected(false));
    socket.on("system.notice", () => void snapshot());
    socket.on("display.call", (envelope: RealtimeEnvelope<Call>) => {
      if (eventIds.current.has(envelope.eventId)) return;
      eventIds.current.add(envelope.eventId);
      if (eventIds.current.size > 200)
        eventIds.current.delete(eventIds.current.values().next().value!);
      const call: Call = {
        ...envelope.data,
        id: envelope.data.id ?? envelope.eventId,
        status: envelope.data.status ?? "CALLED",
        calledAt: envelope.occurredAt,
      };
      setCalls((current) =>
        [
          call,
          ...current.filter(
            (item) =>
              item.id !== call.id && item.publicNumber !== call.publicNumber,
          ),
        ].slice(0, settingsRef.current.historyCount),
      );
      setHighlight(true);
      window.setTimeout(() => setHighlight(false), 1400);
      queueAnnouncement(call);
    });
    return () => {
      socket.close();
      window.speechSynthesis?.cancel();
    };
    // The socket is intentionally subscribed once. Its handlers read current
    // display and audio settings from refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = calls.find(
    (call) => call.status === "CALLED" || call.status === "IN_SERVICE",
  );
  const callTime = (calledAt: string) =>
    new Date(calledAt).toLocaleTimeString("en-ET", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: branch.timezone,
    });
  const voiceStatus =
    voiceMode === "ready"
      ? "English system voice ready"
      : voiceMode === "unavailable"
        ? "Voice unavailable"
        : "Voice requires one click";

  return (
    <main className="display-shell">
      <header className="display-header">
        <WorldLinkBrand
          className="light"
          subtitle={branch.name + " · Public queue display"}
        />
        <div className="display-tools">
          <div className={"connection " + (connected ? "online" : "offline")}>
            {connected ? <Radio size={17} /> : <WifiOff size={17} />}
            {connected ? "Live" : "Reconnecting · safe view"}
          </div>
          <button
            className={
              "display-tool " +
              (audioEnabled ? "audio-active " : "") +
              (voiceMode === "unavailable" ? "audio-error" : "")
            }
            onClick={() => void setAnnouncements(!audioEnabled)}
            title={
              voiceMode === "ready"
                ? "Using an English voice supplied by this computer"
                : voiceMode === "unavailable"
                  ? "This browser could not use the computer's speech service"
                  : "Click once to enable English announcements"
            }
          >
            {audioEnabled && voiceMode !== "unavailable" ? (
              <Volume2 size={18} />
            ) : (
              <VolumeX size={18} />
            )}
            {settings.soundEnabled
              ? audioEnabled
                ? voiceMode === "unavailable"
                  ? "Voice unavailable"
                  : "Voice on"
                : "Enable voice"
              : "Voice disabled"}
          </button>
          <div className="display-clock">
            <Clock3 size={19} />
            {clock.toLocaleTimeString("en-ET", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              timeZone: branch.timezone,
            })}
          </div>
          <button
            className="display-tool icon-tool"
            aria-label="Enter full screen"
            onClick={() => void document.documentElement.requestFullscreen?.()}
          >
            <Maximize2 size={19} />
          </button>
        </div>
      </header>

      <section
        className={"current-call " + (highlight ? "highlight" : "")}
        aria-live="assertive"
        aria-atomic="true"
      >
        {current ? (
          <>
            <div className="ticket-panel">
              <div className="call-label">Now calling</div>
              <div className="display-ticket">{current.publicNumber}</div>
              <div className="service-line">
                {current.serviceName}
                {current.recall ? " · Recalled" : ""}
              </div>
              <div className="call-meta">
                <span className="live-pulse" />
                Called at {callTime(current.calledAt)}
              </div>
            </div>
            <div className="counter-panel">
              <div className="call-label">Proceed to counter</div>
              <div className="display-counter">
                {current.counterLabel.replace(/[^0-9]/g, "") ||
                  current.counterLabel}
              </div>
              <div className="counter-word">{current.counterLabel}</div>
              <p>Please proceed to {current.counterLabel}</p>
            </div>
          </>
        ) : (
          <div className="waiting-empty">
            <span>
              <Volume2 size={42} />
            </span>
            <h1>Ready for the next call</h1>
            <p>The next called ticket will appear here.</p>
          </div>
        )}
      </section>

      <section className="flight-board">
        <div className="flight-board-heading">
          <div>
            <span className="board-kicker">Live service board</span>
            <h2>Current & recent calls</h2>
          </div>
          <span className="display-sub">
            Listen for your number and keep your ticket ready
          </span>
        </div>
        <div className="flight-table" role="table" aria-label="Queue calls">
          <div className="flight-row flight-head" role="row">
            <span role="columnheader">Ticket</span>
            <span role="columnheader">Service</span>
            <span role="columnheader">Counter</span>
            <span role="columnheader">Called</span>
            <span role="columnheader">Status</span>
          </div>
          {calls.length ? (
            calls.map((call) => {
              const isCurrent = current?.id === call.id;
              return (
                <div
                  className={"flight-row " + (isCurrent ? "is-current" : "")}
                  role="row"
                  key={call.id + "-" + call.calledAt}
                >
                  <strong role="cell">{call.publicNumber}</strong>
                  <span role="cell">{call.serviceName}</span>
                  <b role="cell">{call.counterLabel}</b>
                  <time role="cell">{callTime(call.calledAt)}</time>
                  <span role="cell">
                    <i
                      className={
                        "flight-status status-" + call.status.toLowerCase()
                      }
                    >
                      {call.status === "COMPLETED" && (
                        <CheckCircle2 size={15} />
                      )}
                      {statusLabel(call.status, isCurrent)}
                    </i>
                  </span>
                </div>
              );
            })
          ) : (
            <div className="flight-empty">No calls have been recorded yet.</div>
          )}
        </div>
      </section>

      <footer className="display-footer">
        <span>WORLDLINK BANK · {branch.name.toUpperCase()}</span>
        <strong>
          When your ticket is called, proceed to the displayed counter
        </strong>
        <span>
          Voice repeats {settings.announcementRepeatCount}×{" · "}
          {voiceStatus}
        </span>
      </footer>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
