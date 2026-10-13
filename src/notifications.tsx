import { useEffect, useState } from "react";
import { type Session } from "@supabase/supabase-js";
import { PushNotifications } from "@capacitor/push-notifications";
import { native, SecureVault } from "./native";
import { desktop } from "./desktop";
import { supabase } from "./client";
import { readLocal, writeLocal } from "./storage";
export type PaymentAlert = {
  id: string;
  transaction_id: string;
  title: string;
  body: string;
  created_at: string;
  seen_at: string | null;
};
const changed = () => window.dispatchEvent(new Event("mcube-alert-settings"));
export async function pushStatus() {
  const { data, error } = await supabase.functions.invoke(
    "payment-notifications",
    { body: { action: "status" } },
  );
  if (error)
    throw Error(
      "Push setup is not available yet. In-app payment alerts are still saved.",
    );
  return data as { configured: boolean; project: string | null };
}
export async function enablePhoneAlerts(owner: string) {
  if (!native || !(await SecureVault.pushReady()).ready)
    throw Error(
      "This Android build needs the Firebase configuration before phone alerts can be enabled.",
    );
  if (!(await pushStatus()).configured)
    throw Error("The free push sender setup is not finished yet.");
  let permission = await PushNotifications.checkPermissions();
  if (permission.receive !== "granted")
    permission = await PushNotifications.requestPermissions();
  if (permission.receive !== "granted")
    throw Error(
      "Allow notifications in Android settings to receive payment alerts.",
    );
  await PushNotifications.createChannel({
    id: "mcube-payments",
    name: "Payment alerts",
    description: "New payments recorded for Mcube Exporters",
    importance: 4,
    visibility: 0,
    vibration: true,
  });
  let done!: (token: string) => void, failed!: (error: Error) => void;
  const result = new Promise<string>((resolve, reject) => {
    done = resolve;
    failed = reject;
  });
  const registration = await PushNotifications.addListener(
      "registration",
      (token) => done(token.value),
    ),
    error = await PushNotifications.addListener("registrationError", () =>
      failed(Error("Phone registration failed. Reconnect and retry.")),
    );
  const timer = setTimeout(
    () => failed(Error("Phone registration timed out. Reconnect and retry.")),
    20000,
  );
  try {
    await PushNotifications.register();
    const token = await result;
    const { error } = await supabase.rpc("register_push_device", {
      p_token: token,
      p_platform: "android",
    });
    if (error)
      throw Error(
        "Your phone could not be linked. Ask the owner to check push setup.",
      );
    await writeLocal("push:token:" + owner, token);
    await writeLocal("push:enabled:" + owner, true);
    changed();
  } finally {
    clearTimeout(timer);
    await registration.remove();
    await error.remove();
  }
}
export async function disablePhoneAlerts(owner: string) {
  const token = await readLocal<string>("push:token:" + owner);
  if (token) {
    const { error } = await supabase.rpc("unregister_push_device", {
      p_token: token,
    });
    if (error) throw Error("Reconnect before turning off phone alerts.");
  }
  await writeLocal("push:enabled:" + owner, false);
  if (native && (await SecureVault.pushReady()).ready)
    await PushNotifications.unregister();
  changed();
}
export async function enableWindowsAlerts(owner: string, enabled: boolean) {
  await writeLocal("windows-alerts:" + owner, enabled);
  if (desktop) await desktop.startWithWindows(enabled);
  changed();
}
export function usePaymentAlerts(session: Session | null | undefined) {
  const [events, setEvents] = useState<PaymentAlert[]>([]),
    [toast, setToast] = useState(""),
    [version, setVersion] = useState(0);
  useEffect(() => {
    const changed = () => setVersion((v) => v + 1);
    window.addEventListener("mcube-alert-settings", changed);
    window.addEventListener("online", changed);
    return () => {
      window.removeEventListener("mcube-alert-settings", changed);
      window.removeEventListener("online", changed);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 7000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    setEvents([]);
    if (!session) return;
    let active = true,
      loaded = false,
      authorized = false,
      windowsEnabled = false;
    const seen = new Set<string>(),
      handles: { remove: () => Promise<void> }[] = [];
    let channel: ReturnType<typeof supabase.channel> | undefined;
    const add = (event: PaymentAlert, notify: boolean) => {
      if (!active || seen.has(event.id)) return;
      seen.add(event.id);
      setEvents((old) =>
        [event, ...old]
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .slice(0, 50),
      );
      if (notify) {
        setToast(
          "A payment was recorded. Open the merchant's history to view it.",
        );
        if (desktop && windowsEnabled) void desktop.notify();
      }
    };
    const load = async () => {
      if (!authorized || !active) return;
      const { data, error } = await supabase
        .from("notification_events")
        .select("id,transaction_id,title,body,created_at,seen_at")
        .eq("recipient_id", session.user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error || !active) return;
      for (const e of [...(data || [])].reverse()) add(e, loaded);
      loaded = true;
    };
    void (async () => {
      const { data: member } = await supabase
        .from("user_accounts")
        .select("id,owner_id,role,active")
        .eq("id", session.user.id)
        .maybeSingle();
      if (
        !active ||
        !member?.active ||
        member.role !== "owner" ||
        member.id !== member.owner_id
      )
        return;
      authorized = true;
      windowsEnabled = Boolean(
        await readLocal<boolean>("windows-alerts:" + session.user.id),
      );
      await load();
      if (!active) return;
      channel = supabase
        .channel("mcube-owner-payments")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notification_events",
            filter: "recipient_id=eq." + session.user.id,
          },
          (payload) => add(payload.new as PaymentAlert, true),
        )
        .subscribe();
      if (
        native &&
        (await readLocal<boolean>("push:enabled:" + session.user.id)) &&
        (await SecureVault.pushReady()).ready
      ) {
        handles.push(
          await PushNotifications.addListener("registration", async (token) => {
            if (!active) return;
            const { error } = await supabase.rpc("register_push_device", {
              p_token: token.value,
              p_platform: "android",
            });
            if (!error)
              await writeLocal("push:token:" + session.user.id, token.value);
          }),
        );
        handles.push(
          await PushNotifications.addListener(
            "pushNotificationReceived",
            (notification) => {
              const id = notification.data?.event_id;
              if (id && !seen.has(id)) {
                void load();
              }
            },
          ),
        );
        handles.push(
          await PushNotifications.addListener(
            "pushNotificationActionPerformed",
            () => void load(),
          ),
        );
        if (
          active &&
          (await PushNotifications.checkPermissions()).receive === "granted"
        )
          await PushNotifications.register();
      }
      if (!active) for (const h of handles) void h.remove();
    })().catch(() => {});
    const timer = setInterval(() => void load(), 60000);
    return () => {
      active = false;
      clearInterval(timer);
      if (channel) void supabase.removeChannel(channel);
      for (const h of handles) void h.remove();
    };
  }, [session?.user.id, version]);
  return {
    events,
    toast,
    markRead: async () => {
      const { error } = await supabase.rpc("mark_notifications_read");
      if (error) throw Error("Reconnect to mark alerts read.");
      setEvents((old) =>
        old.map((e) => ({ ...e, seen_at: new Date().toISOString() })),
      );
    },
  };
}
