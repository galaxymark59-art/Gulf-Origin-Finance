import { afterAll, beforeAll, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { day } from "./domain";
import { cashDay, savingsPeriod } from "./finance";
const owner = "00000000-0000-4000-8000-000000000001";
const collector = "00000000-0000-4000-8000-000000000002";
const viewer = "00000000-0000-4000-8000-000000000003";
const merchant = "00000000-0000-4000-8000-000000000004";
let db: PGlite;
const date = day(new Date().toISOString());
async function asUser(id: string) {
  await db.exec("reset role;");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("set role authenticated;");
}
async function commit(
  kind: string,
  payload: object,
  expected?: number,
  id = crypto.randomUUID(),
) {
  const request = {
    id,
    kind,
    payload,
    ...(expected !== undefined ? { expected } : {}),
  };
  const result = await db.query<{ result: any }>(
    "select public.commit_operation($1::jsonb) as result",
    [JSON.stringify(request)],
  );
  return { id, request, result: result.rows[0].result };
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create schema storage;
  create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;$$;
  grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
  create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
  alter table storage.objects enable row level security; grant usage on schema storage to authenticated; grant select,insert on storage.objects to authenticated;
  create function storage.foldername(n text) returns text[] language sql immutable as $$select string_to_array(n,'/');$$;
  create function storage.filename(n text) returns text language sql immutable as $$select (string_to_array(n,'/'))[array_length(string_to_array(n,'/'),1)];$$;
  insert into auth.users(id,email) values('${owner}','owner@example.test'),('${collector}','collector@example.test'),('${viewer}','viewer@example.test');`);
  await db.exec(readFileSync("database/schema.sql", "utf8"));
  await db.exec(
    `insert into public.owner_profiles(id) values('${owner}'); insert into public.business_profiles(owner_id,body) values('${owner}','{"name":"Gulf Origin International","logo":""}');`,
  );
  await asUser(owner);
  await commit("merchant", {
    id: merchant,
    name: "Test Merchant",
    phone: "+966500000000",
    language: "en",
    prefix: "QA",
    opening: 600000,
  });
  await commit(
    "entry",
    {
      merchant_id: merchant,
      kind: "payment",
      amount: 100000,
      method: "cash",
      occurred_at: new Date().toISOString(),
    },
    600000,
  );
  await db.exec("reset role;");
  await db.exec(
    readFileSync(
      "supabase/migrations/20261013083414_mcube_finance.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20261013120015_mcube_notifications.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20261013185654_merchant_history_import.sql",
      "utf8",
    ),
  );
}, 120000);
afterAll(async () => {
  await db?.close();
});
it("imports a year of merchant history atomically, once, without new-payment alerts", async () => {
  const id = crypto.randomUUID(),
    start = "2025-10-14";
  const group = {
    id,
    opening_id: crypto.randomUUID(),
    name: "Fictional imported merchant",
    phone: "",
    opening: 500000,
    closing: 350000,
    start_on: start,
    rows: [
      {
        id: crypto.randomUUID(),
        kind: "payment",
        amount: 100000,
        reference: "OLD-001",
        method: "cash",
        occurred_at: start + "T12:00:00+03:00",
      },
      {
        id: crypto.randomUUID(),
        kind: "payment",
        amount: 50000,
        reference: "OLD-002",
        method: "bank",
        occurred_at: "2026-10-01T12:00:00+03:00",
      },
    ],
  };
  const request = {
    id: crypto.randomUUID(),
    file_hash: "a".repeat(64),
    filename: "fictional.csv",
    merchants: [group],
  };
  await asUser(collector);
  await expect(
    db.query("select public.import_merchant_history($1::jsonb)", [
      JSON.stringify(request),
    ]),
  ).rejects.toThrow("PERMISSION_DENIED");
  await asUser(owner);
  const bad = {
    ...request,
    id: crypto.randomUUID(),
    file_hash: "b".repeat(64),
    merchants: [{ ...group, closing: 1 }],
  };
  await expect(
    db.query("select public.import_merchant_history($1::jsonb)", [
      JSON.stringify(bad),
    ]),
  ).rejects.toThrow("IMPORT_BALANCE_MISMATCH");
  expect(
    (await db.query("select * from public.merchants where id=$1", [id])).rows,
  ).toHaveLength(0);
  for (let i = 0; i < 2; i++)
    await db.query("select public.import_merchant_history($1::jsonb)", [
      JSON.stringify(request),
    ]);
  const {
    rows: [row],
  } = await db.query<{ balance: number; entries: number; alerts: number }>(
    "select balance,(select count(*) from public.financial_transactions where merchant_id=$1) entries,(select count(*) from public.notification_events where transaction_id in(select id from public.financial_transactions where merchant_id=$1)) alerts from public.merchants where id=$1",
    [id],
  );
  expect(Number(row.balance)).toBe(350000);
  expect(Number(row.entries)).toBe(3);
  expect(Number(row.alerts)).toBe(0);
  await expect(
    db.query("select public.import_merchant_history($1::jsonb)", [
      JSON.stringify({
        ...request,
        id: crypto.randomUUID(),
        file_hash: "c".repeat(64),
      }),
    ]),
  ).rejects.toThrow("IMPORT_MERCHANT_EXISTS");
  // The remaining database fixtures address their own merchant explicitly.
});

it("preserves existing balances and receipt snapshots through the migration", async () => {
  await asUser(owner);
  const {
    rows: [row],
  } = await db.query<{ s: any }>("select public.get_snapshot() s");
  expect(row.s.merchants[0].balance).toBe(500000);
  expect(
    row.s.entries.filter((e: any) => e.merchant_id === merchant),
  ).toHaveLength(2);
  expect(
    row.s.receipts.find((r: any) => r.snapshot.merchant.id === merchant)
      .snapshot.business.name,
  ).toBe("Gulf Origin International");
  expect(row.s.business.name).toBe("Mcube Exporters");
});
it("freezes the current payment and the previous 15 days in the issued receipt", async () => {
  await asUser(owner);
  const payment = await commit(
    "entry",
    {
      merchant_id: merchant,
      kind: "payment",
      amount: 100,
      method: "bank",
      occurred_at: new Date().toISOString(),
    },
    500000,
  );
  const {
    rows: [row],
  } = await db.query<{ snapshot: any }>(
    "select snapshot from public.receipts where transaction_id=$1",
    [payment.id],
  );
  expect(row.snapshot.history.to).toBe(date);
  expect(
    row.snapshot.history.entries.some((e: any) => e.id === payment.id),
  ).toBe(true);
  // Reverse the fictional extra payment to keep the following fixtures unchanged.
  await commit(
    "entry",
    {
      merchant_id: merchant,
      kind: "reversal",
      reverses: payment.id,
      occurred_at: new Date().toISOString(),
    },
    499900,
  );
  const {
    rows: [after],
  } = await db.query<{ snapshot: any }>(
    "select snapshot from public.receipts where transaction_id=$1",
    [payment.id],
  );
  expect(after.snapshot.history).toEqual(row.snapshot.history);
});

it("lets collectors record work, blocks viewers and disabled accounts, and protects the final owner", async () => {
  await asUser(owner);
  for (const [id, role] of [
    [collector, "collector"],
    [viewer, "viewer"],
  ]) {
    await db.query("select public.admin_user($1::jsonb)", [
      JSON.stringify({
        id: crypto.randomUUID(),
        action: "create",
        user_id: id,
        name: role,
        email: role + "@example.test",
        role,
        active: true,
        permissions: {},
      }),
    ]);
  }
  await asUser(collector);
  await commit(
    "entry",
    {
      merchant_id: merchant,
      kind: "payment",
      amount: 10000,
      method: "cash",
      occurred_at: new Date().toISOString(),
    },
    500000,
  );
  const {
    rows: [row],
  } = await db.query<{ s: any }>("select public.get_snapshot() s");
  expect(row.s.entries.at(-1).created_by).toBe(collector);
  await expect(
    db.query("select public.admin_user($1::jsonb)", [
      JSON.stringify({
        id: crypto.randomUUID(),
        action: "update",
        user_id: owner,
      }),
    ]),
  ).rejects.toThrow("PERMISSION_DENIED");
  await asUser(viewer);
  await expect(
    commit(
      "entry",
      {
        merchant_id: merchant,
        kind: "payment",
        amount: 1,
        method: "cash",
        occurred_at: new Date().toISOString(),
      },
      490000,
    ),
  ).rejects.toThrow("PERMISSION_DENIED");
  await expect(
    db.exec(
      "insert into public.cash_accounts(id,owner_id,start_on,opening_cash,created_by) values('" +
        viewer +
        "','" +
        owner +
        "',current_date,0,'" +
        viewer +
        "')",
    ),
  ).rejects.toThrow();
  await asUser(owner);
  await expect(
    db.query("select public.admin_user($1::jsonb)", [
      JSON.stringify({
        id: crypto.randomUUID(),
        action: "update",
        user_id: owner,
        role: "viewer",
        active: true,
        name: "Owner",
        email: "owner@example.test",
        permissions: {},
      }),
    ]),
  ).rejects.toThrow("LAST_OWNER");
  await db.query("select public.admin_user($1::jsonb)", [
    JSON.stringify({
      id: crypto.randomUUID(),
      action: "update",
      user_id: viewer,
      name: "Viewer",
      email: "viewer@example.test",
      role: "viewer",
      active: false,
      permissions: {},
    }),
  ]);
  await asUser(viewer);
  await expect(db.query("select public.get_snapshot()")).rejects.toThrow(
    "ACCOUNT_DISABLED",
  );
});

it("deduplicates invoices, separates returns from cash, and retries the same operation once", async () => {
  await asUser(owner);
  const document = {
    reference: "INV-001",
    date,
    lines: [
      {
        id: "item1",
        description: "Goods",
        quantity: 2000,
        unit_price: 150000,
        total: 300000,
      },
    ],
  };
  const invoice = await commit(
    "entry",
    {
      merchant_id: merchant,
      kind: "invoice",
      amount: 300000,
      document,
      occurred_at: date + "T00:00:00+03:00",
    },
    490000,
  );
  await db.query("select public.commit_operation($1::jsonb)", [
    JSON.stringify(invoice.request),
  ]);
  await expect(
    commit(
      "entry",
      {
        merchant_id: merchant,
        kind: "invoice",
        amount: 300000,
        document,
        occurred_at: date + "T00:00:00+03:00",
      },
      790000,
    ),
  ).rejects.toThrow("DUPLICATE_INVOICE");
  await commit(
    "entry",
    {
      merchant_id: merchant,
      kind: "return",
      amount: 150000,
      document: {
        ...document,
        reference: "RET-001",
        original_invoice: invoice.id,
        lines: [{ ...document.lines[0], quantity: 1000, total: 150000 }],
      },
      occurred_at: date + "T00:00:00+03:00",
    },
    790000,
  );
  const {
    rows: [r],
  } = await db.query<{ balance: number; cash: number }>(
    "select (select balance from public.merchants where id=$1) balance,(select sum(case when method='cash' and kind='payment' then amount when method='cash' and kind='reversal' then -amount else 0 end) from public.financial_transactions where merchant_id=$1) cash",
    [merchant],
  );
  expect(Number(r.balance)).toBe(640000);
  expect(Number(r.cash)).toBe(110000);
  await expect(
    db.exec("update public.financial_transactions set amount=1"),
  ).rejects.toThrow();
});

it("computes cash counts on the server and handles direct savings purchases without double counting", async () => {
  await asUser(owner);
  await commit("cash_account", {
    id: owner,
    start_on: date,
    opening_cash: 100000,
  });
  await commit("cash_account", {
    id: collector,
    start_on: date,
    opening_cash: 0,
  });
  await commit("savings_account", { start_on: date, opening_savings: 50000 });
  const move = (kind: string, amount: number, destination = "cash") =>
    commit("cash_entry", {
      kind,
      amount,
      destination,
      note: "Test entry",
      occurred_at: new Date().toISOString(),
    });
  await move("expense", 20000);
  await move("savings_deposit", 30000);
  await move("savings_withdrawal", 10000, "purchase");
  const check = await commit("cash_check", {
    date,
    scope_user: null,
    counted: 158000,
    expected: 999999,
    note: "Counted by hand",
  });
  expect(Number(check.result.expected)).toBe(160000);
  expect(Number(check.result.difference)).toBe(-2000);
  await expect(move("savings_withdrawal", 999999)).rejects.toThrow(
    "INSUFFICIENT_SAVINGS",
  );
  await expect(db.exec("delete from public.cash_checks")).rejects.toThrow();
});
it("keeps paired cash handovers neutral for the company and reversals with the original holder", async () => {
  await asUser(owner);
  await commit("cash_entry", {
    kind: "transfer_out",
    transfer_user: collector,
    amount: 12000,
    note: "QA handover",
    occurred_at: new Date().toISOString(),
  });
  await asUser(collector);
  const expense = await commit("cash_entry", {
    kind: "expense",
    amount: 2000,
    note: "QA expense",
    occurred_at: new Date().toISOString(),
  });
  await asUser(owner);
  await commit("cash_entry", {
    kind: "reversal",
    reverses: expense.id,
    amount: 1,
    note: "QA correction",
    occurred_at: new Date().toISOString(),
  });
  const {
    rows: [{ s }],
  } = await db.query<{ s: any }>("select public.get_snapshot() s");
  expect(s.cashMovements.at(-1).cash_user).toBe(collector);
  expect(s.cashMovements.at(-1).created_by).toBe(owner);
  const check = await commit("cash_check", {
    date,
    scope_user: null,
    counted: 160000,
  });
  expect(Number(check.result.expected)).toBe(160000);
  expect(cashDay(s, date).closing).toBe(Number(check.result.expected));
  expect(savingsPeriod(s, date, date).closing).toBe(70000);
});
it("enforces explicit grants on the server and rejects owner escalation by a staff manager", async () => {
  await asUser(owner);
  const update = (id: string, role: string, permissions: object) =>
    db.query("select public.admin_user($1::jsonb)", [
      JSON.stringify({
        id: crypto.randomUUID(),
        action: "update",
        user_id: id,
        name: role,
        email: role + "@example.test",
        role,
        active: true,
        permissions,
      }),
    ]);
  await update(collector, "collector", {
    record_transactions: false,
    manage_users: true,
  });
  await asUser(collector);
  await expect(
    commit(
      "entry",
      {
        merchant_id: merchant,
        kind: "payment",
        amount: 1,
        method: "cash",
        occurred_at: new Date().toISOString(),
      },
      640000,
    ),
  ).rejects.toThrow("PERMISSION_DENIED");
  await expect(update(owner, "owner", {})).rejects.toThrow("PERMISSION_DENIED");
  await asUser(owner);
  await update(viewer, "viewer", {
    record_transactions: true,
    manage_cash: true,
    export_reports: true,
  });
  await asUser(viewer);
  await expect(
    commit("cash_entry", {
      kind: "other_in",
      amount: 1,
      note: "QA",
      occurred_at: new Date().toISOString(),
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await expect(
    db.exec("update public.user_accounts set role='owner'"),
  ).rejects.toThrow();
  await asUser(owner);
  await update(collector, "collector", {});
});
it("rejects duplicate return references and tampered invoice line totals", async () => {
  await asUser(owner);
  const doc = {
    reference: "RET-001",
    date,
    lines: [
      {
        id: "item1",
        description: "Goods",
        quantity: 1000,
        unit_price: 100,
        total: 100,
      },
    ],
  };
  await expect(
    commit(
      "entry",
      {
        merchant_id: merchant,
        kind: "return",
        amount: 100,
        document: doc,
        occurred_at: date + "T00:00:00+03:00",
      },
      640000,
    ),
  ).rejects.toThrow("DUPLICATE_RETURN");
  await expect(
    commit(
      "entry",
      {
        merchant_id: merchant,
        kind: "invoice",
        amount: 100,
        document: {
          ...doc,
          reference: "INVALID",
          lines: [{ ...doc.lines[0], total: 101 }],
        },
        occurred_at: date + "T00:00:00+03:00",
      },
      640000,
    ),
  ).rejects.toThrow("INVALID_ITEMS");
});
it("restricts phone registration and retries one notification per payment without duplicate deliveries", async () => {
  const token = "fictional-android-device-token-for-qa";
  await asUser(collector);
  await expect(
    db.query("select public.register_push_device($1,'android')", [token]),
  ).rejects.toThrow("PERMISSION_DENIED");
  await expect(
    db.query("select public.claim_payment_notifications()"),
  ).rejects.toThrow();
  await asUser(owner);
  await db.query("select public.register_push_device($1,'android')", [token]);
  const payment = await commit(
    "entry",
    {
      merchant_id: merchant,
      kind: "payment",
      amount: 100,
      method: "cash",
      occurred_at: new Date().toISOString(),
    },
    640000,
  );
  await db.query("select public.commit_operation($1::jsonb)", [
    JSON.stringify(payment.request),
  ]);
  const { rows: events } = await db.query<{ id: string; body: string }>(
    "select id,body from public.notification_events where transaction_id=$1",
    [payment.id],
  );
  expect(events).toHaveLength(1);
  expect(events[0].body).not.toContain("Test Merchant");
  await asUser(collector);
  expect(
    (await db.query("select * from public.notification_events")).rows,
  ).toHaveLength(0);
  await db.exec("reset role; set role service_role;");
  const {
    rows: [claimed],
  } = await db.query<{ batch: any[] }>(
    "select public.claim_payment_notifications() batch",
  );
  expect(claimed.batch).toHaveLength(1);
  expect(claimed.batch[0].devices).toHaveLength(1);
  expect(
    (
      await db.query<{ batch: any[] }>(
        "select public.claim_payment_notifications() batch",
      )
    ).rows[0].batch,
  ).toHaveLength(0);
  await db.query("select public.record_push_delivery($1,$2,false)", [
    events[0].id,
    claimed.batch[0].devices[0].id,
  ]);
  await db.query(
    "select public.finish_payment_notification($1,false,'QA temporary failure')",
    [events[0].id],
  );
  await db.exec(
    "reset role; update private.notification_outbox set next_attempt_at=now(); set role service_role;",
  );
  const retry = (
    await db.query<{ batch: any[] }>(
      "select public.claim_payment_notifications() batch",
    )
  ).rows[0].batch;
  expect(retry[0].devices).toHaveLength(0);
  await db.query("select public.finish_payment_notification($1,true,null)", [
    events[0].id,
  ]);
  expect(
    (
      await db.query<{ batch: any[] }>(
        "select public.claim_payment_notifications() batch",
      )
    ).rows[0].batch,
  ).toHaveLength(0);
});
