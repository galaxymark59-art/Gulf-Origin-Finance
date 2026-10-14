import { expect, it, vi } from "vitest";
import {
  handleUserAdmin,
  type AdminBackend,
} from "../supabase/functions/_shared/user-admin";
const owner = "00000000-0000-4000-8000-000000000001",
  target = "00000000-0000-4000-8000-000000000002";
function backend(role = "owner"): AdminBackend {
  return {
    authenticate: async () => ({ id: owner }),
    member: async (id) => ({
      id,
      owner_id: owner,
      role,
      active: true,
      permissions: {},
    }),
    previous: async () => null,
    memberForEmail: async () => null,
    authForEmail: async () => null,
    create: vi.fn(async () => target),
    password: vi.fn(async () => {}),
    save: vi.fn(async (p) => p),
  };
}
it("verifies the caller's database role before creating an auth account", async () => {
  const b = backend("viewer");
  await expect(
    handleUserAdmin({ id: crypto.randomUUID(), action: "create" }, b),
  ).rejects.toThrow("cannot manage users");
  expect(b.create).not.toHaveBeenCalled();
});
it("never saves readable passwords in account requests or audit payloads", async () => {
  const b = backend(),
    secret = "temporary-test-credential-123";
  const result = await handleUserAdmin(
    {
      id: crypto.randomUUID(),
      action: "create",
      name: "Collector",
      email: "collector@example.test",
      role: "collector",
      active: true,
      permissions: {},
      password: secret,
    },
    b,
  );
  expect(JSON.stringify(result)).not.toContain(secret);
  expect(b.create).toHaveBeenCalledWith(
    "collector@example.test",
    secret,
    "Collector",
  );
  expect(b.save).toHaveBeenCalledWith(
    expect.not.objectContaining({ password: expect.anything() }),
  );
});
it("prevents a user manager without owner permission from resetting an owner", async () => {
  const b = backend();
  b.member = async (id) => ({
    id,
    owner_id: owner,
    active: true,
    role: id === owner ? "collector" : "owner",
    permissions: { manage_users: true },
  });
  await expect(
    handleUserAdmin(
      {
        id: crypto.randomUUID(),
        action: "reset_access",
        user_id: target,
        password: "temporary-test-credential-123",
      },
      b,
    ),
  ).rejects.toThrow("cannot change an owner's");
  expect(b.password).not.toHaveBeenCalled();
});
