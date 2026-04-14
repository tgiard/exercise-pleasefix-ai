/* global Excel */

/**
 * Fonction principale de dispatching des actions.
 * Elle reçoit le contexte Excel de la boucle parente.
 */
export async function runExcelAction(action: any, context: Excel.RequestContext) {
    switch (action.type) {
        case "write_cells": return applyWriteAction(action, context);
        case "format_cells": return applyFormatAction(action, context);
        case "create_chart": return applyChartAction(action, context);
        case "add_sheet": return applyAddSheetAction(action, context);
        case "clear_range": return applyClearAction(action, context);
        default: console.warn("Action inconnue:", action.type);
    }
}

/**
 * Fonctions utilitaires pour le formatage des données
 */
function padValuesToRectangle(values: any[][]): any[][] {
    const numRows = values.length;
    const numCols = values.reduce(
        (max, row) => Math.max(max, Array.isArray(row) ? row.length : 0),
        0
    );
    if (numRows === 0 || numCols === 0) return [];

    return values.map((row) => {
        const r = Array.isArray(row) ? [...row] : [];
        while (r.length < numCols) r.push("");
        return r.slice(0, numCols);
    });
}

/**
 * ACTIONS INDIVIDUELLES (Sans Excel.run interne)
 */

export async function applyWriteAction(action: any, context: Excel.RequestContext) {
    const sheet = context.workbook.worksheets.getItem(action.sheet);
    const anchor = sheet.getRange(action.range);
    const raw = action.values as any[][];

    if (!raw?.length) return;

    const padded = padValuesToRectangle(raw);
    if (padded.length === 0) return;

    const numRows = padded.length;
    const numCols = padded[0].length;

    const topLeft = anchor.getCell(0, 0);
    const target = topLeft.getResizedRange(numRows - 1, numCols - 1);

    target.values = padded;
}

export async function applyFormatAction(action: any, context: Excel.RequestContext) {
    const f = action?.format;
    if (!f) return;

    const sheets = context.workbook.worksheets;

    // Robust sheet resolution (ex: "Sheet1" vs "Feuil1")
    let sheet: Excel.Worksheet;
    if (action?.sheet) {
        const maybe = sheets.getItemOrNullObject(action.sheet);
        maybe.load("isNullObject");
        await context.sync();
        sheet = maybe.isNullObject ? sheets.getActiveWorksheet() : (maybe as unknown as Excel.Worksheet);
    } else {
        sheet = sheets.getActiveWorksheet();
    }

    const range = sheet.getRange(action.range);

    // bold can come as true/false or "True"/"False"
    if (f.bold !== undefined) {
        range.format.font.bold = String(f.bold).toLowerCase() === "true";
    }

    if (f.bg_color) {
        range.format.fill.pattern = Excel.FillPattern.solid;
        range.format.fill.color = String(f.bg_color).trim();
    }

    if (f.font_color) {
        range.format.font.color = String(f.font_color).trim();
    }
}

export async function applyClearAction(action: any, context: Excel.RequestContext) {
    const sheet = context.workbook.worksheets.getItem(action.sheet);
    const range = sheet.getRange(action.range);
    // Efface tout (contenu + formatage)
    range.clear(Excel.ClearApplyTo.all);
}

export async function applyChartAction(action: any, context: Excel.RequestContext) {
    const sheet = context.workbook.worksheets.getItem(action.sheet);
    const rawRange = String(action.range ?? "").trim();
    if (!rawRange) return;

    // Excel charts cannot be created from discontiguous ranges via getRange("A1:B2,C1:D2").
    // We support comma-separated ranges by staging a contiguous table on the right,
    // then building the chart from that staged table.
    const rangeAddresses = rawRange
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean);
    if (rangeAddresses.length === 0) return;

    const firstRange = sheet.getRange(rangeAddresses[0]);

    const typeMap: { [key: string]: Excel.ChartType } = {
        "Pie": Excel.ChartType.pie,
        "Line": Excel.ChartType.line,
        "Column": Excel.ChartType.columnClustered,
        "Bar": Excel.ChartType.barClustered
    };

    const chartType = typeMap[action.chart_type] || Excel.ChartType.columnClustered;

    // Load first range metadata for positioning + staging
    firstRange.load(["left", "top", "width", "rowIndex", "columnIndex", "columnCount", "values"]);

    let stagedSourceRange: Excel.Range = firstRange;

    if (rangeAddresses.length > 1) {
        // Load all additional ranges' values.
        const extraRanges = rangeAddresses.slice(1).map((addr) => sheet.getRange(addr));
        for (const r of extraRanges) {
            r.load(["values", "rowCount", "columnCount"]);
        }

        await context.sync();

        // Build a contiguous table: keep first range as-is, then append extra rows.
        const combined: any[][] = Array.isArray(firstRange.values) ? [...firstRange.values] : [];
        const headerRow = combined.length > 0 ? combined[0] : null;

        for (const r of extraRanges) {
            const vals = (r.values ?? []) as any[][];
            if (!Array.isArray(vals) || vals.length === 0) continue;

            // If the first row looks like the same header, drop it.
            let startIdx = 0;
            if (headerRow && Array.isArray(vals[0]) && vals[0].length === headerRow.length) {
                const sameHeader = vals[0].every((v, i) => v === (headerRow as any[])[i]);
                if (sameHeader) startIdx = 1;
            }

            for (const row of vals.slice(startIdx)) {
                combined.push(row);
            }
        }

        // Stage to the right of the first range (2 columns gap).
        // This avoids overwriting the user's model while guaranteeing a contiguous source for the chart.
        const stageTopLeft = sheet.getCell(firstRange.rowIndex, firstRange.columnIndex + firstRange.columnCount + 2);
        const stage = stageTopLeft.getResizedRange(Math.max(combined.length, 1) - 1, Math.max((combined[0]?.length ?? 1), 1) - 1);
        stage.values = combined;
        stagedSourceRange = stage;
    } else {
        await context.sync();
    }

    // IMPORTANT : On charge les propriétés car on en a besoin pour le positionnement
    stagedSourceRange.load(["left", "top", "width"]);
    const chart = sheet.charts.add(chartType, stagedSourceRange, Excel.ChartSeriesBy.auto);
    chart.title.text = action.title || "AI Analysis";

    // On doit faire un sync intermédiaire uniquement ici pour que les props du range soient dispo
    await context.sync();

    // Keep positioning logic relative to the original (first) range.
    chart.left = firstRange.left + firstRange.width + 20;
    chart.top = firstRange.top;
}

export async function applyAddSheetAction(action: any, context: Excel.RequestContext) {
    const sheets = context.workbook.worksheets;
    const name = String(action?.sheet ?? "").trim();
    if (!name) return;

    const existing = sheets.getItemOrNullObject(name);
    existing.load("isNullObject");
    await context.sync();

    if (!existing.isNullObject) {
        existing.activate();
        return;
    }

    const newSheet = sheets.add(name);
    newSheet.activate();
}