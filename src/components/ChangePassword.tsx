import { useState } from "react";
import { supabase } from "../client";
import { friendly } from "../domain";
import { Field } from "./Common";
export function ChangePassword({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget,
          f = new FormData(form);
        setBusy(true);
        setError("");
        try {
          if (f.get("password") !== f.get("confirm"))
            throw Error("The passwords do not match.");
          const { error } = await supabase.auth.updateUser({
            password: String(f.get("password")),
          });
          if (error) throw Error(friendly(error.message));
          const { error: flag } = await supabase.rpc("password_changed");
          if (flag)
            throw Error(
              "Password changed. Reconnect and reopen the app to finish checking your account.",
            );
          form.reset();
          onDone();
        } catch (e) {
          setError(
            e instanceof Error ? e.message : "Unable to change password.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3>Change your password</h3>
      <p className="hint">
        Choose a private password of at least 12 characters. Do not share your
        password with another user.
      </p>
      <div className="form-grid">
        <Field label="New password">
          <input
            name="password"
            type="password"
            required
            minLength={12}
            autoComplete="new-password"
          />
        </Field>
        <Field label="Confirm password">
          <input
            name="confirm"
            type="password"
            required
            minLength={12}
            autoComplete="new-password"
          />
        </Field>
      </div>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      <button className="secondary" disabled={busy}>
        {busy ? "Saving…" : "Change password"}
      </button>
    </form>
  );
}
