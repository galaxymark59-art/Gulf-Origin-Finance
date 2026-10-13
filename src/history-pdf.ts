import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { guessMapping } from "./history-import";
export async function readPdfTable(file: File): Promise<string[][]> {
  const pdf = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdf.GlobalWorkerOptions.workerSrc = workerUrl;
  const task = pdf.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    enableXfa: false,
    useSystemFonts: false,
  });
  const timer = setTimeout(() => void task.destroy(), 60000);
  try {
    const doc = await task.promise;
    if (doc.numPages > 250)
      throw Error("Split this PDF into files of 250 pages or less.");
    let header: { text: string; x: number }[] | undefined;
    const rows: string[][] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const content = await (await doc.getPage(n)).getTextContent(),
        lines: { y: number; cells: { text: string; x: number }[] }[] = [];
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        const y = item.transform[5];
        let line = lines.find((l) => Math.abs(l.y - y) < 3);
        if (!line) {
          line = { y, cells: [] };
          lines.push(line);
        }
        line.cells.push({ text: item.str.trim(), x: item.transform[4] });
      }
      for (const line of lines.sort((a, b) => b.y - a.y)) {
        line.cells.sort((a, b) => a.x - b.x);
        const texts = line.cells.map((c) => c.text),
          mapping = guessMapping(texts);
        const recognized = Object.values(mapping).filter((v) => v >= 0).length;
        if (recognized >= 2 && (mapping.date >= 0 || mapping.name >= 0)) {
          header = line.cells;
          if (!rows.length) rows.push(texts);
          continue;
        }
        if (!header) continue;
        const row = header.map(() => "");
        for (const cell of line.cells) {
          let col = 0;
          for (let i = 1; i < header.length; i++)
            if (cell.x >= header[i].x - 3) col = i;
          row[col] += (row[col] ? " " : "") + cell.text;
        }
        if (row.some((v) => v.trim())) rows.push(row);
      }
    }
    if (rows.length < 2)
      throw Error(
        "No readable table was found. Scanned PDFs need a text or Excel export, or manual entry. No records were saved.",
      );
    return rows;
  } finally {
    clearTimeout(timer);
    await task.destroy();
  }
}
