import type { ReportModel } from "./exports";
// Generate large documents away from the interface so scrolling and input stay responsive.
export async function buildReportFile(
  model: ReportModel,
  format: "pdf" | "xlsx",
): Promise<File> {
  if (typeof Worker === "undefined") {
    const { reportPdf, reportExcel } = await import("./exports");
    return format === "pdf" ? reportPdf(model) : reportExcel(model);
  }
  const worker = new Worker(new URL("./report.worker.ts", import.meta.url), {
    type: "module",
  });
  try {
    return await new Promise<File>((resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(
            Error("Report creation took too long. Try a shorter date range."),
          ),
        60000,
      );
      worker.onmessage = (
        event: MessageEvent<{
          data?: ArrayBuffer;
          name?: string;
          type?: string;
          error?: string;
        }>,
      ) => {
        clearTimeout(timer);
        const result = event.data;
        if (result.error || !result.data)
          reject(Error(result.error || "Unable to create the report."));
        else
          resolve(new File([result.data], result.name!, { type: result.type }));
      };
      worker.onerror = () => {
        clearTimeout(timer);
        reject(Error("Unable to create the report. Reopen the app and retry."));
      };
      worker.postMessage({ model, format });
    });
  } finally {
    worker.terminate();
  }
}
