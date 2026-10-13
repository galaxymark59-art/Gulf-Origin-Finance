export type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};
const base64url = (data: Uint8Array) => {
  let text = "";
  for (const b of data) text += String.fromCharCode(b);
  return btoa(text)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
};
const json = (value: unknown) =>
  base64url(new TextEncoder().encode(JSON.stringify(value)));
export function parseServiceAccount(value: string): ServiceAccount {
  const a = JSON.parse(value);
  if (
    !/^[a-z][a-z0-9-]{4,62}$/.test(a.project_id) ||
    typeof a.client_email !== "string" ||
    !a.client_email.endsWith(".gserviceaccount.com") ||
    !a.private_key?.startsWith("-----BEGIN PRIVATE KEY-----")
  )
    throw Error("The Firebase sender credential is invalid.");
  return a;
}
let access: { email: string; token: string; until: number } | undefined;
export async function accessToken(
  a: ServiceAccount,
  request: typeof fetch = fetch,
) {
  if (access?.email === a.client_email && access.until > Date.now())
    return access.token;
  const now = Math.floor(Date.now() / 1000),
    unsigned =
      json({ alg: "RS256", typ: "JWT" }) +
      "." +
      json({
        iss: a.client_email,
        scope: "https://www.googleapis.com/auth/firebase.messaging",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
      });
  const pem = a.private_key.replace(/-----[^-]+-----|\s/g, "");
  const key = await crypto.subtle.importKey(
    "pkcs8",
    Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  const response = await request("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: unsigned + "." + base64url(new Uint8Array(signature)),
    }),
    signal: AbortSignal.timeout(15000),
  });
  const body = await response.json();
  if (!response.ok || !body.access_token)
    throw Error("Firebase sender authentication failed.");
  access = {
    email: a.client_email,
    token: body.access_token,
    until: Date.now() + Math.min(Number(body.expires_in) || 3600, 3300) * 1000,
  };
  return access.token;
}
export async function deliver(
  a: ServiceAccount,
  deviceToken: string,
  event: { id: string; transaction_id: string; title: string; body: string },
  request: typeof fetch = fetch,
) {
  const token = await accessToken(a, request),
    response = await request(
      `https://fcm.googleapis.com/v1/projects/${a.project_id}/messages:send`,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token: deviceToken,
            notification: { title: event.title, body: event.body },
            data: { event_id: event.id, transaction_id: event.transaction_id },
            android: {
              priority: "HIGH",
              notification: {
                channel_id: "mcube-payments",
                tag: event.id,
                default_sound: true,
                visibility: "PRIVATE",
              },
            },
          },
        }),
        signal: AbortSignal.timeout(15000),
      },
    );
  const body = await response.json();
  return {
    ok: response.ok,
    invalid:
      body.error?.details?.some(
        (d: { errorCode?: string }) => d.errorCode === "UNREGISTERED",
      ) === true,
  };
}
