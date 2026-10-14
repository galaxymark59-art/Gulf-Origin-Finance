import appMark from "../assets/mcube-logo.svg";
import { useState, type FormEvent } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { supabase, configured } from "../client";
import { friendly } from "../domain";
import { Field } from "./Common";
import { getLock, unlockPin, unlockBiometric, setPin } from "../security";
import { writeLocal } from "../storage";
import { native } from "../native";
import { desktop } from "../desktop";
export function Auth() {
  const [email, setEmail] = useState("Ahmedmarwan8374@gmail.com");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function login(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
    } catch (e) {
      setMessage(friendly(e instanceof Error ? e.message : ""));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth">
      <section className="auth-intro">
        <img src={appMark} alt="" width="64" />
        <p className="eyebrow">MCUBE EXPORTERS</p>
        <h1>
          Every collection.
          <br />
          Clearly accounted for.
        </h1>
        <p>
          A private workspace for your merchants, payments and peace of mind.
        </p>
        <div className="auth-note">
          <ShieldCheck size={20} />
          Your business. Your eyes only.
        </div>
      </section>
      <section className="auth-panel">
        <img src={appMark} alt="" width="44" />
        <p className="eyebrow">PRIVATE WORKSPACE</p>
        <h2>Welcome back</h2>
        <p>Sign in once. Your session stays with you.</p>
        {!configured ? (
          <div role="alert" className="alert">
            Supabase is not configured yet. Set the project URL and publishable
            key before signing in.
          </div>
        ) : (
          <form onSubmit={login}>
            <Field label="Email address">
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Field>
            <Field label="Password">
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>
            <button className="primary full" disabled={busy}>
              {busy ? "Signing in…" : "Sign in securely"}
              <ArrowRight size={18} />
            </button>
            <button
              type="button"
              className="link"
              onClick={async () => {
                setBusy(true);
                const { error } = await supabase.auth.resetPasswordForEmail(
                  email,
                  {
                    redirectTo:
                      native || desktop
                        ? "https://gulf-origin-finance.vercel.app"
                        : location.origin,
                  },
                );
                setMessage(
                  error
                    ? friendly(error.message)
                    : "If this account exists, a recovery email has been requested.",
                );
                setBusy(false);
              }}
            >
              Forgot password?
            </button>
          </form>
        )}
        {message && (
          <p className="alert" role="status">
            {message}
          </p>
        )}
        <small>
          <ShieldCheck size={14} /> Owner-managed access · Encrypted connection
        </small>
      </section>
    </div>
  );
}
export function LockScreen({
  owner,
  email,
  onUnlock,
  setup = false,
}: {
  owner: string;
  email: string;
  onUnlock: (needsSetup?: boolean) => void;
  setup?: boolean;
}) {
  const [pin, setValue] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [reset, setReset] = useState(false);
  const [password, setPassword] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (reset) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error || data.user?.id !== owner)
          throw Error("Password verification failed.");
        await writeLocal("lock:" + owner, null);
        setReset(false);
        setValue("");
        setConfirm("");
        onUnlock(native || Boolean(desktop));
      } else if (setup) {
        if (pin !== confirm) throw Error("The PINs do not match.");
        await setPin(owner, pin, native);
        onUnlock();
      } else {
        await unlockPin(owner, pin);
        onUnlock();
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unable to unlock.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="lock">
      <img src={appMark} alt="" width="64" />
      <h1>{setup ? "Set your app PIN" : "Your workspace is locked"}</h1>
      <p>
        {setup
          ? "Use four or six digits to protect your financial records."
          : "You are still signed in. Unlock to continue."}
      </p>
      <form onSubmit={submit}>
        {reset ? (
          <Field label="Verify your password">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </Field>
        ) : (
          <>
            <Field label="App PIN">
              <input
                type="password"
                inputMode="numeric"
                pattern="([0-9]{4}|[0-9]{6})"
                maxLength={6}
                value={pin}
                onChange={(e) => setValue(e.target.value)}
                required
                autoFocus
              />
            </Field>
            {setup && (
              <Field label="Confirm PIN">
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
              </Field>
            )}
          </>
        )}
        <button className="primary full" disabled={busy}>
          {busy
            ? "Please wait…"
            : reset
              ? "Verify password"
              : setup
                ? "Set PIN"
                : "Unlock"}
        </button>
      </form>
      {!setup && native && (
        <button
          className="secondary"
          onClick={async () => {
            try {
              const l = await getLock(owner);
              if (!l?.biometric) throw Error("Biometrics are not enabled.");
              await unlockBiometric(owner);
              onUnlock();
            } catch {
              setMessage(
                "Biometric unlock was unavailable or cancelled. Use your PIN.",
              );
            }
          }}
        >
          Use fingerprint
        </button>
      )}
      {!setup && (
        <button className="link" onClick={() => setReset(!reset)}>
          {reset ? "Use PIN" : "Reset PIN with your password"}
        </button>
      )}
      {message && (
        <p className="alert" role="alert">
          {message}
        </p>
      )}
    </div>
  );
}
