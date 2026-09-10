"use client";

import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  LogOut,
  LockKeyhole,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { BankLogo } from "./bank-logo";
import { BANK_NAME } from "@/lib/bank-brand";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type LoginActor = {
  role: "TELLER" | "MANAGER";
  displayName: string;
};

type SessionConflict = {
  actor: LoginActor;
  requestedRole: LoginActor["role"];
};

function requestedRoleFromSearch(search: string): LoginActor["role"] | null {
  const requested = new URLSearchParams(search).get("next");
  if (["/teller", "/staff-app"].includes(requested ?? "")) return "TELLER";
  if (["/manager", "/admin"].includes(requested ?? "")) return "MANAGER";
  return null;
}

function roleName(role: LoginActor["role"]) {
  return role === "MANAGER" ? "Manager" : "Teller";
}

export function StaffLoginClient() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sessionConflict, setSessionConflict] =
    useState<SessionConflict | null>(null);

  const enterWorkspace = useCallback((actor: LoginActor) => {
    const requested = new URLSearchParams(window.location.search).get("next");
    if (actor.role === "MANAGER") {
      window.location.replace("/manager");
      return;
    }
    const allowed = ["/teller", "/staff-app"];
    const destination =
      requested && allowed.includes(requested) ? requested : "/teller";
    window.location.replace(destination);
  }, []);

  useEffect(() => {
    let active = true;
    void fetch("/api/showcase/auth", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        const result = (await response.json()) as { actor?: LoginActor };
        if (!active || !result.actor) return;
        const requestedRole = requestedRoleFromSearch(window.location.search);
        if (requestedRole && requestedRole !== result.actor.role) {
          setSessionConflict({ actor: result.actor, requestedRole });
          return;
        }
        enterWorkspace(result.actor);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [enterWorkspace]);

  async function openShowcase(role: "TELLER" | "MANAGER") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/showcase/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "workspace_showcase",
          role,
          username: role === "TELLER" ? "teller.one" : "manager.dev",
        }),
      });
      const result = (await response.json()) as {
        actor?: LoginActor;
        error?: string;
      };
      if (!response.ok || !result.actor)
        throw new Error(result.error || "Unable to open the showcase.");
      enterWorkspace(result.actor);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to open showcase.",
      );
      setBusy(false);
    }
  }

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/showcase/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", username, password }),
      });
      const result = (await response.json()) as {
        actor?: LoginActor;
        error?: string;
      };
      if (!response.ok || !result.actor) {
        throw new Error(result.error || "Unable to sign in.");
      }
      enterWorkspace(result.actor);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to sign in.");
      setBusy(false);
    }
  }

  async function logoutCurrentActor() {
    if (!sessionConflict) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/showcase/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
      const result = (await response.json()) as {
        success?: boolean;
        error?: string;
      };
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Unable to log out.");
      }
      const requestedWorkspace = roleName(sessionConflict.requestedRole);
      setSessionConflict(null);
      setNotice(
        `The previous session is closed. You can now sign in to ${requestedWorkspace}.`,
      );
      setBusy(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to log out.");
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <div className="login-orb orb-one" />
      <div className="login-orb orb-two" />
      <section className="login-story">
        <a className="login-brand" href="/kiosk">
          <BankLogo size={56} />
          <strong>{BANK_NAME}</strong>
        </a>
        <div className="story-copy">
          <span className="story-kicker">
            <Sparkles /> Intelligent branch flow
          </span>
          <h1>
            Every customer.
            <br />
            <em>Perfectly sequenced.</em>
          </h1>
          <p>
            One secure workspace for responsive service, fair queues, and a
            calmer branch experience.
          </p>
        </div>
        <div className="story-points">
          <div>
            <ShieldCheck />
            <span>
              <strong>Role protected</strong>
              <small>Manager and teller permissions stay isolated</small>
            </span>
          </div>
          <div>
            <CheckCircle2 />
            <span>
              <strong>Transaction safe</strong>
              <small>Every state change is validated and recorded</small>
            </span>
          </div>
        </div>
        <div className="motion-track" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
          <span />
        </div>
      </section>

      <section className="login-panel">
        <div className="login-card">
          {sessionConflict ? (
            <>
              <div className="login-icon login-icon-warning">
                <ShieldAlert />
              </div>
              <span className="eyebrow">Workspace protected</span>
              <h2>{roleName(sessionConflict.requestedRole)} access paused</h2>
              <p className="login-intro">
                A different staff workspace is already active in this browser.
              </p>

              <div className="session-conflict" role="status">
                <span className="session-conflict-label">Current session</span>
                <strong>{sessionConflict.actor.displayName}</strong>
                <p>
                  This user is signed in as{" "}
                  {roleName(sessionConflict.actor.role)}. To keep Manager and
                  Teller access separate, log out before entering{" "}
                  {roleName(sessionConflict.requestedRole)}.
                </p>
              </div>

              {error && (
                <div className="login-error" role="alert">
                  {error}
                </div>
              )}

              <div className="session-conflict-actions">
                <Button
                  type="button"
                  size="lg"
                  disabled={busy}
                  onClick={logoutCurrentActor}
                >
                  {busy ? <LoaderCircle className="spin" /> : <LogOut />}
                  Log out of {roleName(sessionConflict.actor.role)}
                </Button>
                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  disabled={busy}
                  onClick={() => enterWorkspace(sessionConflict.actor)}
                >
                  Return to {roleName(sessionConflict.actor.role)}
                </Button>
              </div>

              <div className="login-security">
                <ShieldCheck /> Staff identity is never switched silently
              </div>
            </>
          ) : (
            <>
              <div className="login-icon">
                <LockKeyhole />
              </div>
              <span className="eyebrow">Authorized staff</span>
              <h2>Welcome back</h2>
              <p className="login-intro">
                Sign in to open your secure branch workspace.
              </p>

              {notice && (
                <div className="login-notice" role="status">
                  <CheckCircle2 /> {notice}
                </div>
              )}

              <div className="showcase-access">
                <p>Private owner showcase</p>
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => openShowcase("MANAGER")}
                  >
                    Manager view
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => openShowcase("TELLER")}
                  >
                    Open Teller 1
                  </Button>
                </div>
                <p className="showcase-note">
                  Quick teller access opens only Teller 1 at Counter 1. Every
                  other teller must sign in with their own provisioned username
                  and password.
                </p>
              </div>

              <div className="login-divider">
                <span>or use a provisioned account</span>
              </div>

              <form onSubmit={login} className="login-form">
                <div className="login-field">
                  <Label htmlFor="username">Username</Label>
                  <div className="input-with-icon">
                    <KeyRound />
                    <Input
                      id="username"
                      autoComplete="username"
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                    />
                  </div>
                </div>
                <div className="login-field">
                  <Label htmlFor="password">Password</Label>
                  <div className="input-with-icon">
                    <LockKeyhole />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((visible) => !visible)}
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                    >
                      {showPassword ? <EyeOff /> : <Eye />}
                    </button>
                  </div>
                </div>
                {error && (
                  <div className="login-error" role="alert">
                    {error}
                  </div>
                )}
                <Button className="login-submit" size="lg" disabled={busy}>
                  {busy ? (
                    <LoaderCircle className="spin" />
                  ) : (
                    <>
                      Enter workspace <ArrowRight />
                    </>
                  )}
                </Button>
              </form>
              <div className="login-security">
                <ShieldCheck /> Secure, short-lived, revocable session
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
