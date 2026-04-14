export async function runExcelAction(action: any) {
    switch (action.type) {
        case "write_cells": return applyWriteAction(action);
        case "format_cells": return applyFormatAction(action);
        case "create_chart": return applyChartAction(action);
        case "add_sheet": return applyAddSheetAction(action);
        default: console.warn("Action inconnue:", action.type);
    }
}


function padValuesToRectangle(values: any[][]): any[][] {
    const numRows = values.length;
    const numCols = values.reduce(
      (max, row) => Math.max(max, Array.isArray(row) ? row.length : 0),
      0,
    );
    if (numRows === 0 || numCols === 0) return [];
  
    return values.map((row) => {
      const r = Array.isArray(row) ? [...row] : [];
      while (r.length < numCols) r.push("");
      return r.slice(0, numCols);
    });
  }
  
  export async function applyWriteAction(action: any) {
    await Excel.run(async (context) => {
      const sheet = context.workbook.worksheets.getItem(action.sheet);
      const anchor = sheet.getRange(action.range);
      const raw = action.values as any[][];
  
      if (!raw?.length) {
        await context.sync();
        return;
      }
  
      const padded = padValuesToRectangle(raw);
      if (padded.length === 0) {
        await context.sync();
        return;
      }
  
      const numRows = padded.length;
      const numCols = padded[0].length;
  
      const topLeft = anchor.getCell(0, 0);
      const target = topLeft.getResizedRange(numRows - 1, numCols - 1);
  
      target.values = padded;
  
      await context.sync();
    });
  }
  
  export async function applyClearAction(action: any) {
    await Excel.run(async (context) => {
      const sheet = context.workbook.worksheets.getItem(action.sheet);
      const range = sheet.getRange(action.range);
  
      range.clear(Excel.ClearApplyTo.contents);
  
      await context.sync();
    });
  }
  
  export async function applyFormatAction(action: any) {
    await Excel.run(async (context) => {
      const sheet = context.workbook.worksheets.getItem(action.sheet);
      const range = sheet.getRange(action.range);
      const format = action.format;
  
      if (!format) return;
  
      // Chargement de la propriété format pour modification
      range.load("format");
  
      // Application des styles
      if (format.bold !== undefined) range.format.font.bold = format.bold;
      if (format.italic !== undefined) range.format.font.italic = format.italic;
      if (format.font_size) range.format.font.size = format.font_size;
      if (format.font_color) range.format.font.color = format.font_color;
      if (format.bg_color) range.format.fill.color = format.bg_color;
      
      if (format.horizontal_alignment) {
        range.format.horizontalAlignment = format.horizontal_alignment; 
        // Note: Excel attend "Center", "Left", "Right"
      }
  
      await context.sync();
    });
  }
  
  export async function applyChartAction(action: any) {
    await Excel.run(async (context) => {
      const sheet = context.workbook.worksheets.getItem(action.sheet);
      const dataRange = sheet.getRange(action.range);
  
      // --- LE MAPPING EST ICI ---
      const typeMap: { [key: string]: Excel.ChartType } = {
        "Pie": Excel.ChartType.pie,
        "Line": Excel.ChartType.line,
        "Column": Excel.ChartType.columnClustered,
        "Bar": Excel.ChartType.barClustered
      };
  
      // On récupère le type, avec un fallback sur "ColumnClustered" si Gemini se trompe
      const chartType = typeMap[action.chart_type] || Excel.ChartType.columnClustered;
  
      // On charge les propriétés de position du range
      dataRange.load(["left", "top", "width"]);
  
      // Création du graphique avec le type mappé
      const chart = sheet.charts.add(
        chartType, 
        dataRange, 
        Excel.ChartSeriesBy.auto
      );
  
      chart.title.text = action.title || "AI Analysis";
  
      // Premier sync pour valider la création et récupérer les coordonnées du range
      await context.sync();
  
      // Positionnement précis
      chart.left = dataRange.left + dataRange.width + 20;
      chart.top = dataRange.top;
  
      await context.sync();
    });
  }
  
  export async function applyAddSheetAction(action: any) {
    await Excel.run(async (context) => {
      // On ajoute une nouvelle feuille
      const sheets = context.workbook.worksheets;
      const newSheet = sheets.add(action.sheet);
      
      // On peut la rendre active immédiatement si on veut
      newSheet.activate();
  
      await context.sync();
    });
  }