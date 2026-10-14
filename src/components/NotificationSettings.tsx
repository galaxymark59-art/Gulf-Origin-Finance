import { useEffect, useState } from "react";
import { native } from "../native";
import { desktop } from "../desktop";
import { readLocal } from "../storage";
import { type State, dateTime } from "../domain";
import {
  pushStatus,
  enablePhoneAlerts,
  disablePhoneAlerts,
  enableWindowsAlerts,
  type PaymentAlert,
} from "../notifications";
export function NotificationSettings({
  state,
  events,
  onRead,
  notify,
}: {
  state: State;
  events: PaymentAlert[];
  onRead: () => Promise<void>;
  notify: (text: string) => void;
}) {
  const [ready, setReady] = useState<boolean>(),
    [enabled, setEnabled] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    void readLocal<boolean>(
      (desktop ? "windows-alerts:" : "push:enabled:") + state.owner,
    ).then((v) => setEnabled(Boolean(v)));
    if (native)
      void pushStatus()
        .then((s) => setReady(s.configured))
        .catch(() => setReady(false));
  }, [state.owner]);
  async function toggle() {
    setBusy(true);
    setMessage("");
    try {
      if (desktop) await enableWindowsAlerts(state.owner, !enabled);
      else if (enabled) await disablePhoneAlerts(state.owner);
      else await enablePhoneAlerts(state.owner);
      setEnabled(!enabled);
      notify(
        !enabled
          ? "Payment alerts enabled on this device."
          : "Device alerts turned off.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unable to change alerts.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h2>Owner payment alerts</h2>
      <p>
        Ahmed Marwan receives an alert when any user records a payment. Alerts
        show a private message; open the app to see the merchant and amount.
      </p>
      {native ? (
        <>
          <p className="hint">
            Phone alerts use free Firebase Cloud Messaging and can arrive while
            the app is closed. Android must allow notifications and have an
            internet connection.
          </p>
          <p>
            Push sender:{" "}
            {ready === undefined
              ? "Checking…"
              : ready
                ? "Configured"
                : "Setup still needed"}
          </p>
          <button
            className="primary"
            disabled={busy || ready === undefined || (!ready && !enabled)}
            onClick={() => void toggle()}
          >
            {enabled ? "Turn off phone alerts" : "Enable phone alerts"}
          </button>
        </>
      ) : desktop ? (
        <>
          <p className="hint">
            Closing the window keeps Mcube in the Windows tray. Enabling alerts
            also starts it with Windows. Choosing Quit stops Windows alerts
            until you open the app again.
          </p>
          <button
            className="primary"
            disabled={busy}
            onClick={() => void toggle()}
          >
            {enabled ? "Turn off Windows alerts" : "Enable Windows alerts"}
          </button>
        </>
      ) : (
        <p className="hint">
          Use the Android app for closed-app phone alerts or the Windows app for
          tray alerts. New payments also appear here while signed in.
        </p>
      )}
      {message && (
        <p className="alert" role="alert">
          {message}
        </p>
      )}
      <h3>Recent payment alerts</h3>
      {events.length > 0 && (
        <button
          className="secondary"
          onClick={() => void onRead().catch((e) => setMessage(e.message))}
        >
          Mark alerts read
        </button>
      )}
      {!events.length ? (
        <p className="hint">
          New payment alerts will appear here. Existing financial history stays
          in each merchant's account.
        </p>
      ) : (
        <ul className="notification-list">
          {events.map((e) => (
            <li key={e.id}>
              <strong>
                {e.seen_at ? "Payment recorded" : "New payment recorded"}
              </strong>
              <small>{dateTime(e.created_at)}</small>
              <span>{e.body}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
