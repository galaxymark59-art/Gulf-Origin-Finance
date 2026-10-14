import { expect, it } from "vitest";
import {
  deliver,
  parseServiceAccount,
} from "../supabase/functions/_shared/fcm";
it("uses a signed messaging-only credential and sends a generic private Android alert", async () => {
  const keys = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const der = await crypto.subtle.exportKey("pkcs8", keys.privateKey);
  const account = parseServiceAccount(
    JSON.stringify({
      project_id: "mcube-qa",
      client_email: "sender@mcube-qa.iam.gserviceaccount.com",
      private_key:
        "-----BEGIN PRIVATE KEY-----\n" +
        btoa(String.fromCharCode(...new Uint8Array(der))) +
        "\n-----END PRIVATE KEY-----",
    }),
  );
  let oauth = 0,
    messages = 0;
  const request: typeof fetch = async (url, options) => {
    if (url === "https://oauth2.googleapis.com/token") {
      oauth++;
      const assertion = new URLSearchParams(String(options?.body)).get(
        "assertion",
      )!;
      const [head, body, signature] = assertion.split(".");
      const bytes = Uint8Array.from(
        atob(signature.replaceAll("-", "+").replaceAll("_", "/")),
        (c) => c.charCodeAt(0),
      );
      expect(
        await crypto.subtle.verify(
          "RSASSA-PKCS1-v1_5",
          keys.publicKey,
          bytes,
          new TextEncoder().encode(head + "." + body),
        ),
      ).toBe(true);
      const claims = JSON.parse(
        atob(body.replaceAll("-", "+").replaceAll("_", "/")),
      );
      expect(claims.scope).toBe(
        "https://www.googleapis.com/auth/firebase.messaging",
      );
      return Response.json({
        access_token: "fictional-access",
        expires_in: 3600,
      });
    }
    expect(url).toBe(
      "https://fcm.googleapis.com/v1/projects/mcube-qa/messages:send",
    );
    const { message } = JSON.parse(String(options?.body));
    expect(message.notification).toEqual({
      title: "Mcube Exporters",
      body: "A payment was recorded. Open the app to view it.",
    });
    expect(message.android.notification.visibility).toBe("PRIVATE");
    expect(message.android.notification.channel_id).toBe("mcube-payments");
    messages++;
    return messages === 1
      ? Response.json({ name: "sent" })
      : Response.json(
          { error: { details: [{ errorCode: "UNREGISTERED" }] } },
          { status: 404 },
        );
  };
  const event = {
    id: "qa-event",
    transaction_id: "qa-payment",
    title: "Mcube Exporters",
    body: "A payment was recorded. Open the app to view it.",
  };
  expect(await deliver(account, "fictional-device", event, request)).toEqual({
    ok: true,
    invalid: false,
  });
  expect(await deliver(account, "fictional-device", event, request)).toEqual({
    ok: false,
    invalid: true,
  });
  expect(oauth).toBe(1);
});
