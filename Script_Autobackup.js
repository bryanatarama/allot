function backupScriptsToScriptBackupTab_REST_() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName("SCRIPT_BACKUP") || ss.insertSheet("SCRIPT_BACKUP");

  const scriptId = ScriptApp.getScriptId();
  const url = `https://script.googleapis.com/v1/projects/${encodeURIComponent(scriptId)}/content`;

  const token = ScriptApp.getOAuthToken();
  const resp = UrlFetchApp.fetch(url, {
    method: "get",
    headers: { Authorization: `Bearer ${token}` },
    muteHttpExceptions: true,
  });

  const code = resp.getResponseCode();
  const body = resp.getContentText();

  if (code !== 200) {
    throw new Error(
      `Apps Script API REST call failed (HTTP ${code}).\n` +
      `Body:\n${body}\n\n` +
      `If you see PERMISSION_DENIED, confirm the script is attached to the same GCP project where Apps Script API is enabled.`
    );
  }

  const content = JSON.parse(body);
  const files = (content && content.files) ? content.files : [];
  if (!files.length) throw new Error("No script files returned from API.");

  // Sort for nicer layout
  files.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  // Header / timestamp
  sh.getRange("A1").setValue("⚠️ SCRIPT BACKUP — READ ONLY");
  sh.getRange("A2").setValue("Last auto-backup:");
  sh.getRange("B2").setValue(new Date()).setNumberFormat("m/d/yyyy h:mm:ss AM/PM");
  sh.getRange("A3").setValue(`Script ID: ${scriptId}`);

  const startRow = 5;
  const startCol = 1;

  // Clear old backup area (keeps headers)
  const maxRows = sh.getMaxRows();
  const maxCols = sh.getMaxColumns();
  if (maxRows >= startRow) {
    sh.getRange(startRow, 1, maxRows - startRow + 1, maxCols).clearContent();
  }

  // Each file = one column, each line = one row
  const columns = [];
  let maxLines = 0;

  files.forEach(f => {
    const ext =
      f.type === "SERVER_JS" ? "gs" :
      f.type === "JSON" ? "json" :
      "txt";

    const filename = `${f.name}.${ext}`;
    const source = String(f.source || "");
    const lines = source.split(/\r?\n/);

    const colLines = [`===== ${filename} =====`, ...lines];
    maxLines = Math.max(maxLines, colLines.length);
    columns.push({ filename, lines: colLines });
  });

  // Ensure enough columns exist
  if (sh.getMaxColumns() < columns.length) {
    sh.insertColumnsAfter(sh.getMaxColumns(), columns.length - sh.getMaxColumns());
  }

  // Row 4: filenames
  sh.getRange(4, startCol, 1, columns.length).setValues([columns.map(c => c.filename)]);

  // Body
  const out = Array.from({ length: maxLines }, (_, r) =>
    columns.map(c => (c.lines[r] !== undefined ? c.lines[r] : ""))
  );

  sh.getRange(startRow, startCol, out.length, out[0].length).setValues(out);

  sh.setFrozenRows(4);
  sh.autoResizeColumns(1, columns.length);

  ss.toast(`Script backup saved to SCRIPT_BACKUP (${files.length} files).`, "Budgeter", 4);
}
function Run_ScriptBackup() {
  backupScriptsToScriptBackupTab_REST_();
}

// Optional: quick visibility test
function Run_ScriptBackup_Test() {
  SpreadsheetApp.getActive().toast("Run_ScriptBackup_Test is visible");
}

