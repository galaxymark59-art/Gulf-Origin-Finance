import { personName, personRole } from "../presentation";
import { useState, type FormEvent } from "react";
import {
  type State,
  type Member,
  type Permission,
  type Role,
  dateTime,
} from "../domain";
import { can } from "../finance";
import { supabase } from "../client";
import { Field, Modal } from "./Common";
const permissionLabels: Record<Permission, string> = {
  view_records: "View financial records",
  record_transactions: "Record merchant transactions",
  export_reports: "Export reports",
  manage_cash: "Record cash, expenses and savings",
  manage_users: "Manage collector and viewer accounts",
  manage_owners: "Manage owners and grant admin permissions",
};
export function Users({
  state,
  onRefresh,
  onHistory,
  notify,
}: {
  state: State;
  onRefresh: () => Promise<void>;
  onHistory: (id: string) => void;
  notify: (s: string) => void;
}) {
  const [editing, setEditing] = useState<Member | null | undefined>(),
    [reset, setReset] = useState<Member>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function invoke(payload: Record<string, unknown>) {
    if (!navigator.onLine)
      throw Error("Connect to the internet to manage accounts.");
    const { data, error } = await supabase.functions.invoke("manage-users", {
      body: payload,
    });
    if (error) {
      let message = "Account change failed. Check your connection and retry.";
      try {
        const response = (error as { context?: Response }).context;
        if (response) {
          const body = await response.json();
          if (body.error) message = body.error;
        }
      } catch {}
      throw Error(message);
    }
    if (data?.error) throw Error(data.error);
    await onRefresh();
    return data;
  }
  if (!can(state.member, "manage_users"))
    return (
      <div className="alert">
        Only an authorised account manager can manage users.
      </div>
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR TEAM</p>
          <h1>People & access</h1>
          <p>
            Add a separate account for each person. Administrators have full
            access, collectors record work, and viewers can only read permitted
            records.
          </p>
        </div>
        <button
          className="primary"
          onClick={() => {
            setEditing(null);
            setError("");
          }}
        >
          Add user
        </button>
      </div>
      <section className="card">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Name / email</th>
                <th>Role / access</th>
                <th>Last activity</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {state.members.map((u) => (
                <tr key={u.id}>
                  <td>
                    <strong>{personName(state, u.id)}</strong>
                    <small>{u.email}</small>
                  </td>
                  <td>
                    {personRole(state, u)}
                    <small>{u.active ? "Active" : "Disabled"}</small>
                  </td>
                  <td>
                    {u.last_activity
                      ? dateTime(u.last_activity)
                      : "No recorded activity yet"}
                  </td>
                  <td>
                    <div className="document-actions">
                      <button className="link" onClick={() => onHistory(u.id)}>
                        View work
                      </button>
                      {(u.role !== "owner" ||
                        can(state.member, "manage_owners")) && (
                        <>
                          <button
                            className="link"
                            onClick={() => {
                              setEditing(u);
                              setError("");
                            }}
                          >
                            Edit access
                          </button>
                          <button
                            className="link"
                            onClick={() => {
                              setReset(u);
                              setError("");
                            }}
                          >
                            Reset access
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {editing !== undefined && (
        <Modal
          title={editing ? "Edit user access" : "Add a user"}
          onClose={() => setEditing(undefined)}
        >
          <UserForm
            member={
              editing
                ? { ...editing, name: personName(state, editing.id) }
                : editing
            }
            allowOwners={can(state.member, "manage_owners")}
            busy={busy}
            error={error}
            onSave={async (payload) => {
              setBusy(true);
              setError("");
              try {
                await invoke({
                  id: crypto.randomUUID(),
                  action: editing ? "update" : "create",
                  ...payload,
                  ...(editing ? { user_id: editing.id } : {}),
                });
                setEditing(undefined);
                notify("User account saved.");
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Unable to save user.",
                );
              } finally {
                setBusy(false);
              }
            }}
          />
        </Modal>
      )}
      {reset && (
        <Modal
          title={"Reset access for " + reset.name}
          onClose={() => setReset(undefined)}
        >
          <p className="hint">
            Set a new temporary password and share it privately with this
            person. They will be asked to change it after signing in.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              const f = new FormData(e.currentTarget);
              try {
                if (f.get("password") !== f.get("confirm"))
                  throw Error("The passwords do not match.");
                await invoke({
                  id: crypto.randomUUID(),
                  action: "reset_access",
                  user_id: reset.id,
                  password: String(f.get("password")),
                });
                setReset(undefined);
                notify("Access reset. Share the temporary password privately.");
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Unable to reset access.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Temporary password (12 or more characters)">
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
            {error && (
              <p className="alert" role="alert">
                {error}
              </p>
            )}
            <button className="primary" disabled={busy}>
              {busy ? "Saving…" : "Reset access"}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
function UserForm({
  member,
  allowOwners,
  busy,
  error,
  onSave,
}: {
  member: Member | null;
  allowOwners: boolean;
  busy: boolean;
  error: string;
  onSave: (p: Record<string, unknown>) => Promise<void>;
}) {
  const [role, setRole] = useState<Role>(member?.role || "collector"),
    [permissions, setPermissions] = useState<
      Partial<Record<Permission, boolean>>
    >(member?.permissions || {});
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await onSave({
      name: String(f.get("name")).trim(),
      email: String(f.get("email")).trim().toLowerCase(),
      role,
      active: f.get("active") === "on",
      permissions,
      ...(!member
        ? { password: String(f.get("password")), must_change_password: true }
        : {}),
    });
  }
  return (
    <form onSubmit={submit}>
      <Field label="Name">
        <input
          name="name"
          required
          maxLength={150}
          defaultValue={member?.name}
        />
      </Field>
      <Field label="Email">
        <input
          name="email"
          type="email"
          required
          defaultValue={member?.email}
          readOnly={Boolean(member)}
          autoComplete="off"
        />
      </Field>
      {!member && (
        <Field label="Initial password (12 or more characters)">
          <input
            type="password"
            name="password"
            minLength={12}
            required
            autoComplete="new-password"
          />
        </Field>
      )}
      <Field label="Role">
        <select
          value={role}
          onChange={(e) => {
            setRole(e.target.value as Role);
            setPermissions({});
          }}
        >
          {allowOwners && (
            <option value="owner">Administrator · full access</option>
          )}
          <option value="collector">
            Collector · record collections and other work
          </option>
          <option value="viewer">Viewer · read only</option>
        </select>
      </Field>
      <label className="check">
        <input
          type="checkbox"
          name="active"
          defaultChecked={member?.active ?? true}
        />{" "}
        Account is active
      </label>
      {role !== "owner" && (
        <fieldset>
          <legend>Additional permissions</legend>
          {(Object.keys(permissionLabels) as Permission[])
            .filter(
              (p) =>
                role !== "viewer" ||
                ["view_records", "export_reports"].includes(p),
            )
            .filter(
              (p) =>
                allowOwners || !["manage_users", "manage_owners"].includes(p),
            )
            .map((p) => (
              <label className="check" key={p}>
                <input
                  type="checkbox"
                  checked={
                    permissions[p] ??
                    can(
                      {
                        id: "",
                        owner_id: "",
                        name: "",
                        email: "",
                        active: true,
                        role,
                        permissions: {},
                      },
                      p,
                    )
                  }
                  onChange={(e) =>
                    setPermissions((current) => ({
                      ...current,
                      [p]: e.target.checked,
                    }))
                  }
                />
                {permissionLabels[p]}
              </label>
            ))}
        </fieldset>
      )}
      <p className="hint">
        Passwords are handled by secure authentication and are never saved as
        readable text in the app's records. Disabling a user blocks their cloud
        access.
      </p>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      <button className="primary full" disabled={busy}>
        {busy ? "Saving…" : member ? "Save access" : "Create account"}
      </button>
    </form>
  );
}
