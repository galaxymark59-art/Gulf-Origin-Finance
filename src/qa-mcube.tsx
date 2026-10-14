import { useLayoutEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { emptyState, day, visibleState } from "./domain";
import { LanguageContext } from "./i18n";
import { Cash, Savings } from "./components/Cash";
import { GoodsForm } from "./components/GoodsForm";
import { Reports } from "./components/FinanceReports";
import { Dashboard, Merchants } from "./components/Views";
import ExistingRecords from "./components/ExistingRecords";
import { More } from "./components/More";
import { EntryForm } from "./components/Forms";
import type { FinanceEngine } from "./engine";
import { entryDeletions, cashDeletions, merchantDeletions } from "./deletion";
import "./style.css";
import "./themes.css";
import { applyTheme } from "./themes";
import { ThemeCatalog } from "./components/ThemeCatalog";
if (!import.meta.env.DEV)
  throw Error("Fictional QA is only available in development.");
const initial = emptyState("00000000-0000-4000-8000-000000000099"),
  today = day(new Date().toISOString());
initial.member = {
  id: initial.owner,
  owner_id: initial.owner,
  name: "Fictional QA owner",
  email: "qa@example.test",
  role: "owner",
  active: true,
  permissions: {},
};
initial.members = [initial.member];
initial.businessOwner = initial.owner;
initial.merchants = [
  {
    id: "00000000-0000-4000-8000-000000000098",
    name: "Fictional Merchant",
    phone: "+966500000001",
    contact: "",
    city: "",
    address: "",
    notes: "Fictional QA only",
    prefix: "QA",
    language: "en",
    opening: 500000,
    balance: 500000,
    version: 1,
    sequence: 0,
    created_at: today + "T00:00:00+03:00",
    due_on: "2026-10-01",
  },
];
initial.cashAccounts = [
  {
    id: initial.owner,
    owner_id: initial.owner,
    start_on: today,
    opening_cash: 100000,
    created_by: initial.owner,
  },
];
initial.savingsAccount = {
  owner_id: initial.owner,
  start_on: today,
  opening_savings: 50000,
};
function QA() {
  const [s, setS] = useState(initial),
    [page, setPage] = useState("cash"),
    [message, setMessage] = useState("");
  const state = visibleState(s),
    actions = {
      bulkDelete: async (ids: string[]) => {
        setS((v) => ({
          ...v,
          queue: [...v.queue, ...entryDeletions(visibleState(v), ids)],
        }));
        setMessage("Deleted in fictional QA memory only.");
      },
      download: () => setMessage("QA only"),
      share: () => {},
      sent: () => {},
      reverse: () => {},
    };
  useLayoutEffect(() => {
    applyTheme(state.business.theme);
  }, [state.business.theme]);
  return (
    <LanguageContext value="en">
      <div className="content" style={{ maxWidth: 1250, margin: "auto" }}>
        <p className="alert">
          Fictional local QA. No real financial records or account changes are
          submitted.
        </p>
        <div className="toolbar">
          <button
            className="secondary"
            onClick={() => {
              const stamp = new Date().toISOString();
              setS({
                ...structuredClone(initial),
                merchants: [{ ...initial.merchants[0], balance: 465000 }],
                entries: Array.from({ length: 35 }, (_, i) => ({
                  id: "qa-payment-" + i,
                  merchant_id: initial.merchants[0].id,
                  owner_id: initial.owner,
                  created_by: initial.owner,
                  cash_user: initial.owner,
                  kind: "payment",
                  amount: 1000,
                  delta: -1000,
                  previous: 500000 - i * 1000,
                  balance: 499000 - i * 1000,
                  occurred_at: stamp,
                  created_at: stamp,
                  note: "Fictional QA only",
                  method: "cash",
                  reference: "QA " + (i + 1),
                })),
              });
              setPage("reports");
            }}
          >
            Load bulk delete example
          </button>
          {[
            "dashboard",
            "merchants",
            "invoice",
            "return",
            "cash",
            "savings",
            "reports",
            "import",
            "more",
            "collection",
            "correction",
            "themes",
          ].map((p) => (
            <button className="secondary" key={p} onClick={() => setPage(p)}>
              {p}
            </button>
          ))}
          <label>
            Test role
            <select
              value={s.member!.role}
              onChange={(e) =>
                setS((v) => ({
                  ...v,
                  member: {
                    ...v.member!,
                    role: e.target.value as "owner" | "collector" | "viewer",
                  },
                }))
              }
            >
              <option>owner</option>
              <option>collector</option>
              <option>viewer</option>
            </select>
          </label>
          <button
            className="secondary"
            onClick={() =>
              setS((v) => ({ ...v, cashAccounts: [], savingsAccount: null }))
            }
          >
            Preview starting amounts
          </button>
        </div>
        {message && <p role="status">{message}</p>}
        {page === "themes" && state.member?.role === "owner" ? (
          <section className="card panel">
            <ThemeCatalog
              value={state.business.theme}
              onApply={async (id) => {
                setS((v) => ({ ...v, business: { ...v.business, theme: id } }));
              }}
            />
          </section>
        ) : page === "more" ? (
          <More
            state={state}
            onOpen={(p) =>
              setPage(
                p === "invoices" ? "invoice" : p === "returns" ? "return" : p,
              )
            }
          />
        ) : page === "collection" || page === "correction" ? (
          <section className="card panel">
            <h1>
              {page === "collection" ? "Add collection" : "Correct amount owed"}
            </h1>
            <EntryForm
              key={page}
              merchants={state.merchants}
              selected={state.merchants[0]}
              kind={page === "collection" ? "payment" : "adjustment"}
              onSave={async (op) => {
                setS((v) => ({ ...v, queue: [...v.queue, op] }));
                setMessage("Saved in fictional QA memory only.");
              }}
            />
          </section>
        ) : page === "cash" ? (
          <Cash
            state={state}
            onDelete={async (ids) =>
              setS((v) => ({
                ...v,
                queue: [...v.queue, ...cashDeletions(visibleState(v), ids)],
              }))
            }
            onSave={async (op) => {
              setS((v) => ({ ...v, queue: [...v.queue, op] }));
              setMessage("Saved in QA memory only.");
            }}
            notify={setMessage}
          />
        ) : page === "savings" ? (
          <Savings
            state={state}
            onDelete={async (ids) =>
              setS((v) => ({
                ...v,
                queue: [...v.queue, ...cashDeletions(visibleState(v), ids)],
              }))
            }
            onSave={async (op) =>
              setS((v) => ({ ...v, queue: [...v.queue, op] }))
            }
            notify={setMessage}
          />
        ) : page === "invoice" || page === "return" ? (
          <section className="card panel">
            <GoodsForm
              key={page}
              state={state}
              kind={page}
              onSave={async (op) => {
                setS((v) => ({ ...v, queue: [...v.queue, op] }));
                setMessage("Invoice saved in QA memory only.");
              }}
            />
          </section>
        ) : page === "import" ? (
          <ExistingRecords
            state={state}
            engine={{ refresh: async () => {} } as FinanceEngine}
            onDone={() => setPage("merchants")}
            previewOnly
          />
        ) : page === "reports" ? (
          <Reports state={state} actions={actions} notify={setMessage} />
        ) : page === "merchants" ? (
          <Merchants
            state={state}
            onDelete={async (ids) =>
              setS((v) => ({
                ...v,
                queue: [...v.queue, ...merchantDeletions(visibleState(v), ids)],
              }))
            }
            onAdd={() => {}}
            onMerchant={() => setPage("invoice")}
          />
        ) : (
          <Dashboard
            state={state}
            onAdd={() => {}}
            onPayment={() => {}}
            onMerchant={() => setPage("invoice")}
            actions={actions}
          />
        )}
      </div>
    </LanguageContext>
  );
}
createRoot(document.getElementById("root")!).render(<QA />);
