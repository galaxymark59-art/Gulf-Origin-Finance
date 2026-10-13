import { useState } from "react";
import { createRoot } from "react-dom/client";
import { emptyState, day, visibleState } from "./domain";
import { LanguageContext } from "./i18n";
import { Cash, Savings } from "./components/Cash";
import { GoodsForm } from "./components/GoodsForm";
import { Reports } from "./components/FinanceReports";
import { Dashboard, Merchants } from "./components/Views";
import ExistingRecords from "./components/ExistingRecords";
import type { FinanceEngine } from "./engine";
import "./style.css";
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
      download: () => setMessage("QA only"),
      share: () => {},
      sent: () => {},
      reverse: () => {},
    };
  return (
    <LanguageContext value="en">
      <div className="content" style={{ maxWidth: 1250, margin: "auto" }}>
        <p className="alert">
          Fictional local QA. No real financial records or account changes are
          submitted.
        </p>
        <div className="toolbar">
          {[
            "dashboard",
            "merchants",
            "invoice",
            "return",
            "cash",
            "savings",
            "reports",
            "import",
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
        </div>
        {message && <p role="status">{message}</p>}
        {page === "cash" ? (
          <Cash
            state={state}
            onSave={async (op) => {
              setS((v) => ({ ...v, queue: [...v.queue, op] }));
              setMessage("Saved in QA memory only.");
            }}
            notify={setMessage}
          />
        ) : page === "savings" ? (
          <Savings
            state={state}
            onSave={async (op) =>
              setS((v) => ({ ...v, queue: [...v.queue, op] }))
            }
            notify={setMessage}
          />
        ) : page === "invoice" || page === "return" ? (
          <section className="card">
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
          <ExistingRecords state={state} engine={{refresh:async()=>{}} as FinanceEngine} onDone={()=>setPage("merchants")} previewOnly />
        ) : page === "reports" ? (
          <Reports state={state} actions={actions} notify={setMessage} />
        ) : page === "merchants" ? (
          <Merchants
            state={state}
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
