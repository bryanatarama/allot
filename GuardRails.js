// ===== Guardrails (SYSTEM_MAP enforcement) =====

const WRITE_ALLOWLIST = {
  "Bills % Split": [
    "A7:A26",   // Bill names
    "B7:B26",   // Bill percent/weight
    "D7:D26",   // Paid MTD (synced inputs, if applicable)
    "E7:E26"    // Baseline Paid MTD (if applicable)
  ],

  "Splitter": [
    "B19", "B20", "B21",
    "E9:E28",
    "F9:F28"
  ],

  "Debt Split": [
    "B4:B24"   // Starting Balance inputs (Accounts sync)
  ],

  "Dashboard": [
    "G4:G5",
    "E5:E9",
    "E11",
    "N6:N8"
  ],

  "Accounts": [
    "B2", "B3", "B4"
  ]
};


/**
 * Returns true if `cellA1` is inside the allowlisted `allowedA1`.
 * Supports:
 *  - exact single cell match
 *  - exact range match
 *  - a single cell inside an allowlisted range (e.g., E11 inside E5:E11)
 */
function isA1Allowed_(allowedA1, cellOrRangeA1) {
  // Exact match handles exact-range writes too.
  if (allowedA1 === cellOrRangeA1) return true;

  // If caller is writing a range, we require exact match (no partial range writes).
  if (String(cellOrRangeA1).includes(":")) return false;

  // Caller is writing a single cell; allowedA1 may be a single cell or a range.
  if (!String(allowedA1).includes(":")) return allowedA1 === cellOrRangeA1;

  // Range containment check for single cell inside allowed range
  const sh = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet(); // only used for A1 parsing
  const allowed = sh.getRange(allowedA1);
  const cell = sh.getRange(cellOrRangeA1);

  const ar = allowed.getRow(), ac = allowed.getColumn();
  const anr = allowed.getNumRows(), anc = allowed.getNumColumns();
  const cr = cell.getRow(), cc = cell.getColumn();

  return (
    cr >= ar &&
    cr < ar + anr &&
    cc >= ac &&
    cc < ac + anc
  );
}

function assertAllowedWrite_(sheetName, a1) {
  const allowed = WRITE_ALLOWLIST[sheetName] || [];
  const ok = allowed.some(allow => isA1Allowed_(String(allow), String(a1)));
  if (!ok) throw new Error(`GUARDRAIL: Illegal write to ${sheetName}!${a1}`);
}

/** Safe setter helpers (preferred) */
function safeSetValue_(sheet, a1, value) {
  assertAllowedWrite_(sheet.getName(), a1);
  sheet.getRange(a1).setValue(value);
}

function safeSetValues_(sheet, a1, values) {
  assertAllowedWrite_(sheet.getName(), a1);
  sheet.getRange(a1).setValues(values);
}
function assertDebtSplitStartingBalanceWrite_(sh, row, col) {
  if (!sh || sh.getName() !== "Debt Split") {
    throw new Error("GUARDRAIL: Not writing to Debt Split.");
  }
  if (row < 4) {
    throw new Error(`GUARDRAIL: Debt Split write above row 4: r${row}`);
  }
  // We only assert the row/sheet here; column is determined by header scan.
  // If you want a stricter check, we can hard-verify the header cell text too.
}
