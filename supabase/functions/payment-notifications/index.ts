import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { parseServiceAccount, deliver } from "../_shared/fcm.ts";
const origins = new Set([
  "https://gulf-origin-finance.vercel.app",
  "https://localhost",
  "http://localhost",
  "http://127.0.0.1:5173",
  "mcube://app",
]);
Deno.serve(async (req) => {
  const origin = req.headers.get("Origin") || "",
    headers = {
      "Access-Control-Allow-Origin": origins.has(origin)
        ? origin
        : "https://gulf-origin-finance.vercel.app",
      "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      Vary: "Origin",
    };
  if (origin && !origins.has(origin))
    return new Response(null, { status: 403, headers });
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (req.method !== "POST")
    return new Response(null, { status: 405, headers });
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    admin = createClient(Deno.env.get("SUPABASE_URL")!, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  const authorization = req.headers.get("Authorization") || "",
    scheduled = authorization === "Bearer " + secret;
  const raw = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON");
  let account;
  try {
    if (raw) account = parseServiceAccount(raw);
  } catch {}
  try {
    const body = await req.json().catch(() => ({}));
    if (!scheduled) {
      const { data, error } = await admin.auth.getUser(
        authorization.replace(/^Bearer /, ""),
      );
      if (error || !data.user)
        return new Response(null, { status: 401, headers });
      const { data: member } = await admin
        .from("user_accounts")
        .select("id,owner_id,role,active")
        .eq("id", data.user.id)
        .maybeSingle();
      if (!member?.active) return new Response(null, { status: 403, headers });
      const primaryOwner =
        member.id === member.owner_id && member.role === "owner";
      if (body.action === "status") {
        if (!primaryOwner) return new Response(null, { status: 403, headers });
        return Response.json(
          {
            configured: Boolean(account),
            project: account?.project_id || null,
          },
          { headers },
        );
      }
      if (!primaryOwner) {
        const { data: payment } = await admin
          .from("financial_transactions")
          .select("created_by,kind")
          .eq("id", body.transaction_id)
          .maybeSingle();
        if (payment?.created_by !== member.id || payment?.kind !== "payment")
          return new Response(null, { status: 403, headers });
      }
    }
    if (!account)
      return Response.json(
        {
          error:
            "Android push setup is not finished. Payment records and in-app alerts remain saved.",
        },
        { status: 503, headers },
      );
    const deadline = Date.now() + 100000;
    while (Date.now() < deadline) {
      const { data: events, error } = await admin.rpc(
        "claim_payment_notifications",
      );
      if (error) throw error;
      if (!events?.length) break;
      for (const event of events) {
        let success = true;
        for (const device of event.devices) {
          try {
            const result = await deliver(account, device.token, event);
            if (result.ok || result.invalid) {
              const { error } = await admin.rpc("record_push_delivery", {
                p_event: event.id,
                p_device: device.id,
                p_invalid: result.invalid,
              });
              if (error) success = false;
            } else success = false;
          } catch {
            success = false;
          }
        }
        await admin.rpc("finish_payment_notification", {
          p_event: event.id,
          p_success: success,
          p_error: success
            ? null
            : "Delivery will retry. Check Firebase sender configuration and device access.",
        });
      }
    }
    return Response.json({ ok: true }, { headers });
  } catch {
    return Response.json(
      { error: "Notification delivery is delayed and will retry." },
      { status: 503, headers },
    );
  }
});
