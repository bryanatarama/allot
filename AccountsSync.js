function pushAccountsToSystem_() {
  const ss = SpreadsheetApp.getActive();
  const accounts = ss.getSheetByName("Accounts");
  if (!accounts) throw new Error('Sheet "Accounts" not found');

  // ---------- 1) Sync Map F:H ----------
  const MAP_START_ROW = 2;
  const MAP_COL_SOURCE_KEY = 6;   // F
  const MAP_COL_SOURCE_CELL = 7;  // G
  const MAP_COL_TARGETS = 8;      // H

  const lastRow = accounts.getLastRow();
  if (lastRow >= MAP_START_ROW) {
    const map = accounts.getRange(
      MAP_START_ROW,
      MAP_COL_SOURCE_KEY,
      lastRow - MAP_START_ROW + 1,
      3
    ).getValues();

    map.forEach(([key, sourceCellA1, targetsRaw]) => {
      const k = String(key || "").trim();
      const srcA1 = String(sourceCellA1 || "").trim();
      const targets = String(targetsRaw || "").trim();
      if (!k || !srcA1 || !targets) return;

      // Read source value (supports $ formatting because we use getDisplayValue fallback)
      let val = accounts.getRange(srcA1).getValue();
      if (typeof val === "string") {
        const cleaned = val.replace(/[$,]/g, "").trim();
        if (cleaned !== "" && !isNaN(cleaned)) val = Number(cleaned);
      }

      targets.split(",").map(s => s.trim()).filter(Boolean).forEach(t => {
        setValueByA1Target_(ss, t, val);
      });
    });
  }

  // ---------- 2) Credit Card balances -> Debt Split ----------
  const debt = ss.getSheetByName("Debt Split");
  if (!debt) throw new Error('Sheet "Debt Split" not found');

  // Find "Starting Balance" column by header text (input column we should write)
const headerRowCandidates = [3, 2, 1];
let startingBalCol = null;

for (const hr of headerRowCandidates) {
  const headers = debt.getRange(hr, 1, 1, debt.getLastColumn()).getDisplayValues()[0];
  const idx = headers.findIndex(h => String(h).trim().toLowerCase() === "starting balance");
  if (idx !== -1) { startingBalCol = idx + 1; break; }
}
if (!startingBalCol) {
  throw new Error('Could not find a "Starting Balance" header on Debt Split (looked in rows 1-3).');
}


  // Read card names in Debt Split starting at A4 downward
  const startRow = 4;
  const lastDebtRow = debt.getLastRow();
  if (lastDebtRow >= startRow) {
    const debtNames = debt.getRange(startRow, 1, lastDebtRow - startRow + 1, 1)
      .getDisplayValues()
      .flat()
      .map(s => String(s || "").trim());

    // Read Accounts card table A9:B...
    const CARD_TABLE_START_ROW = 9;
    const cardLastRow = accounts.getLastRow();
    if (cardLastRow >= CARD_TABLE_START_ROW) {
      const cardData = accounts.getRange(
        CARD_TABLE_START_ROW, 1,
        cardLastRow - CARD_TABLE_START_ROW + 1, 2
      ).getValues();

      cardData.forEach(([nameRaw, balRaw]) => {
        const name = String(nameRaw || "").trim();
        if (!name) return;

        let bal = balRaw;
        if (typeof balRaw === "string") {
          const cleaned = balRaw.replace(/[$,]/g, "").trim();
          bal = cleaned === "" ? 0 : Number(cleaned);
        } else {
          bal = Number(balRaw) || 0;
        }

        const idx = debtNames.findIndex(n => n.toLowerCase() === name.toLowerCase());
        if (idx === -1) return; // no match, skip silently

       const targetRow = startRow + idx;

// ✅ GUARDRAIL: only allow writes to Debt Split "Starting Balance" column, rows 4+
assertDebtSplitStartingBalanceWrite_(debt, targetRow, startingBalCol);

safeSetValue_(debt, debt.getRange(targetRow, startingBalCol).getA1Notation(), bal);

      });
    }
  }

  ss.toast("Accounts synced to Splitter / Debt Split / Paid MTD targets.", "Budgeter", 4);
}
function syncBalancesFromDashboard_() {
  const ss = SpreadsheetApp.getActive();
  const dash = ss.getSheetByName("Dashboard");
  if (!dash) throw new Error('Sheet "Dashboard" not found');

  // Source of truth (formulas)
  const srcA1 = "M6:M8";

  // Snapshot target (script-written)
  const dstA1 = "N6:N8";

  const vals = dash.getRange(srcA1).getValues();

  // Guardrail enforced write
  safeSetValues_(dash, dstA1, vals);

  // Optional: timestamp somewhere if you have it allowlisted
  // safeSetValue_(dash, "M15", new Date());

  ss.toast("Dashboard balances snapped to N6:N8.", "Budgeter", 4);
}
function setValueByA1Target_(ss, targetA1, value) {
  const m = String(targetA1).trim().match(/^(?:'([^']+)'|([^!]+))!(.+)$/);
  if (!m) throw new Error(`Bad target: ${targetA1}`);

  const sheetName = (m[1] || m[2]).trim();
  const a1 = m[3].trim();

  const sh = ss.getSheetByName(sheetName);
  if (!sh) throw new Error(`Sheet not found: ${sheetName}`);

  // This should internally call assertAllowedWrite_
  safeSetValue_(sh, a1, value);
}
function assertDebtSplitBalanceWrite_(sh, row, col, balanceCol) {
  if (!sh || sh.getName() !== "Debt Split") {
    throw new Error("GUARDRAIL: Not writing to Debt Split.");
  }
  if (row < 4) {
    throw new Error(`GUARDRAIL: Debt Split write above row 4: r${row}`);
  }
  if (col !== balanceCol) {
    throw new Error(`GUARDRAIL: Debt Split write not in Current Balance column. col=${col} expected=${balanceCol}`);
  }
}
function getBillsPoolCellA1_() { return "B25"; } // Splitter sheet
function getBillsPool_(ss) {
  const sh = ss.getSheetByName("Splitter");
  return Number(sh.getRange(getBillsPoolCellA1_()).getValue()) || 0;
}


