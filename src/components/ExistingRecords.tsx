import { useEffect, useMemo, useState } from "react";
import { type State, day, money } from "../domain";
import {
  type Sheet,
  type Mapping,
  type HistoryRow,
  readHistoryFile,
  guessMapping,
  planHistory,
  importFields,
} from "../history-import";
import { supabase } from "../client";
import { FinanceEngine } from "../engine";
import { Field } from "./Common";
import { downloadBlob } from "../documents";
export default function ExistingRecords({
  state,
  engine,
  onDone,
  previewOnly = false,
}: {
  state: State;
  engine: FinanceEngine;
  onDone: () => void;
  previewOnly?: boolean;
}) {
  const [sheets, setSheets] = useState<Sheet[]>([]),
    [sheet, setSheet] = useState(0),
    [header, setHeader] = useState(0),
    [mapping, setMapping] = useState<Mapping>(guessMapping([])),
    [filename, setFilename] = useState(""),
    [hash, setHash] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [shown, setShown] = useState(50);
  const [options, setOptions] = useState({
    defaultName: "",
    defaultKind: "payment" as HistoryRow["kind"] | "none",
    balanceDate: day(new Date().toISOString()),
    monthFirst: false,
  });
  const rows = sheets[sheet]?.rows.slice(header) || [];
  useEffect(
    () => setConfirmed(false),
    [sheets, sheet, header, mapping, options, state.merchants],
  );
  const plan = useMemo(
    () => planHistory(rows, mapping, state, options),
    [sheets, sheet, header, mapping, state, options],
  );
  const selected = plan.merchants.filter((m) => !m.existing),
    skipped = plan.merchants.filter((m) => m.existing);
  function pickSheet(index: number, start = 0) {
    setSheet(index);
    setHeader(start);
    setMapping(guessMapping(sheets[index]?.rows[start] || []));
    setConfirmed(false);
    setShown(50);
  }
  async function load(file: File) {
    setBusy(true);
    setMessage("");
    setSheets([]);
    setConfirmed(false);
    try {
      const data = await readHistoryFile(file);
      if (!data.length) throw Error("This file has no records.");
      const digest = await crypto.subtle.digest(
        "SHA-256",
        await file.arrayBuffer(),
      );
      setHash(
        Array.from(new Uint8Array(digest), (b) =>
          b.toString(16).padStart(2, "0"),
        ).join(""),
      );
      setFilename(file.name);
      setSheets(data);
      setSheet(0);
      setHeader(0);
      setMapping(guessMapping(data[0].rows[0]));
      setShown(50);
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "The file could not be read.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (previewOnly) return;
    if (!confirmed || plan.issues.length || !selected.length || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const scopedHash = Array.from(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(
              hash +
                (/\.xlsx$/i.test(filename) ? ":" + sheets[sheet].name : ""),
            ),
          ),
        ),
        (b) => b.toString(16).padStart(2, "0"),
      ).join("");
      const { data, error } = await supabase.rpc("import_merchant_history", {
        p: {
          id: crypto.randomUUID(),
          file_hash: scopedHash,
          filename:
            filename +
            (/\.xlsx$/i.test(filename) ? " · " + sheets[sheet].name : ""),
          merchants: selected.map(({ existing, ...m }) => m),
        },
      });
      if (error)
        throw Error(
          error.message.includes("IMPORT_MERCHANT_EXISTS")
            ? "One of these merchants was added on another device. Refresh and review the file again."
            : error.message.includes("IMPORT_BALANCE_MISMATCH")
              ? "The balances do not agree. No records were imported."
              : "Import was not confirmed. Reconnect and try this same file again; a repeated file will not be added twice.",
        );
      await engine.refresh();
      setMessage(
        `${data.merchants} merchants and ${data.transactions} past transactions saved. Open Merchants or Dashboard to see them.`,
      );
      setSheets([]);
      setConfirmed(false);
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "Unable to import. Retry the same file.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (state.member?.role !== "owner")
    return <p className="alert">Only an owner can import existing records.</p>;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">BRING YOUR OLD RECORDS</p>
          <h1>Import existing records</h1>
          <p>
            Upload a file. Check the names, dates and amounts. Save to create
            merchant pages and their payment history together.
          </p>
        </div>
        <button className="secondary" onClick={onDone}>
          Back to merchants
        </button>
      </div>
      <section className="card">
        <h2>1. Choose your file</h2>
        <p className="hint">
          Excel merchant lists and payment sheets are read together when their
          column names match. A blank name under a merchant in those sheets uses
          that merchant. Check the preview; file options let you choose one
          sheet instead.
        </p>
        <p>
          Excel (.xlsx), CSV and readable PDF tables are supported. Your file is
          read on this device. The reviewed records are saved when you press
          Import.
        </p>
        <input
          aria-label="Existing records file"
          type="file"
          accept=".xlsx,.csv,.pdf"
          disabled={busy}
          onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            if (file) void load(file);
          }}
        />
        <p className="hint">
          Scanned or unusual PDFs may need corrections or an Excel export.
          Historical payments keep their dates and do not send new-payment
          alerts. Missing phone numbers can be added later.
        </p>
        <button
          className="link"
          onClick={() =>
            void downloadBlob(
              new Blob(
                [
                  "Merchant name,Phone,Opening balance,Date,Type,Amount,Reference,Method,Notes\nExample shop,+966500000000,5000,2025-10-14,payment,1000,OLD-001,cash,Example only\nExample shop,,,2025-10-15,payment,500,OLD-002,bank,Example only\n",
                ],
                { type: "text/csv;charset=utf-8" },
              ),
              "Mcube-import-example.csv",
            )
          }
        >
          Download a simple example file
        </button>
      </section>
      {busy && (
        <p role="status">
          {sheets.length ? "Saving reviewed records…" : "Reading your file…"}
        </p>
      )}
      {message && (
        <p className="alert" role="status">
          {message}
        </p>
      )}
      {sheets.length > 0 && (
        <>
          <section className="card">
            <h2>2. Check the columns</h2>
            <p>
              We matched familiar column names. If a match is wrong, choose the
              correct column below. All amounts are in SAR.
            </p>
            <p>
              Dates with slashes use{" "}
              {options.monthFirst ? "Month / Day / Year" : "Day / Month / Year"}
              . Rows without a type use{" "}
              {options.defaultKind === "none"
                ? "merchant balances"
                : options.defaultKind}
              . Check the results below.
            </p>
            <details>
              <summary>Check column matches or change file options</summary>
              <div className="form-grid">
                <Field label="Sheet to import">
                  <select
                    value={sheet}
                    onChange={(e) => pickSheet(Number(e.target.value))}
                  >
                    {sheets.map((s, i) => (
                      <option key={i} value={i}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Row containing column names">
                  <input
                    type="number"
                    min="1"
                    max={sheets[sheet].rows.length}
                    value={header + 1}
                    onChange={(e) =>
                      pickSheet(sheet, Math.max(0, Number(e.target.value) - 1))
                    }
                  />
                </Field>
                <Field label="If all rows are for one merchant, enter the name">
                  <input
                    value={options.defaultName}
                    onChange={(e) => {
                      setOptions({ ...options, defaultName: e.target.value });
                      setConfirmed(false);
                    }}
                  />
                </Field>
                <Field label="What does the amount column contain?">
                  <select
                    value={options.defaultKind}
                    onChange={(e) =>
                      setOptions({
                        ...options,
                        defaultKind: e.target
                          .value as typeof options.defaultKind,
                      })
                    }
                  >
                    <option value="payment">Payments received</option>
                    <option value="invoice">Goods supplied</option>
                    <option value="return">Goods returned</option>
                    <option value="adjustment">Balance corrections</option>
                    <option value="none">Merchant balances only</option>
                  </select>
                </Field>
                <Field label="For balances without transaction dates: correct as of">
                  <input
                    type="date"
                    value={options.balanceDate}
                    onChange={(e) =>
                      setOptions({ ...options, balanceDate: e.target.value })
                    }
                  />
                </Field>
                <Field label="Dates written with slashes">
                  <select
                    value={options.monthFirst ? "month" : "day"}
                    onChange={(e) =>
                      setOptions({
                        ...options,
                        monthFirst: e.target.value === "month",
                      })
                    }
                  >
                    <option value="day">Day / Month / Year</option>
                    <option value="month">Month / Day / Year</option>
                  </select>
                </Field>
              </div>
              <div className="form-grid">
                {importFields.map(([key, label]) => (
                  <Field key={key} label={label}>
                    <select
                      value={mapping[key]}
                      onChange={(e) => {
                        setMapping({
                          ...mapping,
                          [key]: Number(e.target.value),
                        });
                        setConfirmed(false);
                      }}
                    >
                      <option value={-1}>Not in this file</option>
                      {rows[0]?.map((h, i) => (
                        <option key={i} value={i}>
                          {h || `Column ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  </Field>
                ))}
              </div>
            </details>
            <p className="hint">
              If an opening amount is missing, the app can calculate it from the
              final amount owed and the listed transactions. Check that
              calculated opening amount in the next step. Unknown balances are
              never assumed to be zero.
            </p>
          </section>
          <section className="card">
            <h2>3. Review before saving</h2>
            <p>
              {selected.length} new merchants ·{" "}
              {selected.reduce((n, m) => n + m.rows.length, 0)} past
              transactions. {skipped.length} merchants already exist and will be
              left unchanged.
            </p>
            {skipped.length > 0 && (
              <p className="hint">
                Already in the app: {skipped.map((m) => m.name).join(", ")}.
                Their old and new records will not be mixed automatically.
                Import other merchants here; ask the owner to review overlapping
                history separately.
              </p>
            )}
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Merchant</th>
                    <th>Opening amount owed</th>
                    <th>Past transactions</th>
                    <th>Amount still owed</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.merchants.map((m) => (
                    <tr key={m.id}>
                      <td>{m.name}</td>
                      <td>{money(m.opening)}</td>
                      <td>{m.rows.length}</td>
                      <td>{money(m.closing)}</td>
                      <td>
                        {m.existing
                          ? "Already exists — skipped"
                          : "Will be created"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {plan.issues.length > 0 && (
              <div role="alert" className="alert">
                <strong>
                  Check these {plan.issues.length} items before importing
                </strong>
                <ul>
                  {plan.issues.slice(0, 100).map((issue, i) => (
                    <li key={i}>{issue}</li>
                  ))}
                </ul>
              </div>
            )}
            <details>
              <summary>Check or correct the extracted rows</summary>
              <p>
                Edit incorrect values. Remove headings or totals that are not
                transactions.
              </p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      {rows[0]?.map((h, i) => (
                        <th key={i}>{h}</th>
                      ))}
                      <th>Remove</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(1, shown + 1).map((row, r) => (
                      <tr key={r}>
                        {rows[0].map((_, c) => (
                          <td key={c}>
                            <input
                              aria-label={`Row ${r + 2}, ${rows[0][c]}`}
                              value={row[c] || ""}
                              onChange={(e) => {
                                setSheets((old) =>
                                  old.map((s, i) =>
                                    i === sheet
                                      ? {
                                          ...s,
                                          rows: s.rows.map((value, j) =>
                                            j === header + r + 1
                                              ? Array.from(
                                                  {
                                                    length: Math.max(
                                                      value.length,
                                                      rows[0].length,
                                                    ),
                                                  },
                                                  (_, k) =>
                                                    k === c
                                                      ? e.target.value
                                                      : value[k] || "",
                                                )
                                              : value,
                                          ),
                                        }
                                      : s,
                                  ),
                                );
                                setConfirmed(false);
                              }}
                            />
                          </td>
                        ))}
                        <td>
                          <button
                            className="link"
                            onClick={() => {
                              setSheets((old) =>
                                old.map((s, i) =>
                                  i === sheet
                                    ? {
                                        ...s,
                                        rows: s.rows.filter(
                                          (_, j) => j !== header + r + 1,
                                        ),
                                      }
                                    : s,
                                ),
                              );
                              setConfirmed(false);
                            }}
                          >
                            Remove row
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > shown + 1 && (
                <button
                  className="secondary"
                  onClick={() => setShown(shown + 50)}
                >
                  Show next 50 rows
                </button>
              )}
            </details>
            <label className="check">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />{" "}
              I checked the merchant names, dates, opening amounts and final
              balances.
            </label>
            <p className="hint">
              This saves the whole reviewed sheet together. A problem saves none
              of it. Uploading the same file again will not add it twice. Set
              cash opening separately for the day you start using cash checks.
            </p>
            <button
              className="primary"
              disabled={
                busy ||
                !confirmed ||
                plan.issues.length > 0 ||
                !selected.length ||
                !navigator.onLine ||
                previewOnly
              }
              onClick={() => void save()}
            >
              Import {selected.length} merchants and their history
            </button>
          </section>
        </>
      )}
    </>
  );
}
