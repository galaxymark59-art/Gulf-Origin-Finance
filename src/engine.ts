import { supabase } from "./client";
import { readLocal, writeLocal } from "./storage";
import { can, normalizeState } from "./finance";
import { entryDeletions, cashDeletions, merchantDeletions } from "./deletion";
import { themes } from "./themes";
import {
  defaultBusiness,
  emptyState,
  friendly,
  visibleState,
  type State,
  type Operation,
} from "./domain";
export class FinanceEngine {
  state: State;
  private listeners = new Set<() => void>();
  private tail: Promise<unknown> = Promise.resolve();
  syncing = false;
  error = "";
  accessDenied = false;
  constructor(readonly owner: string) {
    this.state = emptyState(owner);
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  async whenIdle() {
    await this.tail;
  }
  private emit() {
    this.listeners.forEach((f) => f());
  }
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.tail.then(fn, fn);
    this.tail = next.catch(() => {});
    return next;
  }
  async initialize() {
    this.state = normalizeState(
      (await readLocal<State>("state:" + this.owner)) || emptyState(this.owner),
      this.owner,
    );
    this.emit();
  }
  private async save(s: State) {
    await writeLocal("state:" + this.owner, s);
    this.state = s;
    this.emit();
  }
  view() {
    return visibleState(this.state);
  }
  async refresh() {
    await this.serial(async () => {
      await this.save({ ...(await this.cloud()), queue: this.state.queue });
    });
  }
  async enqueue(op: Operation) {
    const permission = [
      "cash_account",
      "savings_account",
      "cash_entry",
      "cash_check",
    ].includes(op.kind)
      ? "manage_cash"
      : op.kind === "business"
        ? "manage_users"
        : "record_transactions";
    if (!can(this.state.member, permission))
      throw Error(
        "Your account cannot save changes in this section. Connect once to check your access.",
      );
    if (op.kind === "entry") op.payload.created_by = this.owner;
    if (op.kind === "cash_entry" || op.kind === "cash_check")
      op.payload.created_by = this.owner;
    await this.serial(async () => {
      if (this.state.queue.some((q) => q.id === op.id)) return;
      await this.save({ ...this.state, queue: [...this.state.queue, op] });
    });
    if (navigator.onLine) void this.sync();
  }
  async changeTheme(id: string) {
    if (!themes.some((theme) => theme.id === id))
      throw Error("Choose a theme from the catalog.");
    if (
      this.state.member?.role !== "owner" ||
      !can(this.state.member, "manage_users")
    )
      throw Error("Only a business owner can change the theme.");
    await this.serial(async () => {
      const op: Operation = {
        id: crypto.randomUUID(),
        kind: "business",
        created_at: new Date().toISOString(),
        payload: { ...this.view().business, theme: id },
      };
      await this.save({ ...this.state, queue: [...this.state.queue, op] });
    });
    if (navigator.onLine) void this.sync();
  }
  async deleteSelected(
    kind: "entries" | "cash" | "merchants",
    ids: readonly string[],
  ) {
    const permission =
      kind === "merchants"
        ? "manage_users"
        : kind === "cash"
          ? "manage_cash"
          : "record_transactions";
    if (!can(this.state.member, permission))
      throw Error("Your account cannot delete these records.");
    let count = 0;
    await this.serial(async () => {
      const current = this.view();
      const operations =
        kind === "entries"
          ? entryDeletions(current, ids)
          : kind === "cash"
            ? cashDeletions(current, ids)
            : merchantDeletions(current, ids);
      if (!ids.length || !operations.length)
        throw Error(
          "No active records selected. Refresh the list and try again.",
        );
      for (const operation of operations) {
        if (operation.kind === "entry" || operation.kind === "cash_entry")
          operation.payload.created_by = this.owner;
      }
      // One durable write: closing the app cannot lose the remaining selected deletions.
      await this.save({
        ...this.state,
        queue: [...this.state.queue, ...operations],
      });
      count = kind === "merchants" ? ids.length : operations.length;
    });
    if (navigator.onLine) void this.sync();
    return count;
  }
  private async cloud() {
    const { data, error } = await supabase.rpc("get_snapshot");
    if (error) throw Error(error.message);
    if (!data?.member?.active || data.member.id !== this.owner)
      throw Error("ACCOUNT_DISABLED");
    this.accessDenied = false;
    return normalizeState(
      {
        ...data,
        business: data.business || defaultBusiness,
        owner: this.owner,
        lastSync: new Date().toISOString(),
      } as State,
      this.owner,
    );
  }
  sync = async () => {
    if (this.syncing || !navigator.onLine) return;
    this.syncing = true;
    this.error = "";
    this.emit();
    try {
      await this.serial(async () => {
        if (!this.state.queue.length) {
          await this.save({ ...(await this.cloud()), queue: [] });
          return;
        }
        while (this.state.queue.length) {
          const op = this.state.queue[0];
          if (op.conflict) break;
          const original = op.payload.document as
            | { original_path?: string }
            | undefined;
          if (op.kind === "entry" && original?.original_path) {
            const encoded = await readLocal<string>("original:" + op.id);
            if (encoded) {
              const bytes = Uint8Array.from(atob(encoded), (c) =>
                c.charCodeAt(0),
              );
              const { error: uploadError } = await supabase.storage
                .from("invoices")
                .upload(
                  original.original_path,
                  new Blob([bytes], { type: "application/pdf" }),
                  { contentType: "application/pdf", upsert: false },
                );
              if (
                uploadError &&
                !/already exists|duplicate/i.test(uploadError.message)
              )
                throw Error(
                  "The invoice PDF could not be uploaded. It is still saved on this device; reconnect and retry.",
                );
            } else {
              const { data: remote } = await supabase.storage
                .from("invoices")
                .download(original.original_path);
              if (!remote)
                throw Error(
                  "The original invoice PDF is missing from this device. Restore its encrypted backup before retrying.",
                );
            }
          }
          const { error } = await supabase.rpc("commit_operation", {
            p: {
              id: op.id,
              kind: op.kind,
              payload: op.payload,
              ...(op.expected !== undefined ? { expected: op.expected } : {}),
            },
          });
          if (error) {
            const message = friendly(error.message);
            const conflict = error.message.includes("BALANCE_CONFLICT");
            const queue = this.state.queue.map((q) =>
              q.id === op.id ? { ...q, error: message, conflict } : q,
            );
            let cloud: State | undefined;
            if (
              conflict ||
              /ACCOUNT_DISABLED|PERMISSION_DENIED/.test(error.message)
            )
              cloud = await this.cloud();
            await this.save({ ...(cloud || this.state), queue });
            this.error = message;
            break;
          }
          const cloud = await this.cloud();
          await this.save({
            ...cloud,
            queue: this.state.queue.filter((q) => q.id !== op.id),
          });
          const receipt = cloud.receipts.find(
            (r) => r.transaction_id === op.id,
          );
          if (op.kind === "entry" && op.payload.kind === "payment")
            void supabase.functions
              .invoke("payment-notifications", {
                body: { transaction_id: op.id },
              })
              .catch(() => {});
          if (receipt)
            void import("./documents")
              .then((module) =>
                module.receiptFile(receipt, cloud.businessOwner),
              )
              .catch(() => {
                this.error =
                  "The transaction is saved. PDF generation failed; retry from its ledger entry.";
                this.emit();
              });
        }
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      this.accessDenied =
        message.includes("ACCOUNT_DISABLED") ||
        message.includes("PERMISSION_DENIED");
      this.error = friendly(message);
    } finally {
      this.syncing = false;
      this.emit();
    }
  };
  async correctRejectedEntryTime(id: string) {
    await this.serial(async () => {
      const op = this.state.queue.find((op) => op.id === id);
      if (!op || op.kind !== "entry" || !op.error || op.conflict)
        throw Error(
          "Only a rejected pending transaction can have its date corrected.",
        );
      await this.save({
        ...this.state,
        queue: this.state.queue.map((item) =>
          item.id === id
            ? {
                ...item,
                payload: { ...item.payload, occurred_at: item.created_at },
                error: undefined,
                conflict: false,
              }
            : item,
        ),
      });
    });
    void this.sync();
  }
  async backup() {
    await this.whenIdle();
    const state = structuredClone(this.state),
      originals: Record<string, string> = {};
    for (const op of state.queue) {
      if (op.kind === "entry" && op.payload.document) {
        const value = await readLocal<string>("original:" + op.id);
        if (value) originals[op.id] = value;
      }
    }
    return { ...state, originals };
  }
  async restoreBackup(backup: State & { originals?: Record<string, string> }) {
    if (backup.owner !== this.owner || !Array.isArray(backup.queue))
      throw Error("This backup belongs to a different owner.");
    if (!navigator.onLine)
      throw Error("Connect to the internet once to restore a backup.");
    await this.serial(async () => {
      const cloud = await this.cloud();
      const seen = new Set([
        ...this.state.queue.map((op) => op.id),
        ...cloud.entries.map((entry) => entry.id),
        ...cloud.cashMovements.map((entry) => entry.id),
        ...cloud.cashChecks.map((entry) => entry.id),
      ]);
      const recovered = backup.queue.filter((op) => !seen.has(op.id));
      if (
        recovered.some(
          (op) =>
            ![
              "merchant",
              "edit_merchant",
              "entry",
              "business",
              "share",
              "cash_account",
              "savings_account",
              "cash_entry",
              "cash_check",
            ].includes(op.kind),
        )
      )
        throw Error("The backup contains an unsupported operation.");
      for (const op of recovered) {
        const value = backup.originals?.[op.id];
        if (value && op.kind === "entry" && op.payload.document) {
          if (value.length > 14000000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value))
            throw Error("The backup contains an invalid original PDF.");
          await writeLocal("original:" + op.id, value);
        }
      }
      await this.save({ ...cloud, queue: [...this.state.queue, ...recovered] });
    });
    void this.sync();
  }
  async resolve(id: string) {
    await this.serial(async () => {
      const cloud = await this.cloud();
      const queue = structuredClone(this.state.queue);
      let s = { ...cloud, queue: [] } as State;
      for (const op of queue) {
        if (op.kind === "entry")
          op.expected = visibleState(s).merchants.find(
            (m) => m.id === op.payload.merchant_id,
          )?.balance;
        if (op.kind === "edit_merchant")
          op.expected = visibleState(s).merchants.find(
            (m) => m.id === op.payload.id,
          )?.version;
        delete op.error;
        delete op.conflict;
        s.queue.push(op);
        if (op.id === id && op.kind === "entry") op.payload.allow_credit = true;
      }
      await this.save({ ...cloud, queue });
    });
    void this.sync();
  }
}
