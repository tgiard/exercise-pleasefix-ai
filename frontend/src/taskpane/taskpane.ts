/* global console, document, Excel, Office */
import { 
  runExcelAction
} from "./excel_actions";

import { 
  setStatus, 
  scrollOutputToBottom, 
  addMessage
} from "./ui_utils";

let conversationHistory: { role: string; content: string }[] = [];

Office.onReady((info) => {
  if (info.host === Office.HostType.Excel) {
    const sideloadMsg = document.getElementById("sideload-msg");
    const appBody = document.getElementById("app-body");

    if (sideloadMsg) sideloadMsg.style.display = "none";
    if (appBody) appBody.style.display = "flex";

    scrollOutputToBottom();

    const button = document.getElementById("analyzeBtn");
    if (button) {
      button.onclick = analyzeSheet;
    }

    const userInput = document.getElementById("user-input") as HTMLInputElement | null;
    if (userInput) {
      userInput.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        void analyzeSheet();
      });
    }

    const pdfInput = document.getElementById("pdf-input") as HTMLInputElement | null;
    const pdfFileLabel = document.getElementById("pdf-file-label");
    if (pdfInput && pdfFileLabel) {
      const defaultPdfLabel = "Choose PDF";
      pdfInput.addEventListener("change", () => {
        const file = pdfInput.files?.[0];
        pdfFileLabel.textContent = file?.name ?? defaultPdfLabel;
      });
    }
  }
});

async function analyzeSheet() {
  const inputEl = document.getElementById("user-input") as HTMLInputElement;
  const analyzeBtn = document.getElementById("analyzeBtn") as HTMLButtonElement | null;

  try {
    if (analyzeBtn) analyzeBtn.disabled = true;

    const message = inputEl?.value ?? "";
    if (inputEl) {
      inputEl.value = "";
      inputEl.placeholder = "";
    }

    setStatus("Reading the active sheet…", "info");

    let sheetName = "";
    let values: any[][] = [];
    let rowCount = 0;
    let columnCount = 0;

    await Excel.run(async (context) => {
      const sheet = context.workbook.worksheets.getActiveWorksheet();
      const usedRange = sheet.getUsedRangeOrNullObject();

      sheet.load("name");
      usedRange.load(["values", "address", "rowCount", "columnCount", "isNullObject"]);

      await context.sync();

      if (usedRange.isNullObject) {
        throw new Error("The active sheet is empty.");
      }

      sheetName = sheet.name;
      values = usedRange.values;
      rowCount = usedRange.rowCount;
      columnCount = usedRange.columnCount;
    });

    addMessage(message, "user");
    conversationHistory.push({
      role: "user",
      content: message,
    });

    setStatus("The assistant is thinking...", "info");

    const excelContext = {
      sheet_name: sheetName,
      used_range: values,
      row_count: rowCount,
      column_count: columnCount,
    };

    const formData = new FormData();
    formData.append("message", message);
    formData.append("conversation_history", JSON.stringify(conversationHistory));
    formData.append("excel_context", JSON.stringify(excelContext));

    const pdfInput = document.getElementById("pdf-input") as HTMLInputElement | null;
    const pdfFile = pdfInput?.files?.[0];
    if (pdfFile) {
      formData.append("documents", pdfFile, pdfFile.name);
    }

    const response = await fetch("https://localhost:8000/chat", {
      method: "POST",
      body: formData,
    });

    const rawText = await response.text();

    console.log("STATUS:", response.status);
    console.log("RAW RESPONSE:", rawText);

    setStatus(
      `Response received: HTTP ${response.status} ${response.statusText}.`,
      response.ok ? "info" : "error",
    );

    if (!response.ok) {
      const preview =
        rawText.length > 400 ? `${rawText.slice(0, 400)}…` : rawText;
      throw new Error(
        preview ? `Server error body:\n${preview}` : `HTTP ${response.status}`,
      );
    }

    let data: { answer?: string; actions?: any[] };
    try {
      data = JSON.parse(rawText) as { answer?: string; actions?: any[] };
    } catch {
      setStatus("Could not parse JSON from the server.", "error");
      throw new Error("Invalid JSON in response body.");
    }

    setStatus("Processing assistant reply…", "info");

    const actions = data.actions ?? [];

    if (actions.length > 0) {
      setStatus(`Applying ${actions.length} workbook change(s)…`, "info");
      for (let i = 0; i < actions.length; i++) {
        const action = actions[i];
        console.log("Applying action:", action);

        setStatus(
          `Applying change ${i + 1} of ${actions.length}: ${action.type ?? "unknown"}…`,
          "info",
        );

        await runExcelAction(action);

      }
    } else {
      setStatus("No workbook changes in this reply.", "info");
    }

    addMessage(data.answer ?? "", "assistant");
    conversationHistory.push({
      role: "assistant",
      content: data.answer ?? "",
    });

    const doneSummary =
      actions.length > 0
        ? `Done. Applied ${actions.length} workbook change(s).`
        : "Done. No workbook changes.";
    setStatus(`${doneSummary} You can send another question.`, "success");

    if (inputEl) {
      inputEl.placeholder = "Next question?";
    }
  } catch (error: any) {
    console.error("FULL ERROR:", error);
    const debug =
      error?.debugInfo != null
        ? `\n${JSON.stringify(error.debugInfo, null, 2)}`
        : "";
    setStatus(
      `Error: ${error?.message ?? "Unknown error"}${debug}`,
      "error",
    );
  } finally {
    if (analyzeBtn) analyzeBtn.disabled = false;
  }
}