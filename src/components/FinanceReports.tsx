import { personLabel, personName } from "../presentation";
import { activeRecords } from "../deletion";
import { useState } from "react";
import { day, money, collection, type State } from "../domain";
import { can, actor } from "../finance";
import {
  exportReport,
  transactionReport,
  cashReport,
  savingsReport,
  entryLabel,
  cashLabel,
  type ReportModel,
} from "../exports";
import { Ledger, type EntryActions } from "./Views";
import { Periods } from "./Periods";
export function Reports({
  state,
  actions,
  notify,
  initialUser = "",
}: {
  state: State;
  actions: EntryActions;
  notify: (message: string) => void;
  initialUser?: string;
}) {
  const today = day(new Date().toISOString()),
    manager = can(state.member, "manage_users");
  const [from, setFrom] = useState(today),
    [to, setTo] = useState(today),
    [user, setUser] = useState(manager ? initialUser : state.owner),
    [merchant, setMerchant] = useState(""),
    [kind, setKind] = useState(""),
    [busy, setBusy] = useState(false);
  const entries = activeRecords(state.entries).filter(
    (e) =>
      day(e.occurred_at) >= from &&
      day(e.occurred_at) <= to &&
      (!user || actor(e) === user) &&
      (!merchant || e.merchant_id === merchant) &&
      (!kind || e.kind === kind),
  );
  function model(): ReportModel {
    if (kind === "savings")
      return savingsReport(state, from, to, user || undefined);
    if (kind === "cash") {
      const dates: string[] = [];
      for (
        let d = new Date(from + "T12:00:00+03:00");
        day(d.toISOString()) <= to;
        d.setUTCDate(d.getUTCDate() + 1)
      ) {
        dates.push(day(d.toISOString()));
        if (dates.length > 366)
          throw Error("Choose up to one year for a daily cash report.");
      }
      const first = cashReport(state, dates[0], user || null);
      first.date = from + " to " + to;
      first.filename = "Mcube-cash-" + from + "-" + to;
      first.sections = dates.flatMap((date) =>
        cashReport(state, date, user || null).sections.map((s) => ({
          ...s,
          title: date + " · " + s.title,
        })),
      );
      return first;
    }
    return transactionReport(state, from, to, {
      user: user || undefined,
      merchant: merchant || undefined,
      kind: kind || undefined,
    });
  }
  async function download(format: "pdf" | "xlsx") {
    setBusy(true);
    try {
      if (!from || !to || from > to) throw Error("Choose a valid date range.");
      await exportReport(model(), format);
      notify("Report saved.");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Export failed. Please retry.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">KNOW WHERE YOU STAND</p>
          <h1>Reports</h1>
          <p>
            Choose dates and filters, then export the same figures to PDF or
            Excel. A cash report shows actual cash; merchant balances show money
            still due.
          </p>
        </div>
        {can(state.member, "export_reports") && (
          <div className="actions">
            <button
              className="primary"
              disabled={busy}
              onClick={() => void download("pdf")}
            >
              Export PDF
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void download("xlsx")}
            >
              Export Excel
            </button>
          </div>
        )}
      </div>
      <section className="card">
        <Periods
          from={from}
          to={to}
          onChange={(a, b) => {
            setFrom(a);
            setTo(b);
          }}
        />
        <div className="toolbar">
          <label>
            Whose work?
            <select value={user} onChange={(e) => setUser(e.target.value)}>
              {manager && <option value="">All users</option>}
              {state.members
                .filter((u) => manager || u.id === state.owner)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {personLabel(state, u)}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Merchant
            <select
              disabled={["cash", "savings"].includes(kind)}
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
            >
              <option value="">All merchants</option>
              {state.merchants.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Report type
            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                if (["cash", "savings"].includes(e.target.value))
                  setMerchant("");
              }}
            >
              <option value="">Combined financial activity</option>
              {[
                "payment",
                "invoice",
                "return",
                "adjustment",
                "reversal",
                "expense",
                "purchase",
                "savings_deposit",
                "savings_withdrawal",
                "other_in",
                "other_out",
                "transfer_out",
              ].map((k) => (
                <option key={k} value={k}>
                  {[
                    "payment",
                    "invoice",
                    "return",
                    "adjustment",
                    "reversal",
                  ].includes(k)
                    ? entryLabel(k)
                    : cashLabel(k)}
                </option>
              ))}
              <option value="cash">Daily cash · A to G</option>
              <option value="savings">Savings history and balances</option>
            </select>
          </label>
        </div>
      </section>
      {["cash", "savings"].includes(kind) ? (
        <section className="card panel">
          <p>
            {kind === "cash"
              ? "The export includes a separate A–G cash report for each selected date. Set opening cash in More → Cash before relying on the total."
              : "Savings exports include the running locker balance and identify each person. A selected person's changes are shown alongside the shared locker totals."}
          </p>
        </section>
      ) : (
        <>
          <div className="stats three">
            <article className="stat featured">
              <span>Payments received</span>
              <strong>{money(collection(entries, from, to))}</strong>
            </article>
            <article className="stat">
              <span>Net goods supplied</span>
              <strong>
                {money(
                  entries
                    .filter(
                      (e) =>
                        e.kind === "invoice" ||
                        (e.kind === "reversal" && e.method === "invoice"),
                    )
                    .reduce((s, e) => s + e.delta, 0),
                )}
              </strong>
            </article>
            <article className="stat">
              <span>Net goods returned</span>
              <strong>
                {money(
                  -entries
                    .filter(
                      (e) =>
                        e.kind === "return" ||
                        (e.kind === "reversal" && e.method === "return"),
                    )
                    .reduce((s, e) => s + e.delta, 0),
                )}
              </strong>
            </article>
          </div>
          <section className="card panel">
            <h2>Merchant history</h2>
            <Ledger
              key={from + to + user + merchant + kind}
              state={state}
              entries={entries}
              actions={actions}
            />
          </section>
          <section className="card panel">
            <h2>Cash, expenses and savings</h2>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Date / reference</th>
                    <th>Details / user</th>
                    <th>Cash change</th>
                    <th>Savings change</th>
                    <th>Expense</th>
                    <th>Purchase</th>
                  </tr>
                </thead>
                <tbody>
                  {activeRecords(state.cashMovements)
                    .filter(
                      (e) =>
                        day(e.occurred_at) >= from &&
                        day(e.occurred_at) <= to &&
                        (!user || e.created_by === user) &&
                        !merchant &&
                        (!kind || e.kind === kind),
                    )
                    .map((e) => (
                      <tr key={e.id}>
                        <td>
                          {day(e.occurred_at)}
                          <small>{e.reference}</small>
                        </td>
                        <td>
                          {cashLabel(e.kind)} · {e.note}
                          <small>{personName(state, e.created_by)}</small>
                        </td>
                        <td>{money(e.cash_delta)}</td>
                        <td>{money(e.savings_delta)}</td>
                        <td>{money(e.expense)}</td>
                        <td>{money(e.purchase)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}
