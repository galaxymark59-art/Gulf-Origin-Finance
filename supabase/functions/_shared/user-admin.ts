export type Account = {
  id: string;
  owner_id: string;
  role: string;
  active: boolean;
  permissions: Record<string, boolean>;
};
export type AdminBackend = {
  authenticate: () => Promise<{ id: string } | null>;
  member: (id: string) => Promise<Account | null>;
  previous: (id: string) => Promise<{
    request: Record<string, unknown>;
    result: unknown;
    created_by: string;
  } | null>;
  memberForEmail: (email: string) => Promise<{ id: string } | null>;
  authForEmail: (email: string) => Promise<string | null>;
  create: (email: string, password: string, name: string) => Promise<string>;
  password: (id: string, password: string) => Promise<void>;
  save: (request: Record<string, unknown>) => Promise<unknown>;
};
const allowed = (a: Account, p: string) =>
  a.active &&
  (a.role === "owner" || (a.role !== "viewer" && a.permissions[p] === true));
const uuid = (value: unknown) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
export async function handleUserAdmin(
  body: Record<string, unknown>,
  backend: AdminBackend,
) {
  const authenticated = await backend.authenticate();
  if (!authenticated) throw Error("Please sign in again.");
  const caller = await backend.member(authenticated.id);
  if (!caller || !allowed(caller, "manage_users"))
    throw Error("Your account cannot manage users.");
  if (
    !uuid(body.id) ||
    !["create", "update", "reset_access"].includes(String(body.action))
  )
    throw Error("The account request is invalid. Reopen the form and retry.");
  const action = String(body.action),
    password = String(body.password || "");
  if (
    (action === "create" || action === "reset_access") &&
    password.length < 12
  )
    throw Error("Use a temporary password with at least 12 characters.");
  const permissions: Record<string, boolean> = {};
  if (action !== "reset_access") {
    if (
      typeof body.permissions !== "object" ||
      !body.permissions ||
      Array.isArray(body.permissions)
    )
      throw Error("Choose valid account permissions.");
    for (const p of [
      "view_records",
      "record_transactions",
      "export_reports",
      "manage_cash",
      "manage_users",
      "manage_owners",
    ]) {
      const value = (body.permissions as Record<string, unknown>)[p];
      if (value !== undefined) {
        if (typeof value !== "boolean")
          throw Error("Choose valid account permissions.");
        permissions[p] = value;
      }
    }
    if (!["owner", "collector", "viewer"].includes(String(body.role)))
      throw Error("Choose a valid user role.");
    if (body.role === "owner" && !allowed(caller, "manage_owners"))
      throw Error("Only an authorised owner manager can add an owner.");
    if (
      (permissions.manage_users || permissions.manage_owners) &&
      !allowed(caller, "manage_owners")
    )
      throw Error(
        "Only an authorised owner manager can grant admin permissions.",
      );
  }
  let target = String(body.user_id || "");
  if (action !== "create") {
    if (!uuid(target)) throw Error("Choose a valid user.");
    const existing = await backend.member(target);
    if (!existing || existing.owner_id !== caller.owner_id)
      throw Error("This user is not part of your business.");
    if (existing.role === "owner" && !allowed(caller, "manage_owners"))
      throw Error("Your account cannot change an owner's access.");
  }
  const safe: Record<string, unknown> = {
    id: body.id,
    action,
    ...(action !== "reset_access"
      ? {
          name: String(body.name || "").trim(),
          email: String(body.email || "")
            .trim()
            .toLowerCase(),
          role: body.role,
          active: body.active === true,
          permissions,
          must_change_password: action === "create",
        }
      : {}),
    ...(target ? { user_id: target } : {}),
  };
  if (
    action !== "reset_access" &&
    (String(safe.name).length < 1 ||
      String(safe.name).length > 150 ||
      !/^\S+@\S+\.\S+$/.test(String(safe.email)))
  )
    throw Error("Enter a valid name and email.");
  const previous = await backend.previous(String(body.id));
  if (previous) {
    const expected = {
      ...safe,
      ...(action === "create" ? { user_id: previous.request.user_id } : {}),
    };
    const canonical = (x: Record<string, unknown>) =>
      JSON.stringify(x, (_key, value) =>
        value && typeof value === "object" && !Array.isArray(value)
          ? Object.fromEntries(
              Object.keys(value)
                .sort()
                .map((k) => [k, value[k]]),
            )
          : value,
      );
    if (
      previous.created_by !== caller.id ||
      canonical(previous.request) !== canonical(expected)
    )
      throw Error(
        "This request was already used for a different change. Reopen the form.",
      );
    return previous.result;
  }
  if (action === "create") {
    if (await backend.memberForEmail(String(safe.email)))
      throw Error(
        "This email already has an account. Edit that user's access instead.",
      );
    target = (await backend.authForEmail(String(safe.email))) || "";
    if (target) {
      const member = await backend.member(target);
      if (member) throw Error("This email is already linked to an account.");
      await backend.password(target, password);
    } else
      target = await backend.create(
        String(safe.email),
        password,
        String(safe.name),
      );
    safe.user_id = target;
  } else if (action === "reset_access")
    await backend.password(target, password);
  // Passwords are never sent to the ledger RPC or its audit/request tables.
  return await backend.save(safe);
}
