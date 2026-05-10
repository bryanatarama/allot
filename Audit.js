/***********************
 * Audit.gs — Spreadsheet audits + archive utilities
 ***********************/

/**
 * Column audit: counts formula/value/blank cells by column for a sheet.
 * Writes/append results to AUDIT_COLUMNS.
 */
function auditColumnsForSheet_(sheetName) {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(sheetName);
  if (!sh) throw new Error(`Sheet not found: ${sheetName}`);

  const reportName = "AUDIT_COLUMNS";
  let rep = ss.getSheetByName(reportName);
  if (!rep) rep = ss.insertSheet(reportName);

  // Append section (don’t wipe previous runs)
  const startRow = rep.getLastRow() + 2;
  rep.getRange(startRow, 1).setValue(`Sheet: ${sheetName}  (run: ${new Date()})`);

  const dr = sh.getDataRange();
  const formulas = dr.getFormulas();
  const values = dr.getValues();

  const numRows = values.length;
  const numCols = values[0].length;

  const out = [];
  out.push(["Col", "A1 Col", "Header (row 1)", "Formula Cells", "Value Cells", "Blank Cells"]);

  for (let c = 0; c < numCols; c++) {
    let f = 0, v = 0, b = 0;

    for (let r = 0; r < numRows; r++) {
      const hasFormula = formulas[r][c] && String(formulas[r][c]).trim() !== "";
      const val = values[r][c];

      if (hasFormula) f++;
      else if (val === "" || val === null) b++;
      else v++;
    }

    const header = sh.getRange(1, c + 1).getDisplayValue();
    out.push([c + 1, colToA1_(c + 1), header, f, v, b]);
  }

  rep.getRange(startRow + 1, 1, out.length, out[0].length).setValues(out);
  rep.autoResizeColumns(1, out[0].length);
}

function auditFragileTabs_columns_() {
  auditColumnsForSheet_("Bills % Split");
  auditColumnsForSheet_("Debt Split");
  auditColumnsForSheet_("Bills Allocation");
}

function colToA1_(col) {
  let s = "";
  while (col > 0) {
    const m = (col - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    col = Math.floor((col - 1) / 26);
  }
  return s;
}

/**
 * Existing general audit you already use (writes to Audit sheet).
 */
function runSpreadsheetAudit_() {
  const ss = SpreadsheetApp.getActive();
  let audit = ss.getSheetByName("Audit");
  if (!audit) audit = ss.insertSheet("Audit");

  audit.clear();
  audit.getRange("A1:H1").setValues([[
    "Sheet", "Used Range", "Formula Cells", "Value Cells",
    "Blank Cells", "Error Cells", "Notes", "Sample Error"
  ]]);

  const sheets = ss.getSheets();
  const rowsOut = [];

  for (const sh of sheets) {
    const name = sh.getName();
    if (name === "Audit") continue;

    const lastRow = sh.getLastRow();
    const lastCol = sh.getLastColumn();

    if (lastRow === 0 || lastCol === 0) {
      rowsOut.push([name, "—", 0, 0, 0, 0, "Empty sheet", ""]);
      continue;
    }

    const rng = sh.getRange(1, 1, lastRow, lastCol);
    const formulas = rng.getFormulas();
    const values = rng.getValues();
    const displays = rng.getDisplayValues();

    let formulaCells = 0, valueCells = 0, blankCells = 0, errorCells = 0;
    let sampleError = "";
    let notes = [];

    for (let r = 0; r < lastRow; r++) {
      for (let c = 0; c < lastCol; c++) {
        const f = formulas[r][c];
        const v = values[r][c];
        const d = displays[r][c];

        const isBlank = (v === "" || v === null);
        const isFormula = (f && f !== "");
        const isError =
          typeof d === "string" &&
          (d.startsWith("#REF!") || d.startsWith("#NUM!") || d.startsWith("#DIV/0!") ||
           d.startsWith("#N/A") || d.startsWith("#VALUE!") || d.startsWith("#ERROR!"));

        if (isFormula) formulaCells++;
        else if (isBlank) blankCells++;
        else valueCells++;

        if (isError) {
          errorCells++;
          if (!sampleError) {
            sampleError = `${name}!${colToA1_(c + 1)}${r + 1} = ${d}`;
          }
        }
      }
    }

    // Heuristics / notes
    if (errorCells > 0) notes.push("HAS_ERRORS");
    if (formulaCells > 0 && valueCells > 0) notes.push("MIXED_FORMULAS_VALUES");
    if (name.toLowerCase().includes("ledger")) notes.push("APPEND_ONLY_EXPECTED");

    rowsOut.push([
      name,
      `A1:${colToA1_(lastCol)}${lastRow}`,
      formulaCells,
      valueCells,
      blankCells,
      errorCells,
      notes.join(", "),
      sampleError
    ]);
  }

  audit.getRange(2, 1, rowsOut.length, 8).setValues(rowsOut);
  audit.autoResizeColumns(1, 8);

  // Timestamp
  audit.getRange("J1").setValue("Last audit:");
  audit.getRange("K1").setValue(new Date()).setNumberFormat("m/d/yyyy h:mm AM/PM");

  ss.toast("Audit complete. See the Audit tab.", "Budgeter", 4);
}

/**
 * Read-only workbook audit → AUDIT_REPORT (recreates sheet each run).
 */
function auditWorkbook_readOnly_() {
  const ss = SpreadsheetApp.getActive();
  const reportName = "AUDIT_REPORT";
  const existing = ss.getSheetByName(reportName);
  if (existing) ss.deleteSheet(existing);
  const report = ss.insertSheet(reportName);

  const rows = [];
  rows.push([
    "Sheet",
    "Range",
    "Cells",
    "Formula Cells",
    "Value Cells",
    "Blank Cells",
    "Notes"
  ]);

  ss.getSheets().forEach(sh => {
    const name = sh.getName();
    if (name === reportName) return;

    const dr = sh.getDataRange();
    const a1 = dr.getA1Notation();

    const formulas = dr.getFormulas();
    const values = dr.getValues();

    let total = 0, fCount = 0, vCount = 0, bCount = 0;

    for (let r = 0; r < values.length; r++) {
      for (let c = 0; c < values[0].length; c++) {
        total++;
        const hasFormula = formulas[r][c] && formulas[r][c].toString().trim() !== "";
        const val = values[r][c];

        if (hasFormula) fCount++;
        else if (val === "" || val === null) bCount++;
        else vCount++;
      }
    }

    let notes = "";
    const mixRatio = Math.min(fCount, vCount) / Math.max(1, total);
    if (mixRatio > 0.15 && fCount > 0 && vCount > 0) {
      notes = "Mixed formulas & values in DataRange (review carefully)";
    }

    rows.push([name, a1, total, fCount, vCount, bCount, notes]);
  });

  report.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  report.autoResizeColumns(1, rows[0].length);
  report.setFrozenRows(1);
}

/** Archive utilities */
function monthlyResetLogToArchive() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const log = ss.getSheetByName("Log");
  if (!log) throw new Error('Missing sheet: "Log"');

  let arch = ss.getSheetByName("Log Archive");
  if (!arch) arch = ss.insertSheet("Log Archive");

  const tz = ss.getSpreadsheetTimeZone();
  const now = new Date();
  const monthStart = new Date(
    Utilities.formatDate(new Date(now.getFullYear(), now.getMonth(), 1), tz, "yyyy-MM-dd") + "T00:00:00"
  );

  const lastRow = log.getLastRow();
  const lastCol = log.getLastColumn();
  if (lastRow < 2) return;

  const data = log.getRange(2, 1, lastRow - 1, lastCol).getValues();

  const keep = [];
  const archive = [];

  for (const row of data) {
    const d = row[0];
    const hasAny = row.some(v => v !== "" && v !== null);
    if (!hasAny) continue;

    if (!(d instanceof Date) || isNaN(d.getTime())) {
      keep.push(row);
      continue;
    }

    if (d < monthStart) archive.push(row);
    else keep.push(row);
  }

  if (arch.getLastRow() === 0) {
    const headers = log.getRange(1, 1, 1, lastCol).getValues();
    arch.getRange(1, 1, 1, lastCol).setValues(headers);
  }

  if (archive.length === 0) return;

  arch.getRange(arch.getLastRow() + 1, 1, archive.length, lastCol).setValues(archive);

  const headers = log.getRange(1, 1, 1, lastCol).getValues();
  log.clearContents();
  log.getRange(1, 1, 1, lastCol).setValues(headers);
  if (keep.length > 0) log.getRange(2, 1, keep.length, lastCol).setValues(keep);
}

function forceCreateLogArchive() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let arch = ss.getSheetByName("Log Archive");
  if (!arch) arch = ss.insertSheet("Log Archive");
  arch.getRange("A1").setValue("Archive sheet created: " + new Date());
}

/* ---- Public wrappers (so they show up in the Run dropdown) ---- */

function Run_ReadOnlyAudit() {
  auditWorkbook_readOnly_();
}

function Run_AuditFragileTabs() {
  auditFragileTabs_columns_();
}
