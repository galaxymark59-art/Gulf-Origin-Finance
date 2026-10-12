import { supabase } from "./client";
import { readLocal, writeLocal } from "./storage";
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
    this.state =
      (await readLocal<State>("state:" + this.owner)) || emptyState(this.owner);
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
  async enqueue(op: Operation) {
    await this.serial(async () => {
      if (this.state.queue.some((q) => q.id === op.id)) return;
      await this.save({ ...this.state, queue: [...this.state.queue, op] });
    });
    if (navigator.onLine) void this.sync();
  }
  private async cloud() {
    const { data, error } = await supabase.rpc("get_snapshot");
    if (error) throw Error(error.message);
    const { data: owner, error: ownerError } = await supabase
      .from("owner_profiles")
      .select("id")
      .eq("id", this.owner)
      .maybeSingle();
    if (ownerError || !owner) throw Error("OWNER_ONLY");
    return {
      ...data,
      business: data.business || defaultBusiness,
      owner: this.owner,
      lastSync: new Date().toISOString(),
    } as State;
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
            if (conflict) cloud = await this.cloud();
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
          if (receipt)
            void import("./documents")
              .then((module) => module.receiptFile(receipt, this.owner))
              .catch(() => {
                this.error =
                  "The transaction is saved. PDF generation failed; retry from its ledger entry.";
                this.emit();
              });
        }
      });
    } catch (e) {
      this.error = friendly(e instanceof Error ? e.message : "");
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
  async restoreBackup(backup: State) {
    if (backup.owner !== this.owner || !Array.isArray(backup.queue))
      throw Error("This backup belongs to a different owner.");
    if (!navigator.onLine)
      throw Error("Connect to the internet once to restore a backup.");
    await this.serial(async () => {
      const cloud = await this.cloud();
      const seen = new Set([
        ...this.state.queue.map((op) => op.id),
        ...cloud.entries.map((entry) => entry.id),
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
            ].includes(op.kind),
        )
      )
        throw Error("The backup contains an unsupported operation.");
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
