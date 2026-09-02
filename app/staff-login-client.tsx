"use client";

import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type LoginActor = {
  role: "TELLER" | "MANAGER";
  displayName: string;
};

export function StaffLoginClient() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showcaseTeller, setShowcaseTeller] = useState("teller.one");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function enterWorkspace(actor: LoginActor) {
    if (actor.role === "MANAGER") {
      window.location.replace("/manager");
      return;
    }
    const requested = new URLSearchParams(window.location.search).get("next");
    const allowed = ["/teller", "/staff-app"];
    const destination =
      requested && allowed.includes(requested) ? requested : "/teller";
    window.location.replace(destination);
  }

  async function openShowcase(role: "TELLER" | "MANAGER") {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/showcase/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "workspace_showcase",
          role,
          ...(role === "TELLER" ? { username: showcaseTeller } : {}),
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

  return (
    <main className="login-page">
      <div className="login-orb orb-one" />
      <div className="login-orb orb-two" />
      <section className="login-story">
        <a className="login-brand" href="/kiosk">
          <span>
            <Building2 />
          </span>
          <strong>Bank QMS</strong>
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
          <div className="login-icon">
            <LockKeyhole />
          </div>
          <span className="eyebrow">Authorized staff</span>
          <h2>Welcome back</h2>
          <p className="login-intro">
            Sign in to open your secure branch workspace.
          </p>

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
                Teller view
              </Button>
            </div>
            <label className="showcase-teller-picker">
              <span>Independent teller account</span>
              <select
                value={showcaseTeller}
                onChange={(event) => setShowcaseTeller(event.target.value)}
              >
                <option value="teller.one">Teller 1 · Counter 1</option>
                <option value="teller.two">Teller 2 · Counter 2</option>
                <option value="teller.three">Teller 3 · Counter 3</option>
                <option value="teller.four">Teller 4 · Counter 4</option>
              </select>
            </label>
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
                  aria-label={showPassword ? "Hide password" : "Show password"}
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
        </div>
      </section>
    </main>
  );
}
