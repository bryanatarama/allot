function getLogEditIntent_(e) {
  if (!e || !e.range) return null;

  const ss = e.source;
  const sh = e.range.getSheet();

  const LOG_SHEET = "Log";
  const QUEUE_COL = 8;
  const PREVIEW_COL = 9;

  if (sh.getName() !== LOG_SHEET) return null;

  const row = e.range.getRow();
  const col = e.range.getColumn();

  if (col !== QUEUE_COL && col !== PREVIEW_COL) return null;
  if (String(e.value) !== "TRUE") return null;

  if (row < 2) {
    return {
      ss,
      sh,
      row,
      col,
      isPreview: (col === PREVIEW_COL),
      reason: "header_row"
    };
  }

  return {
    ss,
    sh,
    row,
    col,
    isPreview: (col === PREVIEW_COL),
    reason: null
  };
}
function readDepositFromLogRow_(logSheet, row) {
  // Reads: A=Date, B=Deposit
  const logRowVals = logSheet.getRange(row, 1, 1, logSheet.getLastColumn()).getValues()[0];
  const depositDate = logRowVals[0];
  const depositAmount = Number(logRowVals[1]) || 0;

  if (!depositDate || !depositAmount) return null;

  return { depositDate, depositAmount };
}
function handlePreview_(ss, sh, row, depositDate, depositAmount, debtSnap, billsSnap, PROCESSED_COL, LEDGERKEY_COL) {
  // If already processed, lock preview
  const processed = sh.getRange(row, PROCESSED_COL).getValue() === true;
  const existingKey = sh.getRange(row, LEDGERKEY_COL).getValue();

  if (processed || existingKey) {
    ss.toast(`Row ${row} is already processed — preview locked.`, "Preview", 4);
    clearDashboardPreview_(ss);
    return;
  }

  renderPreviewToDashboard_(ss, {
    logRow: row,
    depositDate,
    depositAmount,
    debt: debtSnap.rows,
    bills: billsSnap.rows
  });

  ss.toast(`Preview updated for Log row ${row}.`, "Preview", 4);
}
function handleCommit_(ss, sh, row, depositDate, depositAmount, debtSnap, billsSnap, PROCESSED_COL, LEDGERKEY_COL) {
  // Prevent re-processing if LedgerKey already exists
  const ledgerKeyCell = sh.getRange(row, LEDGERKEY_COL);
  const existingKey = ledgerKeyCell.getValue();
  if (existingKey) {
    ss.toast(`Row ${row} already processed.`, "Processed", 4);
    return { skipped: true, reason: "already_has_ledger_key" };
  }

  // Create LedgerKey
  const tz = ss.getSpreadsheetTimeZone();
  const dateKey = Utilities.formatDate(new Date(depositDate), tz, "yyyyMMdd");
  const amountKey = Math.round(depositAmount * 100);
  const key = `LOG-R${row}-${dateKey}-${amountKey}`;

  // Write ledgers from snapshots
  writeDebtLedger_(ss, depositDate, key, debtSnap);
  writeBillsLedger_(ss, depositDate, key, billsSnap);

  // Mark processed at end
  sh.getRange(row, PROCESSED_COL).setValue(true);
  ledgerKeyCell.setValue(key);

  clearDashboardPreview_(ss);
  focusNextUnprocessedLogRow_(ss, row);

  ss.toast(`Committed Log row ${row}.`, "Success", 4);

  return { skipped: false, key };
}
function focusNextUnprocessedLogRow_(ss, startRow) {
  const LOG_SHEET = "Log";
  const QUEUE_COL = 8;      // H
  const PROCESSED_COL = 5;  // E

  const sh = ss.getSheetByName(LOG_SHEET);
  if (!sh) return;

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return;

  const processedVals = sh.getRange(2, PROCESSED_COL, lastRow - 1, 1).getValues().flat();

  // Start searching from the row after the one we just processed
  const startIdx = Math.max(0, (startRow + 1) - 2);

  // Search downward
  for (let i = startIdx; i < processedVals.length; i++) {
    if (processedVals[i] !== true) {
      const targetRow = i + 2;
      try {
        sh.setActiveSelection(sh.getRange(targetRow, QUEUE_COL));
      } catch (e) {
        // Some trigger contexts won't allow selection changes; ignore.
      }
      return;
    }
  }

  // Wrap-around search from top
  for (let i = 0; i < startIdx; i++) {
    if (processedVals[i] !== true) {
      const targetRow = i + 2;
      try {
        sh.setActiveSelection(sh.getRange(targetRow, QUEUE_COL));
      } catch (e) {}
      return;
    }
  }
}