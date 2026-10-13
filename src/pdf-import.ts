import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
export type InvoiceExtraction = {
  merchant: string;
  reference: string;
  date: string;
  total: string;
  text: string;
  items: {
    description: string;
    quantity: string;
    price: string;
    total: string;
  }[];
  notice: string;
};
export async function readInvoicePdf(file: File): Promise<InvoiceExtraction> {
  if (file.type !== "application/pdf" || file.size > 10485760)
    throw Error("Choose a PDF smaller than 10 MB.");
  const pdf = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdf.GlobalWorkerOptions.workerSrc = workerUrl;
  const task = pdf.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    enableXfa: false,
    useSystemFonts: false,
  });
  const timer = setTimeout(() => void task.destroy(), 25000);
  try {
    const doc = await task.promise;
    const rows: string[] = [];
    for (let i = 1; i <= Math.min(doc.numPages, 40); i++) {
      const content = await (await doc.getPage(i)).getTextContent();
      let row = "",
        lastY: number | undefined;
      for (const item of content.items) {
        if (!("str" in item)) continue;
        const y = item.transform[5];
        if (lastY !== undefined && Math.abs(y - lastY) > 3 && row.trim()) {
          rows.push(row.trim());
          row = "";
        }
        row += (row ? "  " : "") + item.str;
        lastY = y;
        if (item.hasEOL && row.trim()) {
          rows.push(row.trim());
          row = "";
          lastY = undefined;
        }
      }
      if (row.trim()) rows.push(row.trim());
    }
    const text = rows.join("\n");
    const reference =
      text.match(
        /(?:invoice|inv|فاتورة)\s*(?:no\.?|number|#|رقم)?\s*[:#-]?\s*([\w/-]{2,60})/i,
      )?.[1] || "";
    const rawDate =
      text.match(
        /(?:date|تاريخ)\s*[: -]*([0-9]{4}[-/.][0-9]{1,2}[-/.][0-9]{1,2}|[0-9]{1,2}[-/.][0-9]{1,2}[-/.][0-9]{4})/i,
      )?.[1] || "";
    let date = "";
    if (/^\d{4}/.test(rawDate)) {
      const [y, m, d] = rawDate.split(/[-/.]/);
      date = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    } else if (rawDate) {
      const [d, m, y] = rawDate.split(/[-/.]/);
      date = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
    const totals = rows.filter((r) =>
      /grand total|amount due|invoice total|الإجمالي/i.test(r),
    );
    const total =
      totals
        .at(-1)
        ?.match(/([\d,]+\.\d{2})\s*(?:SAR|ر\.س)?\s*$/)?.[1]
        ?.replaceAll(",", "") || "";
    const merchant =
      text
        .match(
          /(?:bill to|customer|merchant|sold to|العميل)\s*[: -]+([^\n]+)/i,
        )?.[1]
        ?.trim() || "";
    const items: InvoiceExtraction["items"] = [];
    for (const r of rows) {
      const match = r.match(
        /^(.+?)\s{2,}(\d+(?:\.\d{1,3})?)\s{2,}([\d,]+\.\d{2})\s{2,}([\d,]+\.\d{2})\s*$/,
      );
      if (match && !/total|tax|vat|subtotal|invoice/i.test(match[1]))
        items.push({
          description: match[1],
          quantity: match[2],
          price: match[3].replaceAll(",", ""),
          total: match[4].replaceAll(",", ""),
        });
    }
    return {
      merchant,
      reference,
      date,
      total,
      text: text.slice(0, 80000),
      items,
      notice: text.trim()
        ? "Some details were read from the PDF. Check every item, quantity, price and total before saving. Ambiguous dates may need correction."
        : "This PDF has no readable text. Enter the details below. The original PDF will still be saved.",
    };
  } finally {
    clearTimeout(timer);
    await task.destroy();
  }
}
