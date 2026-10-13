import { useState, type FormEvent } from "react";
import {
  day,
  dateTime,
  halalas,
  money,
  type State,
  type Operation,
  type CashKind,
  type CashMovement,
} from "../domain";
import { can, cashDay, cashPosting, savingsPeriod } from "../finance";
import { cashLabel, cashReport, exportReport, savingsReport } from "../exports";
import { Periods } from "./Periods";
import { Field, Modal, Empty } from "./Common";
type Save = (op: Operation) => Promise<void>;
function CountPreview({
  counted,
  expected,
}: {
  counted: string;
  expected: number;
}) {
  try {
    if (!counted) return null;
    const difference = halalas(counted) - expected;
    return (
      <p className="balance-preview">
        Difference: <b>{money(difference)}</b> ·{" "}
        {difference === 0
          ? "Cash matches"
          : difference > 0
            ? "Extra cash"
            : "Cash short"}
      </p>
    );
  } catch {
    return (
      <p className="hint">
        Enter a valid cash amount with up to two decimal places.
      </p>
    );
  }
}
const stamp = () => new Date(Date.now() + 10800000).toISOString().slice(0, 16);
export function CashForm({
  state,
  kind,
  onSave,
  original,
}: {
  state: State;
  kind: CashKind;
  onSave: Save;
  original?: CashMovement;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const f = new FormData(e.currentTarget),
        amount = original?.amount ?? halalas(String(f.get("amount"))),
        destination = String(f.get("destination") || "cash"),
        occurred_at = new Date(
          String(f.get("date")) + ":00+03:00",
        ).toISOString();
      if (new Date(occurred_at).getTime() > Date.now() + 300000)
        throw Error("Choose a time that is not in the future.");
      const posting = original
        ? {
            cash_delta: -original.cash_delta,
            savings_delta: -original.savings_delta,
            expense: -original.expense,
            purchase: -original.purchase,
          }
        : cashPosting(kind, amount, destination);
      const id = crypto.randomUUID(),
        created_at = new Date().toISOString();
      await onSave({
        id,
        kind: "cash_entry",
        created_at,
        payload: {
          id,
          kind,
          amount,
          ...posting,
          owner_id: state.businessOwner,
          created_by: state.owner,
          cash_user: original?.cash_user || state.owner,
          destination: original?.destination || destination,
          note: String(f.get("note") || "").trim(),
          occurred_at,
          created_at,
          reference: "",
          ...(original ? { reverses: original.id } : {}),
          ...(kind === "transfer_out"
            ? { transfer_user: String(f.get("transfer_user")) }
            : {}),
        },
      });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to save. Please retry.",
      );
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <p className="hint">
        {kind === "savings_deposit"
          ? "Move cash you hold into the savings locker. This is not an expense."
          : kind === "savings_withdrawal"
            ? "Take money from the locker and choose where it went. It will be counted once."
            : original
              ? "This adds a correction entry. The original record stays in the history."
              : "Record actual money paid or received. Use a clear description so you can recognise it later."}
      </p>
      {original ? (
        <div className="balance-preview">
          <small>
            {original.reference} · {original.note}
          </small>
          <strong>{money(original.amount)}</strong>
        </div>
      ) : (
        <Field label="Amount · SAR">
          <input name="amount" required inputMode="decimal" />
        </Field>
      )}
      {kind === "savings_withdrawal" && (
        <Field label="Where did the money go?">
          <select name="destination" required>
            <option value="cash">Cash in hand</option>
            <option value="expense">Paid directly for an expense</option>
            <option value="purchase">Paid directly for a purchase</option>
            <option value="other">Another destination (explain below)</option>
          </select>
        </Field>
      )}
      {kind === "transfer_out" && (
        <Field label="Who received the cash?">
          <select required name="transfer_user">
            <option value="">Choose colleague</option>
            {state.cashAccounts
              .filter(
                (a) =>
                  a.id !== state.owner &&
                  state.members.some((u) => u.id === a.id && u.active),
              )
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {state.members.find((u) => u.id === a.id)?.name}
                </option>
              ))}
          </select>
        </Field>
      )}
      <Field label="Date and time · Riyadh">
        <input
          name="date"
          type="datetime-local"
          required
          defaultValue={stamp()}
        />
      </Field>
      <Field
        label={
          kind === "purchase"
            ? "What was purchased?"
            : kind === "expense"
              ? "What was the expense?"
              : "Description / reason"
        }
      >
        <textarea name="note" required maxLength={1000} />
      </Field>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      <button className="primary full" disabled={busy}>
        {busy ? "Saving…" : original ? "Save correction" : "Save entry"}
      </button>
    </form>
  );
}
function CashHistory({
  state,
  entries,
  onReverse,
  savingsOpening,
}: {
  state: State;
  entries: CashMovement[];
  onReverse: (m: CashMovement) => void;
  savingsOpening?: number;
}) {
  const [page, setPage] = useState(0);
  if (!entries.length)
    return (
      <Empty
        title="No entries for these dates"
        detail="Saved cash and savings entries will appear here."
      />
    );
  const rows = [...entries].sort(
    (a, b) =>
      b.occurred_at.localeCompare(a.occurred_at) ||
      b.created_at.localeCompare(a.created_at),
  );
  let running = savingsOpening || 0;
  const balances = new Map<string, number>();
  [...rows].reverse().forEach((e) => {
    running += e.savings_delta;
    balances.set(e.id, running);
  });
  return (
    <>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Details</th>
              <th>Reference / user</th>
              <th>Cash change</th>
              <th>Savings change</th>
              {savingsOpening !== undefined && <th>Running savings</th>}
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(page * 30, (page + 1) * 30).map((m) => (
              <tr key={m.id}>
                <td>{dateTime(m.occurred_at)}</td>
                <td>
                  <strong>{cashLabel(m.kind)}</strong>
                  <small>
                    {m.note}
                    {m.kind === "savings_withdrawal"
                      ? " · " + m.destination
                      : ""}
                  </small>
                </td>
                <td>
                  {m.reference}
                  <small>
                    {state.members.find((u) => u.id === m.created_by)?.name ||
                      "Owner"}
                    {m.pending ? " · Pending sync" : ""}
                  </small>
                </td>
                <td>{money(m.cash_delta)}</td>
                <td>{money(m.savings_delta)}</td>
                {savingsOpening !== undefined && (
                  <td>{money(balances.get(m.id) || 0)}</td>
                )}
                <td>
                  {can(state.member, "manage_cash") &&
                    !m.pending &&
                    !["reversal", "transfer_in", "transfer_out"].includes(
                      m.kind,
                    ) &&
                    !state.cashMovements.some((x) => x.reverses === m.id) &&
                    (m.created_by === state.owner ||
                      can(state.member, "manage_users")) && (
                      <button className="link" onClick={() => onReverse(m)}>
                        Correct entry
                      </button>
                    )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 30 && (
        <div className="pagination">
          <button
            className="secondary"
            disabled={!page}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </button>
          <span>
            {page + 1} / {Math.ceil(rows.length / 30)}
          </span>
          <button
            className="secondary"
            disabled={(page + 1) * 30 >= rows.length}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}
    </>
  );
}
export function Cash({
  state,
  onSave,
  notify,
}: {
  state: State;
  onSave: Save;
  notify: (s: string) => void;
}) {
  const today = day(new Date().toISOString()),
    manager = can(state.member, "manage_users");
  const [tab, setTab] = useState("check"),
    [date, setDate] = useState(today),
    [counted, setCounted] = useState(""),
    [scope, setScope] = useState(manager ? "" : state.owner),
    [kind, setKind] = useState<CashKind>(),
    [reverse, setReverse] = useState<CashMovement>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const c = cashDay(state, date, scope || null),
    writers = state.members.filter((u) => u.active && u.role !== "viewer");
  async function saveCount(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const f = new FormData(e.currentTarget),
        id = crypto.randomUUID();
      await onSave({
        id,
        kind: "cash_check",
        created_at: new Date().toISOString(),
        payload: {
          id,
          owner_id: state.businessOwner,
          created_by: state.owner,
          date,
          scope_user: scope || null,
          counted: halalas(String(f.get("counted"))),
          expected: c.closing,
          difference: halalas(String(f.get("counted"))) - c.closing,
          note: String(f.get("note") || ""),
          created_at: new Date().toISOString(),
        },
      });
      notify(
        "Cash count saved on this device. The final comparison will be confirmed after sync.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save cash count.");
    } finally {
      setBusy(false);
    }
  }
  async function opening(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const f = new FormData(e.currentTarget);
      await onSave({
        id: crypto.randomUUID(),
        kind: "cash_account",
        created_at: new Date().toISOString(),
        payload: {
          id: String(f.get("user") || state.owner),
          owner_id: state.businessOwner,
          start_on: String(f.get("date")),
          opening_cash: halalas(String(f.get("amount"))),
          created_by: state.owner,
        },
      });
      notify(
        "Opening cash saved. Later changes must be recorded as cash entries.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save opening cash.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">CASH IN HAND</p>
          <h1>Cash and daily check</h1>
          <p>
            Record cash expenses and purchases here. At the end of the day,
            count the cash and compare it with the app.
          </p>
        </div>
        {can(state.member, "manage_cash") && (
          <select
            aria-label="Add a cash entry"
            value=""
            onChange={(e) => {
              if (e.target.value) setKind(e.target.value as CashKind);
            }}
          >
            <option value="">Add cash entry…</option>
            <option value="expense">Expense</option>
            <option value="purchase">Purchase</option>
            <option value="other_in">Other cash received</option>
            <option value="other_out">Other cash paid</option>
            <option value="transfer_out">Hand cash to a colleague</option>
          </select>
        )}
      </div>
      <div className="periods">
        {[
          ["check", "End-of-day check"],
          ["history", "Cash history"],
          ["opening", "Opening cash"],
        ].map(([id, label]) => (
          <button
            className={tab === id ? "primary" : "secondary"}
            key={id}
            onClick={() => {
              setTab(id);
              setError("");
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {tab !== "opening" && (
        <div className="card toolbar">
          <Field label="Date">
            <input
              type="date"
              value={date}
              max={today}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          {manager && (
            <Field label="Whose cash?">
              <select value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="">All users together</option>
                {writers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {can(state.member, "export_reports") && (
            <div className="actions">
              <button
                className="secondary"
                disabled={busy || !c.configured}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await exportReport(
                      cashReport(state, date, scope || null),
                      "pdf",
                    );
                    notify("Cash report PDF saved.");
                  } catch (e) {
                    notify(
                      e instanceof Error ? e.message : "PDF export failed.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Export PDF
              </button>
              <button
                className="secondary"
                disabled={busy || !c.configured}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await exportReport(
                      cashReport(state, date, scope || null),
                      "xlsx",
                    );
                    notify("Cash report Excel saved.");
                  } catch (e) {
                    notify(
                      e instanceof Error ? e.message : "Excel export failed.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Export Excel
              </button>
            </div>
          )}
        </div>
      )}
      {tab === "check" && (
        <>
          <div className="stats three">
            <article className="stat">
              <span>Opening cash</span>
              <strong>{money(c.opening)}</strong>
            </article>
            <article className="stat">
              <span>Cash collected</span>
              <strong>{money(c.collected)}</strong>
              <small>Bank and card payments excluded</small>
            </article>
            <article className="stat featured">
              <span>App's closing cash</span>
              <strong>{money(c.closing)}</strong>
              <small>
                {c.pending ? "Includes pending entries" : "Confirmed records"}
              </small>
            </article>
          </div>
          {!c.configured && (
            <p className="alert">
              Set opening cash for each person included in this check. A
              merchant's unpaid balance is not cash in hand.
            </p>
          )}
          {c.changedSinceCheck && (
            <p className="alert">
              The app's cash total changed after the last count. Review the new
              entries and count again.
            </p>
          )}
          <section className="card">
            <h2>Count the cash</h2>
            <p className="hint">
              Enter the banknotes and coins physically held for this date and
              selection. Saving a count does not change cash or merchant
              balances.
            </p>
            {can(state.member, "manage_cash") && (
              <form onSubmit={saveCount}>
                <div className="form-grid">
                  <Field label="Cash physically counted · SAR">
                    <input
                      name="counted"
                      required
                      inputMode="decimal"
                      value={counted}
                      onChange={(e) => setCounted(e.target.value)}
                    />
                  </Field>
                  <Field label="Note (optional)">
                    <input name="note" maxLength={1000} />
                  </Field>
                </div>
                <CountPreview counted={counted} expected={c.closing} />
                <button
                  className="primary"
                  disabled={busy || !c.configured || c.pending}
                >
                  {busy ? "Saving…" : "Save cash check"}
                </button>
                {c.pending && (
                  <p className="hint">
                    Sync pending cash and payment entries before saving a final
                    count.
                  </p>
                )}
              </form>
            )}
            {c.check && (
              <div className="balance-preview">
                <small>Latest confirmed count · {c.check.reference}</small>
                <strong>{money(c.check.counted)}</strong>
                <p>
                  Difference at that count: <b>{money(c.check.difference)}</b> ·{" "}
                  {c.check.difference === 0
                    ? "Cash matches"
                    : c.check.difference > 0
                      ? "Extra cash"
                      : "Cash short"}
                </p>
                <small>
                  App total when saved: {money(c.check.expected)} ·{" "}
                  {dateTime(c.check.created_at)}
                </small>
              </div>
            )}
            {state.cashChecks.filter(
              (x) => x.date === date && x.scope_user === (scope || null),
            ).length > 0 && (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Count / user</th>
                      <th>Counted</th>
                      <th>App cash</th>
                      <th>Difference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.cashChecks
                      .filter(
                        (x) =>
                          x.date === date && x.scope_user === (scope || null),
                      )
                      .slice()
                      .reverse()
                      .map((x) => (
                        <tr key={x.id}>
                          <td>
                            {x.reference}
                            <small>
                              {
                                state.members.find((u) => u.id === x.created_by)
                                  ?.name
                              }{" "}
                              · {dateTime(x.created_at)}
                            </small>
                          </td>
                          <td>{money(x.counted)}</td>
                          <td>{money(x.expected)}</td>
                          <td>
                            {money(x.difference)}
                            {x.pending && (
                              <small>Awaiting cloud comparison</small>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
      {tab === "history" && (
        <section className="card">
          <CashHistory
            state={state}
            entries={c.movements}
            onReverse={(m) => {
              setReverse(m);
              setKind("reversal");
            }}
          />
        </section>
      )}
      {tab === "opening" && (
        <section className="card">
          <h2>Set opening cash once</h2>
          <p className="hint">
            Enter cash already held at the start of the selected day, before
            that day's collections. Do not use merchant balances. Later changes
            go in cash history.
          </p>
          {can(state.member, "manage_cash") &&
            writers.some(
              (u) =>
                (manager || u.id === state.owner) &&
                !state.cashAccounts.some((a) => a.id === u.id),
            ) && (
              <form onSubmit={opening}>
                <div className="form-grid">
                  <Field label="Person holding the cash">
                    <select name="user" required>
                      {writers
                        .filter(
                          (u) =>
                            (manager || u.id === state.owner) &&
                            !state.cashAccounts.some((a) => a.id === u.id),
                        )
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field label="Start date">
                    <input
                      name="date"
                      type="date"
                      required
                      max={today}
                      defaultValue={today}
                    />
                  </Field>
                  <Field label="Cash at start · SAR">
                    <input name="amount" required inputMode="decimal" />
                  </Field>
                </div>
                <button className="primary" disabled={busy}>
                  Save opening cash
                </button>
              </form>
            )}
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Start date</th>
                  <th>Opening cash</th>
                </tr>
              </thead>
              <tbody>
                {state.cashAccounts.map((a) => (
                  <tr key={a.id}>
                    <td>
                      {state.members.find((u) => u.id === a.id)?.name ||
                        "Owner"}
                    </td>
                    <td>{a.start_on}</td>
                    <td>{money(a.opening_cash)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {kind && (
        <Modal
          title={cashLabel(kind)}
          onClose={() => {
            setKind(undefined);
            setReverse(undefined);
          }}
        >
          <CashForm
            state={state}
            kind={kind}
            original={reverse}
            onSave={async (op) => {
              await onSave(op);
              setKind(undefined);
              setReverse(undefined);
              notify("Entry saved on this device.");
            }}
          />
        </Modal>
      )}
    </>
  );
}
export function Savings({
  state,
  onSave,
  notify,
}: {
  state: State;
  onSave: Save;
  notify: (s: string) => void;
}) {
  const today = day(new Date().toISOString());
  const [from, setFrom] = useState(today.slice(0, 7) + "-01"),
    [to, setTo] = useState(today),
    [kind, setKind] = useState<CashKind>(),
    [reverse, setReverse] = useState<CashMovement>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const s = savingsPeriod(state, from, to),
    all = savingsPeriod(state, "1900-01-01", today),
    daily = savingsPeriod(state, today, today);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">MONEY IN THE LOCKER</p>
          <h1>Savings</h1>
          <p>
            Use Money saved when cash goes into the locker. Use Take from
            savings when money leaves it, and choose where it went.
          </p>
        </div>
        {can(state.member, "manage_cash") && state.savingsAccount && (
          <div className="actions">
            <button
              className="primary"
              onClick={() => setKind("savings_deposit")}
            >
              Money saved
            </button>
            <button
              className="secondary"
              onClick={() => setKind("savings_withdrawal")}
            >
              Take from savings
            </button>
          </div>
        )}
      </div>
      {!state.savingsAccount ? (
        <section className="card">
          <h2>Enter savings already in the locker</h2>
          <p className="hint">
            An owner enters this opening amount once. This does not take money
            out of cash in hand.
          </p>
          {can(state.member, "manage_users") && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                try {
                  const f = new FormData(e.currentTarget);
                  await onSave({
                    id: crypto.randomUUID(),
                    kind: "savings_account",
                    created_at: new Date().toISOString(),
                    payload: {
                      owner_id: state.businessOwner,
                      start_on: String(f.get("date")),
                      opening_savings: halalas(String(f.get("amount"))),
                    },
                  });
                } catch (e) {
                  setError(
                    e instanceof Error
                      ? e.message
                      : "Unable to save opening savings.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <div className="form-grid">
                <Field label="Start date">
                  <input
                    name="date"
                    type="date"
                    max={today}
                    defaultValue={today}
                    required
                  />
                </Field>
                <Field label="Savings at start · SAR">
                  <input required inputMode="decimal" name="amount" />
                </Field>
              </div>
              <button className="primary" disabled={busy}>
                Save opening savings
              </button>
            </form>
          )}
        </section>
      ) : (
        <>
          <div className="stats">
            <article className="stat featured">
              <span>Current savings in locker</span>
              <strong>{money(all.closing)}</strong>
            </article>
            <article className="stat">
              <span>Total saved</span>
              <strong>{money(all.added)}</strong>
            </article>
            <article className="stat">
              <span>Total taken out</span>
              <strong>{money(all.withdrawn)}</strong>
            </article>
            <article className="stat">
              <span>Saved today</span>
              <strong>{money(daily.added)}</strong>
            </article>
          </div>
          <div className="card toolbar">
            <Periods
              from={from}
              to={to}
              onChange={(a, b) => {
                setFrom(a);
                setTo(b);
              }}
            />
            {can(state.member, "export_reports") && (
              <div className="actions">
                {(["pdf", "xlsx"] as const).map((format) => (
                  <button
                    className="secondary"
                    key={format}
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await exportReport(
                          savingsReport(state, from, to),
                          format,
                        );
                        notify("Savings report saved.");
                      } catch (e) {
                        notify(
                          e instanceof Error ? e.message : "Export failed.",
                        );
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Export {format === "pdf" ? "PDF" : "Excel"}
                  </button>
                ))}
              </div>
            )}
            <span>
              Opening savings for these dates: {money(s.opening)} · Closing:{" "}
              {money(s.closing)}
            </span>
          </div>
          <section className="card">
            <h2>Savings history</h2>
            <CashHistory
              state={state}
              entries={s.entries}
              savingsOpening={s.opening}
              onReverse={(m) => {
                setReverse(m);
                setKind("reversal");
              }}
            />
          </section>
        </>
      )}
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {kind && (
        <Modal
          title={cashLabel(kind)}
          onClose={() => {
            setKind(undefined);
            setReverse(undefined);
          }}
        >
          <CashForm
            state={state}
            kind={kind}
            original={reverse}
            onSave={async (op) => {
              await onSave(op);
              setKind(undefined);
              setReverse(undefined);
              notify("Savings entry saved on this device.");
            }}
          />
        </Modal>
      )}
    </>
  );
}
