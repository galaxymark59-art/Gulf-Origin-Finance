import {
  type Business,
  type State,
  type Merchant,
  type Receipt,
  day,
  dateTime,
  money,
} from "./domain";
import {
  actor,
  cashDay,
  cashFromPayment,
  merchantHistory,
  savingsPeriod,
} from "./finance";
export type ReportSection = {
  title: string;
  columns: string[];
  rows: (string | number)[][];
  moneyColumns: number[];
  totals?: { label: string; value: number }[];
  note?: string;
};
export type ReportModel = {
  business: Business;
  title: string;
  reference: string;
  date: string;
  preparedBy: string;
  generatedAt: string;
  sections: ReportSection[];
  filename: string;
};
export const entryLabel = (kind: string) =>
  ({
    opening: "Opening amount due",
    payment: "Payment received",
    invoice: "Goods added",
    return: "Goods returned",
    adjustment: "Balance corrected",
    reversal: "Entry reversed",
  })[kind] || kind;
export const cashLabel = (kind: string) =>
  ({
    expense: "Expense",
    purchase: "Purchase",
    other_in: "Other cash received",
    other_out: "Other cash paid",
    savings_deposit: "Money saved",
    savings_withdrawal: "Taken from savings",
    transfer_out: "Cash handed over",
    transfer_in: "Cash received from colleague",
    reversal: "Entry reversed",
  })[kind] || kind;
function base(
  state: State,
  title: string,
  date: string,
  filename: string,
): ReportModel {
  return {
    business: state.business,
    title,
    reference: "REPORT-" + date + "-" + crypto.randomUUID().slice(0, 8),
    date,
    preparedBy: state.member?.name || "",
    generatedAt: new Date().toISOString(),
    sections: [],
    filename,
  };
}
export function cashReport(
  state: State,
  date: string,
  scope: string | null = null,
): ReportModel {
  const c = cashDay(state, date, scope),
    s = savingsPeriod(state, date, date);
  const m = base(state, "DAILY CASH REPORT", date, "Mcube-daily-cash-" + date);
  const name = (id: string) =>
    state.members.find((u) => u.id === id)?.name || "Previous owner";
  const scopeName = scope ? name(scope) : "All users";
  m.sections.push({
    title: "A. Opening Cash",
    columns: ["Cash held by", "Opening cash"],
    rows: [[scopeName, c.opening]],
    moneyColumns: [1],
    note: c.configured
      ? "Cash carried forward from the previous day."
      : "Opening cash is missing for one or more people. Set it before relying on this cash total.",
  });
  m.sections.push({
    title: "B. Money Collected",
    columns: ["Merchant", "Reference", "Collected by", "Amount received"],
    moneyColumns: [3],
    rows: c.payments.map((e) => [
      state.merchants.find((x) => x.id === e.merchant_id)?.name || "Merchant",
      e.reference,
      name(actor(e)),
      cashFromPayment(e),
    ]),
    totals: [{ label: "Total collected in cash", value: c.collected }],
    note: "Bank, card and other non-cash payments are excluded. Reversed cash payments reduce this total.",
  });
  m.sections.push({
    title: "C. Available Cash",
    columns: ["Details", "Amount"],
    moneyColumns: [1],
    rows: [
      ["Opening cash", c.opening],
      ["Cash collected", c.collected],
      ["Other cash received / colleague handovers", c.otherIn],
      ["Savings moved into cash", c.withdrawnToCash],
    ],
    totals: [{ label: "Available cash", value: c.available }],
  });
  const rows = (field: "expense" | "purchase") =>
    c.movements
      .filter((e) => e[field] !== 0)
      .map((e) => [
        dateTime(e.occurred_at),
        e.note,
        e.reference,
        e.cash_delta === 0 ? "Savings" : "Cash",
        e[field],
      ]);
  const cashExpenses = c.movements
      .filter((e) => e.expense !== 0)
      .reduce((n, e) => n - e.cash_delta, 0),
    cashPurchases = c.movements
      .filter((e) => e.purchase !== 0)
      .reduce((n, e) => n - e.cash_delta, 0);
  m.sections.push({
    title: "D. Expenses",
    columns: ["Date", "Expense", "Reference", "Paid from", "Amount"],
    rows: rows("expense"),
    moneyColumns: [4],
    totals: [
      { label: "Total expenses", value: c.expenses },
      { label: "Expenses paid from cash", value: cashExpenses },
    ],
    note: "Expenses paid directly from savings do not reduce cash a second time.",
  });
  m.sections.push({
    title: "E. Purchases",
    columns: ["Date", "Purchase", "Reference", "Paid from", "Amount"],
    rows: rows("purchase"),
    moneyColumns: [4],
    totals: [
      { label: "Total purchases", value: c.purchases },
      { label: "Purchases paid from cash", value: cashPurchases },
    ],
    note: "Purchases are separate from expenses and are counted once.",
  });
  const savingRows = c.movements.filter((e) => e.savings_delta !== 0);
  const selectedNet = savingRows.reduce((n, e) => n + e.savings_delta, 0);
  m.sections.push({
    title: "F. Savings",
    columns: ["Date", "Reference", "Note / destination", "Saved", "Taken out"],
    moneyColumns: [3, 4],
    rows: savingRows.map((e) => [
      dateTime(e.occurred_at),
      e.reference,
      e.note + " · " + e.destination,
      Math.max(0, e.savings_delta),
      Math.max(0, -e.savings_delta),
    ]),
    totals: [
      { label: "Savings at start (whole locker)", value: s.opening },
      { label: "Added to savings today (all users)", value: s.added },
      { label: "Taken from savings today (all users)", value: s.withdrawn },
      ...(scope
        ? [
            {
              label: "Other users' savings changes",
              value: s.closing - s.opening - selectedNet,
            },
          ]
        : []),
      { label: "Total savings in locker", value: s.closing },
    ],
    note: "Savings are the business's shared locker. The locker totals include every user; a selected user's rows show only their activity.",
  });
  m.sections.push({
    title: "G. Closing Cash",
    columns: ["Details", "Amount"],
    moneyColumns: [1],
    rows: [
      ["Available cash", c.available],
      ["Less expenses paid from cash", cashExpenses],
      ["Less purchases paid from cash", cashPurchases],
      ["Less money moved to savings", c.saved],
      ["Less other cash paid / colleague handovers", c.otherPaid],
      ["Cash in hand", c.closing],
      ...(c.check
        ? ([
            ["Cash physically counted", c.check.counted],
            ["App cash when this count was saved", c.check.expected],
            ["Difference at the time of count", c.check.difference],
          ] as (string | number)[][])
        : []),
    ],
    note: c.check
      ? c.changedSinceCheck
        ? "More cash entries changed the closing amount after this count. Count again; the previous check remains in history."
        : "A positive difference is extra cash; a negative difference is cash short."
      : "No physical cash count has been saved for this date and selection.",
  });
  if (c.pending)
    m.sections.push({
      title: "Saved on this device",
      columns: ["Status"],
      rows: [
        [
          "This report includes pending entries. Totals may change after cloud confirmation.",
        ],
      ],
      moneyColumns: [],
    });
  return m;
}
export function savingsReport(
  state: State,
  from: string,
  to: string,
  user?: string,
): ReportModel {
  const s = savingsPeriod(state, from, to),
    m = base(
      state,
      "SAVINGS HISTORY",
      from + " to " + to,
      "Mcube-savings-" + from + "-" + to,
    );
  let balance = s.opening;
  const rows = s.entries
    .slice()
    .sort(
      (a, b) =>
        a.occurred_at.localeCompare(b.occurred_at) ||
        a.created_at.localeCompare(b.created_at) ||
        a.id.localeCompare(b.id),
    )
    .map((e) => {
      balance += e.savings_delta;
      return {
        e,
        row: [
          dateTime(e.occurred_at),
          e.reference,
          e.note + " · " + e.destination,
          state.members.find((u) => u.id === e.created_by)?.name ||
            "Previous owner",
          Math.max(0, e.savings_delta),
          Math.max(0, -e.savings_delta),
          balance,
        ],
      };
    })
    .filter((x) => !user || x.e.created_by === user)
    .map((x) => x.row);
  m.sections.push({
    title: "Savings in the business locker",
    columns: [
      "Date",
      "Reference",
      "Note / destination",
      "Recorded by",
      "Added",
      "Taken out",
      "Running balance",
    ],
    moneyColumns: [4, 5, 6],
    rows,
    totals: [
      { label: "Savings at start (all users)", value: s.opening },
      { label: "Money added (all users)", value: s.added },
      { label: "Money taken out (all users)", value: s.withdrawn },
      { label: "Savings at end (all users)", value: s.closing },
    ],
    note: user
      ? "Rows are filtered by person. Running balances and totals include all users because the locker is shared."
      : "Deposits move money from cash to savings. A withdrawal is counted once at its selected destination.",
  });
  return m;
}
export function transactionReport(
  state: State,
  from: string,
  to: string,
  filter: { user?: string; merchant?: string; kind?: string } = {},
): ReportModel {
  const m = base(
    state,
    "FINANCIAL ACTIVITY",
    from + " to " + to,
    "Mcube-activity-" + from + "-" + to,
  );
  const entries = state.entries.filter(
    (e) =>
      day(e.occurred_at) >= from &&
      day(e.occurred_at) <= to &&
      (!filter.user || actor(e) === filter.user) &&
      (!filter.merchant || e.merchant_id === filter.merchant) &&
      (!filter.kind || e.kind === filter.kind),
  );
  const cash = state.cashMovements.filter(
    (e) =>
      day(e.occurred_at) >= from &&
      day(e.occurred_at) <= to &&
      (!filter.user || e.created_by === filter.user) &&
      !filter.merchant &&
      (!filter.kind || e.kind === filter.kind),
  );
  m.sections.push({
    title: "Merchant activity",
    columns: [
      "Date",
      "Merchant / details",
      "Reference",
      "User",
      "Cash received",
      "Invoice / correction",
      "Returns",
    ],
    moneyColumns: [4, 5, 6],
    rows: entries.map((e) => [
      dateTime(e.occurred_at),
      (state.merchants.find((x) => x.id === e.merchant_id)?.name || "") +
        " · " +
        entryLabel(e.kind) +
        (e.document
          ? " · " +
            e.document.lines
              .map((l) => l.description + " × " + l.quantity / 1000)
              .join(", ")
          : ""),
      e.reference,
      state.members.find((u) => u.id === actor(e))?.name || "Owner",
      e.kind === "payment"
        ? e.amount
        : e.kind === "reversal" &&
            !["adjustment", "invoice", "return"].includes(e.method)
          ? -e.amount
          : 0,
      e.kind === "invoice" ||
      e.kind === "adjustment" ||
      e.kind === "opening" ||
      (e.kind === "reversal" && ["invoice", "adjustment"].includes(e.method))
        ? e.delta
        : 0,
      e.kind === "return" || (e.kind === "reversal" && e.method === "return")
        ? -e.delta
        : 0,
    ]),
  });
  m.sections.push({
    title: "Expenses, purchases, cash and savings",
    columns: [
      "Date",
      "Details",
      "Reference",
      "User",
      "Cash change",
      "Savings change",
      "Expense",
      "Purchase",
    ],
    moneyColumns: [4, 5, 6, 7],
    rows: cash.map((e) => [
      dateTime(e.occurred_at),
      cashLabel(e.kind) + " · " + e.note,
      e.reference,
      state.members.find((u) => u.id === e.created_by)?.name || "Owner",
      e.cash_delta,
      e.savings_delta,
      e.expense,
      e.purchase,
    ]),
  });
  return m;
}
export function statementReport(
  state: State,
  merchant: Merchant,
  from: string,
  to: string,
): ReportModel {
  const h = merchantHistory(state, merchant, from, to),
    m = base(
      state,
      "MERCHANT ACCOUNT",
      from + " to " + to,
      "Mcube-" + merchant.prefix + "-statement-" + from + "-" + to,
    );
  let balance = h.opening;
  m.sections.push({
    title: merchant.name + " · " + merchant.phone,
    columns: [
      "Date",
      "Details / reference",
      "New invoice",
      "Payment received",
      "Returns",
      "Balance",
    ],
    moneyColumns: [2, 3, 4, 5],
    rows: h.entries.map((e) => {
      balance += e.delta;
      return [
        dateTime(e.occurred_at),
        entryLabel(e.kind) +
          " · " +
          e.reference +
          (e.note ? " · " + e.note : ""),
        ["invoice", "opening", "adjustment"].includes(e.kind) ||
        (e.kind === "reversal" && ["invoice", "adjustment"].includes(e.method))
          ? e.delta
          : 0,
        e.kind === "payment"
          ? e.amount
          : e.kind === "reversal" &&
              !["invoice", "return", "adjustment"].includes(e.method)
            ? -e.amount
            : 0,
        e.kind === "return" || (e.kind === "reversal" && e.method === "return")
          ? -e.delta
          : 0,
        balance,
      ];
    }),
    totals: [
      { label: "Previous balance", value: h.opening },
      { label: "Balance at the end of this report", value: h.closing },
      { label: "Current money still due", value: merchant.balance },
    ],
    note: "Balances in this statement follow the selected transaction dates. Original receipt snapshots remain as issued. Corrections appear separately with their own references.",
  });
  return m;
}
export function paymentReport(receipt: Receipt, state: State): ReportModel {
  const { entry, merchant, business, history } = receipt.snapshot,
    to = day(entry.occurred_at),
    from = day(
      new Date(
        new Date(to + "T12:00:00+03:00").getTime() - 15 * 86400000,
      ).toISOString(),
    );
  const asIssued = {
    ...state,
    entries: state.entries.filter((e) => e.created_at <= entry.created_at),
  };
  const h = history || {
    from,
    to,
    ...merchantHistory(asIssued, merchant, from, to),
  };
  const model = statementReport(
    { ...state, business, entries: h.entries },
    merchant,
    h.from,
    h.to,
  );
  model.title = "PAYMENT RECEIPT AND MERCHANT HISTORY";
  model.reference = receipt.reference;
  model.filename =
    receipt.reference.replaceAll(" ", "-") + "-with-15-day-history";
  model.date = day(entry.occurred_at);
  model.generatedAt = entry.created_at;
  model.preparedBy =
    state.members.find((u) => u.id === actor(entry))?.name ||
    business.authorized;
  model.sections.unshift({
    title: "This payment · " + merchant.name,
    columns: ["Details", "Amount"],
    moneyColumns: [1],
    rows: [
      ["Amount received · " + entry.method, entry.amount],
      ["Amount due before this payment", entry.previous],
      ["Amount due after this payment", entry.balance],
    ],
    note:
      dateTime(entry.occurred_at) +
      " · " +
      entry.reference +
      (entry.note ? " · " + entry.note : ""),
  });
  let balance = h.opening;
  const section = model.sections[1];
  section.title =
    "Previous 15 days and this transaction · " + h.from + " to " + h.to;
  section.rows = h.entries.map((e) => {
    balance += e.delta;
    return [
      dateTime(e.occurred_at),
      entryLabel(e.kind) +
        " · " +
        e.reference +
        (e.id === entry.id ? " · This payment" : ""),
      ["opening", "invoice", "adjustment"].includes(e.kind) ||
      (e.kind === "reversal" && ["invoice", "adjustment"].includes(e.method))
        ? e.delta
        : 0,
      e.kind === "payment"
        ? e.amount
        : e.kind === "reversal" &&
            !["invoice", "return", "adjustment"].includes(e.method)
          ? -e.amount
          : 0,
      e.kind === "return" || (e.kind === "reversal" && e.method === "return")
        ? -e.delta
        : 0,
      balance,
    ];
  });
  section.totals = [
    { label: "Previous balance before these dates", value: h.opening },
    { label: "Balance at the end of these dates", value: balance },
    {
      label: "Amount due after this payment was recorded",
      value: entry.balance,
    },
  ];
  section.note =
    "Includes this payment and the previous 15 days of merchant transactions known when this payment was recorded. Later corrections appear in newer statements. Outstanding amounts are not cash in hand.";
  return model;
}
export function goodsReport(receipt: Receipt): ReportModel {
  const { business, merchant, entry } = receipt.snapshot,
    doc = entry.document!,
    ar = merchant.language === "ar",
    isReturn = entry.kind === "return";
  return {
    business,
    title: ar
      ? isReturn
        ? "بيان إرجاع البضاعة"
        : "فاتورة بضاعة"
      : isReturn
        ? "GOODS RETURN STATEMENT"
        : "INVOICE",
    reference: receipt.reference + " · " + doc.reference,
    date: doc.date,
    preparedBy: business.authorized,
    generatedAt: entry.created_at,
    filename: receipt.reference.replaceAll(" ", "-"),
    sections: [
      {
        title: merchant.name + " · " + merchant.phone,
        columns: ar
          ? ["البضاعة", "الكمية", "سعر الوحدة", "الإجمالي"]
          : ["Goods", "Quantity", "Unit price", "Total"],
        moneyColumns: [2, 3],
        rows: doc.lines.map((l) => [
          l.description,
          String(l.quantity / 1000),
          l.unit_price,
          l.total,
        ]),
        totals: [
          {
            label: ar ? "الرصيد السابق" : "Previous amount due",
            value: entry.previous,
          },
          {
            label: ar
              ? isReturn
                ? "قيمة المرتجعات"
                : "قيمة البضاعة"
              : isReturn
                ? "Goods returned"
                : "Goods supplied",
            value: entry.amount,
          },
          {
            label: ar ? "المبلغ المستحق الآن" : "Money still due",
            value: entry.balance,
          },
        ],
        note: entry.note,
      },
      {
        title: ar ? "ملاحظة" : "Note",
        columns: [ar ? "التفاصيل" : "Details"],
        moneyColumns: [],
        rows: [
          [
            isReturn
              ? ar
                ? "هذا إرجاع بضاعة وليس دفعة نقدية."
                : "Goods returned reduce the amount due. This is not a cash payment."
              : ar
                ? "سجل أعمال. لم يتم التحقق منه كفاتورة ضريبية."
                : "Business invoice record. This document has not been validated as a tax invoice.",
          ],
        ],
      },
    ],
  };
}
let fontPromise: Promise<string> | undefined;
async function font() {
  return (fontPromise ??= (async () => {
    const response = await fetch("/fonts/Amiri-Regular.ttf");
    if (!response.ok)
      throw Error("The PDF font is unavailable. Reconnect and retry.");
    let s = "";
    for (const b of new Uint8Array(await response.arrayBuffer()))
      s += String.fromCharCode(b);
    return btoa(s);
  })());
}
const arabic = (s: string) => /[\u0600-\u06ff]/.test(s);
export async function reportPdf(model: ReportModel): Promise<File> {
  const [{ jsPDF }, amiri] = await Promise.all([import("jspdf"), font()]);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.addFileToVFS("Amiri.ttf", amiri);
  doc.addFont("Amiri.ttf", "Amiri", "normal");
  doc.setFont("Amiri");
  doc.setCreationDate(new Date(model.generatedAt));
  doc.setProperties({
    title: model.title,
    author: model.business.name,
    subject: model.reference,
  });
  let y = 0;
  const text = (
    value: string,
    x: number,
    top: number,
    size = 11,
    width?: number,
  ) => {
    doc.setFontSize(size);
    const rtl = arabic(value);
    doc.setR2L(false);
    doc.text(
      width ? doc.splitTextToSize(value, width) : value,
      rtl && width ? x + width : x,
      top,
      { align: rtl && width ? "right" : "left" },
    );
  };
  const header = (first: boolean) => {
    doc.setFillColor("#4E6C86");
    doc.rect(0, 0, 210, 5, "F");
    doc.setTextColor("#1c2d3b");
    text(model.business.name, 20, 20, 20, 135);
    if (model.business.logo)
      doc.addImage(
        model.business.logo,
        model.business.logo.startsWith("data:image/png") ? "PNG" : "JPEG",
        168,
        12,
        22,
        22,
      );
    if (first) {
      let top = 31;
      for (const s of [
        model.business.address,
        [model.business.city, "Saudi Arabia"].filter(Boolean).join(", "),
        [model.business.phone, model.business.email]
          .filter(Boolean)
          .join(" · "),
        model.business.vat ? "VAT registration: " + model.business.vat : "",
      ]) {
        if (s) {
          text(s, 20, top, 10, 140);
          top += 6;
        }
      }
      text(model.title, 20, Math.max(60, top + 6), 16, 170);
      y = Math.max(72, top + 18);
      text("Report date: " + model.date, 20, y, 10, 170);
      text("Reference: " + model.reference, 20, y + 6, 10, 170);
      text(
        "Prepared by: " +
          model.preparedBy +
          " · Generated: " +
          dateTime(model.generatedAt),
        20,
        y + 12,
        10,
        170,
      );
      y += 23;
    } else {
      text(model.title + " · " + model.reference, 20, 30, 10, 170);
      y = 41;
    }
  };
  const newPage = () => {
    doc.addPage();
    header(false);
  };
  header(true);
  for (const section of model.sections) {
    if (y > 240) newPage();
    doc.setTextColor("#4E6C86");
    text(section.title, 20, y, 13, 170);
    y += 8;
    const weights = section.columns.map((_, i) =>
        section.moneyColumns.includes(i) ? 2.8 : i === 1 ? 4.5 : 3,
      ),
      sum = weights.reduce((a, b) => a + b, 0),
      widths = weights.map((w) => (170 * w) / sum);
    const tableHeader = () => {
      doc.setFillColor("#EAF1F6");
      doc.setTextColor("#1c2d3b");
      doc.setFontSize(10);
      const height =
        Math.max(
          ...section.columns.map(
            (c, i) => doc.splitTextToSize(c, widths[i] - 4).length,
          ),
        ) *
          4.5 +
        5;
      doc.rect(20, y, 170, height, "F");
      let x = 20;
      section.columns.forEach((c, i) => {
        text(c, x + 2, y + 5, 10, widths[i] - 4);
        x += widths[i];
      });
      y += height;
    };
    tableHeader();
    const rows = section.rows.length
      ? section.rows
      : [
          [
            "No records for this selection.",
            ...section.columns.slice(1).map(() => ""),
          ],
        ];
    rows.forEach((row, rowIndex) => {
      const rowFont = section.columns.length >= 6 ? 9 : 10;
      doc.setFontSize(rowFont);
      const cells = row.map(
        (c, i) =>
          doc.splitTextToSize(
            typeof c === "number" && section.moneyColumns.includes(i)
              ? money(c)
              : String(c),
            widths[i] - 4,
          ) as string[],
      );
      const lines = Math.max(...cells.map((c) => c.length));
      let offset = 0;
      while (offset < lines) {
        if (y > 260) {
          newPage();
          tableHeader();
        }
        const take = Math.min(
          lines - offset,
          Math.max(1, Math.floor((272 - y - 5) / 4.5)),
        );
        const height = take * 4.5 + 4;
        doc.setFillColor(rowIndex % 2 ? "#FFFFFF" : "#F4F6F8");
        doc.rect(20, y, 170, height, "F");
        doc.setTextColor("#1c2d3b");
        let x = 20;
        cells.forEach((cell, i) => {
          const shown = cell.slice(offset, offset + take);
          if (shown.length) {
            const rtl = arabic(shown.join(" "));
            doc.text(shown, rtl ? x + widths[i] - 2 : x + 2, y + 5, {
              align: rtl ? "right" : "left",
            });
          }
          x += widths[i];
        });
        y += height;
        offset += take;
      }
    });
    for (const total of section.totals || []) {
      if (y > 263) newPage();
      doc.setFillColor("#EAF1F6");
      doc.rect(20, y, 170, 9, "F");
      text(total.label, 23, y + 6, 11, 122);
      doc.setFontSize(11);
      doc.text(money(total.value), 187, y + 6, { align: "right" });
      y += 10;
    }
    if (section.note) {
      doc.setFontSize(10);
      const noteLines = doc.splitTextToSize(section.note, 170) as string[];
      for (const line of noteLines) {
        if (y > 267) newPage();
        text(line, 20, y + 5, 10, 170);
        y += 5;
      }
      y += 3;
    }
    y += 9;
  }
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setTextColor("#687684");
    doc.setFontSize(8);
    doc.text(model.business.name + " · " + i + " / " + pages, 105, 289, {
      align: "center",
    });
  }
  return new File([doc.output("arraybuffer")], model.filename + ".pdf", {
    type: "application/pdf",
  });
}
export async function reportExcel(model: ReportModel): Promise<File> {
  const ExcelJS = (await import("exceljs")).default,
    wb = new ExcelJS.Workbook();
  wb.creator = model.business.name;
  wb.created = new Date(model.generatedAt);
  const ws = wb.addWorksheet("Report");
  ws.addRow([model.business.name]);
  ws.addRow([model.title]);
  ws.addRow(["Report date", model.date]);
  ws.addRow(["Reference", model.reference]);
  ws.addRow(["Prepared by", model.preparedBy]);
  ws.addRow(["Generated", dateTime(model.generatedAt)]);
  ws.addRow([]);
  for (const section of model.sections) {
    const title = ws.addRow([section.title]);
    title.font = { bold: true, size: 13, color: { argb: "FF4E6C86" } };
    const head = ws.addRow(section.columns);
    head.font = { bold: true };
    head.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFEAF1F6" },
    };
    for (const data of section.rows) {
      const row = ws.addRow(
        data.map((v, i) =>
          typeof v === "number" && section.moneyColumns.includes(i)
            ? v / 100
            : v,
        ),
      );
      section.moneyColumns.forEach(
        (i) =>
          (row.getCell(i + 1).numFmt = '"SAR " #,##0.00;[Red]-"SAR " #,##0.00'),
      );
    }
    for (const total of section.totals || []) {
      const row = ws.addRow([total.label, total.value / 100]);
      row.font = { bold: true };
      row.getCell(2).numFmt = '"SAR " #,##0.00;[Red]-"SAR " #,##0.00';
    }
    if (section.note) ws.addRow([section.note]);
    ws.addRow([]);
  }
  ws.columns.forEach((c, i) => {
    c.width = i === 0 ? 29 : i === 1 ? 46 : 25;
  });
  ws.eachRow((row) => {
    row.alignment = { vertical: "top", wrapText: true };
  });
  ws.getRow(1).font = { bold: true, size: 20 };
  ws.getRow(2).font = { bold: true, size: 16 };
  ws.views = [{ state: "frozen", ySplit: 7 }];
  ws.pageSetup = {
    paperSize: 9,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
  };
  return new File(
    [(await wb.xlsx.writeBuffer()) as ArrayBuffer],
    model.filename + ".xlsx",
    {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  );
}
export async function exportReport(model: ReportModel, format: "pdf" | "xlsx") {
  const { buildReportFile } = await import("./report-file");
  const { saveFile } = await import("./documents");
  const file = await buildReportFile(model, format);
  await saveFile(file);
  return file;
}
