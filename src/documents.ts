import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { native, SecureVault } from "./native";
import { desktop } from "./desktop";
import { supabase } from "./client";
import { readLocal, writeLocal } from "./storage";
import {
  dateTime,
  type Receipt,
  type Entry,
  type Merchant,
  type State,
} from "./domain";
let font: string | undefined;
const base64 = (data: ArrayBuffer) => {
  let s = "";
  for (const n of new Uint8Array(data)) s += String.fromCharCode(n);
  return btoa(s);
};
const bytes = (value: string) =>
  Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
export async function downloadBlob(blob: Blob, name: string) {
  if (native || desktop) {
    await saveFile(new File([blob], name, { type: blob.type }));
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export async function receiptFile(
  receipt: Receipt,
  owner: string,
): Promise<File> {
  const name = receipt.reference.replaceAll(" ", "-") + ".pdf";
  let saved = await readLocal<string>("pdf:" + receipt.id);
  const path = owner + "/" + receipt.id + ".pdf";
  if (!saved && navigator.onLine) {
    const { data } = await supabase.storage.from("receipts").download(path);
    if (data) saved = base64(await data.arrayBuffer());
  }
  if (
    !saved &&
    receipt.snapshot.entry.document &&
    ["invoice", "return"].includes(receipt.snapshot.entry.kind)
  ) {
    const { goodsReport } = await import("./exports");
    const { buildReportFile } = await import("./report-file");
    saved = base64(
      await (await buildReportFile(goodsReport(receipt), "pdf")).arrayBuffer(),
    );
  }
  if (!saved) {
    if (!font) {
      const response = await fetch("/fonts/Amiri-Regular.ttf");
      if (!response.ok)
        throw Error(
          "The receipt font is unavailable. Reconnect once and retry.",
        );
      font = base64(await response.arrayBuffer());
    }
    const { jsPDF } = await import("jspdf");
    const { business: b, merchant: m, entry: e } = receipt.snapshot;
    const ar = m.language === "ar";
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    doc.addFileToVFS("Amiri.ttf", font);
    doc.addFont("Amiri.ttf", "Amiri", "normal");
    doc.setFont("Amiri");
    doc.setCreationDate(new Date(e.created_at));
    doc.setProperties({
      title: receipt.reference,
      author: b.name,
      subject:
        e.kind === "payment"
          ? "Payment receipt"
          : "Balance adjustment statement",
    });
    doc.setFillColor("#4E6C86");
    doc.rect(0, 0, 210, 7, "F");
    doc.setTextColor("#1c2d3b");
    doc.setFontSize(22);
    doc.text(b.name, 20, 29);
    if (!b.logo) {
      doc.setFillColor("#4E6C86");
      doc.roundedRect(166, 16, 24, 24, 5, 5, "F");
      doc.setTextColor("#FFFFFF");
      doc.setFontSize(28);
      doc.text("G", 178, 33, { align: "center" });
      doc.setTextColor("#1c2d3b");
    }
    if (b.logo) {
      try {
        doc.addImage(
          b.logo,
          b.logo.startsWith("data:image/png") ? "PNG" : "JPEG",
          166,
          16,
          24,
          24,
          undefined,
          "FAST",
        );
      } catch {
        throw Error(
          "The saved logo cannot be added to this PDF. Correct the logo and retry.",
        );
      }
    }
    doc.setFontSize(11);
    doc.setTextColor("#687684");
    [
      b.address,
      [b.city, "Saudi Arabia"].filter(Boolean).join(", "),
      [b.phone, b.email].filter(Boolean).join(" · "),
      b.vat ? "VAT registration: " + b.vat : "",
    ]
      .filter(Boolean)
      .forEach((text, i) => doc.text(text, 20, 40 + i * 6));
    const label = (text: string, y: number, size = 12) => {
      doc.setFontSize(size);
      doc.setR2L(false);
      doc.text(text, ar ? 190 : 20, y, {
        align: ar ? "right" : "left",
      });
      doc.setR2L(false);
    };
    doc.setTextColor("#4E6C86");
    label(
      ar
        ? e.kind === "payment"
          ? "إيصال دفع"
          : "كشف تعديل الرصيد"
        : e.kind === "payment"
          ? "PAYMENT RECEIPT"
          : "BALANCE ADJUSTMENT STATEMENT",
      78,
      18,
    );
    doc.setTextColor("#687684");
    doc.setFontSize(11);
    doc.text(receipt.reference, 20, 90);
    doc.text(dateTime(e.occurred_at), 190, 90, { align: "right" });
    doc.setTextColor("#1c2d3b");
    label(m.name, 108, 16);
    doc.setTextColor("#687684");
    label([m.phone, m.city].filter(Boolean).join("  "), 117);
    const rows = [
      { en: "Previous outstanding", ar: "الرصيد السابق", value: e.previous },
      {
        en:
          e.kind === "payment"
            ? "Payment received"
            : e.kind === "reversal"
              ? "Reversal"
              : "Balance adjustment",
        ar:
          e.kind === "payment"
            ? "المبلغ المستلم"
            : e.kind === "reversal"
              ? "عكس القيد"
              : "تعديل الرصيد",
        value: e.kind === "payment" ? e.amount : e.delta,
      },
      { en: "New outstanding", ar: "الرصيد الجديد", value: e.balance },
    ];
    rows.forEach((r, i) => {
      const y = 140 + i * 19;
      doc.setFillColor(i === 2 ? "#EAF1F6" : "#F4F6F8");
      doc.roundedRect(20, y - 10, 170, 17, 2, 2, "F");
      doc.setTextColor("#1c2d3b");
      doc.setFontSize(13);
      if (ar) {
        doc.setR2L(false);
        doc.text(r.ar, 184, y, { align: "right" });
        doc.setR2L(false);
        doc.text("SAR " + (r.value / 100).toFixed(2), 26, y);
      } else {
        doc.text(r.en, 26, y);
        doc.text("SAR " + (r.value / 100).toFixed(2), 184, y, {
          align: "right",
        });
      }
    });
    doc.setTextColor("#687684");
    if (e.note) {
      doc.setFontSize(11);
      doc.setR2L(false);
      doc.text(doc.splitTextToSize(e.note, 165), ar ? 190 : 20, 205, {
        align: ar ? "right" : "left",
      });
      doc.setR2L(false);
    }
    doc.setDrawColor("#dce5ec");
    doc.line(20, 251, 190, 251);
    doc.setTextColor("#687684");
    label(b.authorized, 261);
    label(b.footer, 270, 10);
    doc.setFontSize(8);
    doc.text("Collection record · Not a sales tax invoice", 105, 286, {
      align: "center",
    });
    saved = base64(doc.output("arraybuffer"));
  }
  await writeLocal("pdf:" + receipt.id, saved);
  const blob = new Blob([bytes(saved)], { type: "application/pdf" });
  if (navigator.onLine) {
    const { error } = await supabase.storage
      .from("receipts")
      .upload(path, blob, { contentType: "application/pdf", upsert: false });
    if (error && error.message.toLowerCase().includes("already exists")) {
      const { data } = await supabase.storage.from("receipts").download(path);
      if (data) {
        saved = base64(await data.arrayBuffer());
        await writeLocal("pdf:" + receipt.id, saved);
        return new File([data], name, { type: "application/pdf" });
      }
    }
  }
  return new File([blob], name, { type: "application/pdf" });
}
export async function paymentReceiptFile(
  receipt: Receipt,
  state: State,
): Promise<File> {
  const key = "pdf:history15:" + receipt.id,
    path = state.businessOwner + "/history15/" + receipt.id + ".pdf";
  let saved = await readLocal<string>(key);
  if (!saved && navigator.onLine) {
    const { data } = await supabase.storage.from("receipts").download(path);
    if (data) saved = base64(await data.arrayBuffer());
  }
  if (!saved) {
    const { paymentReport } = await import("./exports");
    const { buildReportFile } = await import("./report-file");
    saved = base64(
      await (
        await buildReportFile(paymentReport(receipt, state), "pdf")
      ).arrayBuffer(),
    );
    await writeLocal(key, saved);
  }
  const file = new File(
    [bytes(saved)],
    receipt.reference.replaceAll(" ", "-") + "-with-15-day-history.pdf",
    { type: "application/pdf" },
  );
  if (navigator.onLine)
    await supabase.storage
      .from("receipts")
      .upload(path, file, { contentType: "application/pdf", upsert: false });
  return file;
}
export async function saveFile(file: File) {
  if (desktop) {
    if (
      !(await desktop.saveFile({
        name: file.name,
        base64: base64(await file.arrayBuffer()),
      }))
    )
      throw Error("Save cancelled.");
    return;
  }
  if (native) {
    await SecureVault.download({
      name: file.name,
      base64: base64(await file.arrayBuffer()),
      mime: file.type,
    });
  } else await downloadBlob(file, file.name);
}
export async function shareFile(file: File) {
  if (desktop) {
    await saveFile(file);
    return false;
  }
  if (native) {
    const result = await Filesystem.writeFile({
      path: file.name,
      data: base64(await file.arrayBuffer()),
      directory: Directory.Cache,
    });
    await Share.share({
      title: "Mcube Exporters · " + file.name,
      text: "Business document from Mcube Exporters",
      files: [result.uri],
      dialogTitle: "Share PDF via WhatsApp",
    });
    return true;
  }
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: "Mcube Exporters" });
    return true;
  }
  await downloadBlob(file, file.name);
  return false;
}
export async function exportWorkbook(
  state: State,
  entries: Entry[],
  merchant?: Merchant,
) {
  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = state.business.name;
  const ws = wb.addWorksheet("Collections", {
    views: [{ state: "frozen", ySplit: 5 }],
  });
  ws.mergeCells("A1:L1");
  ws.getCell("A1").value = state.business.name;
  ws.getCell("A1").font = { size: 20, bold: true, color: { argb: "FF4E6C86" } };
  ws.mergeCells("A2:L2");
  ws.getCell("A2").value = merchant
    ? merchant.name + " · Full statement"
    : "Collection report · Asia/Riyadh · SAR";
  ws.mergeCells("A3:L3");
  ws.getCell("A3").value =
    "Includes " +
    entries.filter((e) => e.pending).length +
    " pending local records. Confirm cloud sync before relying on totals.";
  ws.columns = [
    { width: 25 },
    { width: 30 },
    { width: 20 },
    { width: 18 },
    { width: 22 },
    { width: 20 },
    { width: 20 },
    { width: 20 },
    { width: 18 },
    { width: 23 },
    { width: 40 },
    { width: 22 },
  ];
  ws.getRow(5).values = [
    "Date/time (Riyadh)",
    "Merchant",
    "Reference",
    "Type",
    "Previous outstanding",
    "Cash received",
    "Signed adjustment",
    "New outstanding",
    "Payment method",
    "Share status",
    "Note",
    "Sync state",
  ];
  ws.getRow(5).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(5).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF4E6C86" },
  };
  entries.forEach((e) => {
    const m = state.merchants.find((m) => m.id === e.merchant_id);
    const cash =
      e.kind === "payment"
        ? e.amount
        : e.kind === "reversal" && e.method !== "adjustment"
          ? -e.amount
          : 0;
    const adjustment =
      e.kind === "adjustment" ||
      (e.kind === "reversal" && e.method === "adjustment")
        ? e.delta
        : 0;
    const row = ws.addRow([
      dateTime(e.occurred_at),
      m?.name || "",
      e.reference,
      e.kind,
      e.previous / 100,
      cash / 100,
      adjustment / 100,
      e.balance / 100,
      e.method,
      state.receipts.find((r) => r.transaction_id === e.id)?.status || "",
      e.note,
      e.pending ? "Pending" : "Synced",
    ]);
    for (const c of [5, 6, 7, 8])
      row.getCell(c).numFmt = "#,##0.00;[Red]-#,##0.00";
  });
  const total = ws.addRow([
    "TOTAL",
    "",
    "",
    "",
    null,
    entries.reduce(
      (n, e) =>
        n +
        (e.kind === "payment"
          ? e.amount
          : e.kind === "reversal" && e.method !== "adjustment"
            ? -e.amount
            : 0),
      0,
    ) / 100,
    entries
      .filter(
        (e) =>
          e.kind === "adjustment" ||
          (e.kind === "reversal" && e.method === "adjustment"),
      )
      .reduce((n, e) => n + e.delta, 0) / 100,
  ]);
  total.font = { bold: true };
  if (merchant)
    ws.addRow([
      "Opening / closing",
      merchant.opening / 100,
      merchant.balance / 100,
    ]);
  ws.autoFilter = { from: "A5", to: "L" + Math.max(5, 4 + entries.length) };
  const data = await wb.xlsx.writeBuffer();
  await saveFile(
    new File(
      [new Uint8Array(data)],
      merchant ? merchant.prefix + "-statement.xlsx" : "Mcube-collections.xlsx",
      {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    ),
  );
}
