import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { handleUserAdmin } from "../_shared/user-admin.ts";
const origins = new Set([
  "https://gulf-origin-finance.vercel.app",
  "https://localhost",
  "http://localhost",
  "http://127.0.0.1:5173",
  "mcube://app",
  ...(Deno.env.get("ALLOWED_APP_ORIGINS") || "").split(",").filter(Boolean),
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
    return Response.json(
      { error: "This app address is not allowed." },
      { status: 403, headers },
    );
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (req.method !== "POST")
    return Response.json(
      { error: "Use the account form in the app." },
      { status: 405, headers },
    );
  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer "))
      return Response.json(
        { error: "Please sign in again." },
        { status: 401, headers },
      );
    const url = Deno.env.get("SUPABASE_URL")!,
      anon = Deno.env.get("SUPABASE_ANON_KEY")!,
      secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const caller = createClient(url, anon, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const admin = createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const query = async (
      result: PromiseLike<{ data: unknown; error: { message: string } | null }>,
    ) => {
      const { data, error } = await result;
      if (error) throw Error(error.message);
      return data;
    };
    const body = await req.json();
    const result = await handleUserAdmin(body, {
      authenticate: async () => {
        const { data, error } = await caller.auth.getUser(
          authorization.slice(7),
        );
        return error ? null : data.user;
      },
      member: async (id) =>
        (await query(
          admin
            .from("user_accounts")
            .select("id,owner_id,role,active,permissions")
            .eq("id", id)
            .maybeSingle(),
        )) as any,
      previous: async (id) =>
        (await query(
          caller
            .from("user_admin_requests")
            .select("request,result,created_by")
            .eq("id", id)
            .maybeSingle(),
        )) as any,
      memberForEmail: async (email) =>
        (await query(
          caller
            .from("user_accounts")
            .select("id")
            .eq("email", email)
            .maybeSingle(),
        )) as any,
      authForEmail: async (email) => {
        let page = 1;
        while (true) {
          const { data, error } = await admin.auth.admin.listUsers({
            page,
            perPage: 1000,
          });
          if (error)
            throw Error("Existing accounts could not be checked. Retry.");
          const user = data.users.find((u) => u.email?.toLowerCase() === email);
          if (user) return user.id;
          if (data.users.length < 1000) return null;
          page++;
        }
      },
      create: async (email, password, name) => {
        const { data, error } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { name },
        });
        if (error || !data.user)
          throw Error(
            "The account could not be created. Check the email and password, then retry.",
          );
        return data.user.id;
      },
      password: async (id, password) => {
        const { error } = await admin.auth.admin.updateUserById(id, {
          password,
        });
        if (error)
          throw Error("The password could not be changed. Please retry.");
      },
      save: async (p) => await query(caller.rpc("admin_user", { p })),
    });
    return Response.json({ user: result }, { headers });
  } catch (error) {
    let message =
      error instanceof Error
        ? error.message
        : "The account change failed. Please retry.";
    if (message.includes("LAST_OWNER"))
      message =
        "Keep at least one active owner. Add another owner before disabling or changing this one.";
    if (message.includes("PERMISSION_DENIED"))
      message = "Your account cannot make this access change.";
    if (message.includes("duplicate key"))
      message =
        "This email is already in use. Edit the existing user's access.";
    return Response.json({ error: message }, { status: 400, headers });
  }
});
