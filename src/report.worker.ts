import { reportPdf, reportExcel, type ReportModel } from "./exports";
self.onmessage = async (
  event: MessageEvent<{ model: ReportModel; format: "pdf" | "xlsx" }>,
) => {
  try {
    const { model, format } = event.data;
    const file = await (format === "pdf"
      ? reportPdf(model)
      : reportExcel(model));
    const data = await file.arrayBuffer();
    self.postMessage(
      { data, name: file.name, type: file.type },
      { transfer: [data] },
    );
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error ? error.message : "Unable to create the report.",
    });
  }
};
