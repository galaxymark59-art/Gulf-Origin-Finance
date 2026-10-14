import { deletedIds } from "../deletion";
import { personName } from "../presentation";
import { useState } from "react";
import {
  day,
  dateTime,
  money,
  type State,
  type Entry,
  type Merchant,
} from "../domain";
import { can } from "../finance";
import { type EntryActions } from "./Views";
import { Empty } from "./Common";
import { saveFile, shareFile } from "../documents";
import { supabase } from "../client";
import { readLocal } from "../storage";
export function Goods({
  state,
  kind,
  onAdd,
  onMerchant,
  actions,
  notify,
}: {
  state: State;
  kind: "invoice" | "return";
  onAdd: () => void;
  onMerchant: (m: Merchant) => void;
  actions: EntryActions;
  notify: (s: string) => void;
}) {
  const [search, setSearch] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [page, setPage] = useState(0),
    [busy, setBusy] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const deleted = deletedIds(state.entries);
  const entries = state.entries
    .filter((e) => deleted.has(e.id) === showDeleted)
    .filter(
      (e) =>
        e.kind === kind &&
        (!from || day(e.occurred_at) >= from) &&
        (!to || day(e.occurred_at) <= to) &&
        (
          (state.merchants.find((m) => m.id === e.merchant_id)?.name || "") +
          e.reference +
          (e.document?.reference || "")
        )
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .slice()
    .reverse();
  async function original(e: Entry, share: boolean) {
    if (busy) return;
    setBusy(true);
    try {
      let file: File;
      const cached = await readLocal<string>("original:" + e.id);
      if (cached)
        file = new File(
          [Uint8Array.from(atob(cached), (c) => c.charCodeAt(0))],
          "Original-" +
            (e.document?.reference || e.reference).replace(
              /[^a-zA-Z0-9._-]/g,
              "_",
            ) +
            ".pdf",
          { type: "application/pdf" },
        );
      else {
        const path = e.document?.original_path;
        if (!path) throw Error("No original PDF is attached.");
        const { data, error } = await supabase.storage
          .from("invoices")
          .download(path);
        if (error || !data)
          throw Error("Reconnect to download the original PDF.");
        file = new File(
          [data],
          "Original-" + e.reference.replaceAll(" ", "-") + ".pdf",
          { type: "application/pdf" },
        );
      }
      if (share) await shareFile(file);
      else await saveFile(file);
    } catch (e) {
      notify(e instanceof Error ? e.message : "The PDF could not be opened.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            {kind === "invoice" ? "GOODS SUPPLIED" : "GOODS RETURNED"}
          </p>
          <h1>{kind === "invoice" ? "Goods supplied" : "Goods returned"}</h1>
          <p>
            {kind === "invoice"
              ? "Add goods supplied to a merchant, or upload a PDF and check its details. The confirmed total is added to the amount due once."
              : "Record goods a merchant returned. The value reduces what they owe; it is not cash received."}
          </p>
        </div>
        {can(state.member, "record_transactions") && (
          <button className="primary" onClick={onAdd}>
            {kind === "invoice" ? "Add goods supplied" : "Add goods returned"}
          </button>
        )}
      </div>
      <div className="card toolbar">
        <label>
          Find merchant or reference
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <label>
          From
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <label>
          To
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(0);
            }}
          />
        </label>
      </div>
      {state.entries.some((e) => e.kind === kind && deleted.has(e.id)) && (
        <div className="deleted-toolbar">
          <button
            className="secondary"
            onClick={() => {
              setShowDeleted((v) => !v);
              setPage(0);
            }}
          >
            {showDeleted ? "Show active entries" : "View deleted entries"}
          </button>
        </div>
      )}
      {!entries.length ? (
        <Empty
          title={
            kind === "invoice" ? "No matching invoices" : "No matching returns"
          }
          detail="Try another merchant, reference or date range."
        />
      ) : (
        <section className="card">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Merchant / reference</th>
                  <th>Date / recorded by</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Documents</th>
                </tr>
              </thead>
              <tbody>
                {entries.slice(page * 30, (page + 1) * 30).map((e) => {
                  const m = state.merchants.find(
                    (m) => m.id === e.merchant_id,
                  )!;
                  const reversed = state.entries.some(
                    (x) => x.reverses === e.id,
                  );
                  return (
                    <tr key={e.id}>
                      <td>
                        <button className="link" onClick={() => onMerchant(m)}>
                          {m.name}
                        </button>
                        <small>
                          {e.document?.reference} · {e.reference}
                        </small>
                        {reversed && (
                          <span className="badge">Corrected by reversal</span>
                        )}
                      </td>
                      <td>
                        {dateTime(e.occurred_at)}
                        <small>
                          {personName(state, e.created_by || e.owner_id)}
                        </small>
                      </td>
                      <td>
                        {e.document?.lines.map((l) => (
                          <small key={l.id}>
                            {l.description} × {l.quantity / 1000}
                          </small>
                        ))}
                      </td>
                      <td>{money(e.amount)}</td>
                      <td>
                        {e.pending ? (
                          <small>PDF available after sync</small>
                        ) : (
                          <div className="document-actions">
                            <button
                              className="link"
                              onClick={() => actions.download(e)}
                            >
                              Download PDF
                            </button>
                            {can(state.member, "record_transactions") && (
                              <button
                                className="link"
                                onClick={() => actions.share(e)}
                              >
                                Share PDF
                              </button>
                            )}
                            {e.document?.original_path && (
                              <>
                                <button
                                  disabled={busy}
                                  className="link"
                                  onClick={() => void original(e, false)}
                                >
                                  Original PDF
                                </button>
                                {can(state.member, "record_transactions") && (
                                  <button
                                    disabled={busy}
                                    className="link"
                                    onClick={() => void original(e, true)}
                                  >
                                    Share original
                                  </button>
                                )}
                              </>
                            )}
                            {can(state.member, "record_transactions") &&
                              !reversed && (
                                <button
                                  className="link danger"
                                  onClick={() => actions.reverse(e)}
                                >
                                  Delete entry
                                </button>
                              )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {entries.length > 30 && (
            <div className="pagination">
              <button
                className="secondary"
                disabled={!page}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <span>
                {page + 1} / {Math.ceil(entries.length / 30)}
              </span>
              <button
                className="secondary"
                disabled={(page + 1) * 30 >= entries.length}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          )}
        </section>
      )}
    </>
  );
}
