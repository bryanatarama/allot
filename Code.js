
  /***********************
 * Budgeter — Clean Core + Preview Mode (Dashboard)
 *
 * Log columns:
 * A Date
 * B Deposit
 * E Processed (checkbox)
 * F Ledger Key / LogRowKey
 * H Queue (checkbox)   -> COMMIT (writes to ledgers)
 * I Preview (checkbox) -> PREVIEW (writes to Dashboard only)
 *
 * Debt Split snapshot source:
 * - Card names: Debt Split!A4:A...
 * - Min alloc:  Debt Split!F4:F...
 * - Extra alloc:Debt Split!G4:G...
 *
 * Debt Ledger headers:
 * A Date | B LogRowKey | C Card | D Amount
 *
 * Bills Allocation snapshot source:
 * - Category: Bills Allocation!A4:A13
 * - Amount:   Bills Allocation!D4:D13
 *
 * Ledger headers (created if missing):
 * A Date | B LogRowKey | C Category | D Amount
 ***********************/
// ===== Feature flags =====









function onEdit(e) {
  const intent = getLogEditIntent_(e);
  if (!intent) return;

  const ss = intent.ss;
  const sh = intent.sh;
  const row = intent.row;
  const col = intent.col;

  const PROCESSED_COL = 5; // E
  const LEDGERKEY_COL = 6; // F

  return withLock_(ss, () => {
    const dbg = getOrCreateSheet_(ss, "Debug");
    dbg.getRange("A1").setValue(new Date());
    dbg.getRange("A2").setValue("onEdit fired");
    dbg.getRange("A3").setValue(`Sheet:${sh.getName()} Row:${row} Col:${col}`);
    dbg.getRange("A4").setValue(`Value:${e.value}`);

    if (intent.reason === "header_row") {
      dbg.getRange("A5").setValue("Exit: header row");
      return;
    }

    // checkbox acts like a button
    e.range.setValue(false);

    const dep = readDepositFromLogRow_(sh, row);
    if (!dep) {
      dbg.getRange("A5").setValue("Exit: missing date/amount");
      return;
    }

    const { depositDate, depositAmount } = dep;

    const debtSnap  = snapshotDebtSplit_();
    const billsSnap = snapshotBillsAllocation_();

    if (intent.isPreview) {
      handlePreview_(ss, sh, row, depositDate, depositAmount, debtSnap, billsSnap, PROCESSED_COL, LEDGERKEY_COL);
      return;
    }

    const result = handleCommit_(ss, sh, row, depositDate, depositAmount, debtSnap, billsSnap, PROCESSED_COL, LEDGERKEY_COL);

    if (result && result.skipped) {
      dbg.getRange("A5").setValue("Exit: already has LedgerKey");
      return;
    }

    dbg.getRange("A6").setValue(
      `Success Key=${result.key} DebtRows=${debtSnap.rows.length} BillsRows=${billsSnap.rows.length}`
    );
  });
}



/** Menu item for one-click weekly updates */
/** Menu item for one-click weekly updates */
function onOpen(e) {
  buildBudgeterMenu_();
}

function buildBudgeterMenu_() {
  const ui = SpreadsheetApp.getUi();

  // This overwrites the old menu each time onOpen runs
  const menu = ui.createMenu("Budgeter");

  // --- System items ---
  menu
    .addItem("Sync Accounts → System", "menuSyncAccounts_")
    .addItem("Sync Dashboard Balances → System", "menuSyncDashboardBalances_")
    .addItem("Post Balance Increase as Funding", "menuAllocateBalanceDeltaAsFunding_")
    .addSeparator()
    .addItem("Reset Bills % Split Paid MTD (Formulas)", "menuResetBillsPctSplitPaidMtd_")
    .addSeparator()
    .addItem("Run Spreadsheet Audit (existing)", "menuRunSpreadsheetAudit_")
    .addItem("Run Read-Only Audit → AUDIT_REPORT", "menuRunReadOnlyAudit_")
    .addSeparator()
    .addItem("SYSTEM_MAP guidance", "menuSystemMapGuidance_")
    .addSeparator()
    .addItem("Run Tests → TEST_REPORT", "menuRunAllTests_")
    .addSeparator()
    .addItem("Backup Scripts → SCRIPT_BACKUP", "menuBackupScripts_");

  // --- Config submenu ---
  const cfg = ui.createMenu("Config")
    .addItem("Seed Bills Split Config from Current Sheet", "menuSeedBillsSplitConfigFromSheet_")
    .addItem("Seed Splitter Config from Current Sheet", "menuSeedSplitterConfigFromSheet_")
    .addItem("Clear Monthly Baseline (Dev/Test)", "menuClearBaselineMonth_")
    .addItem("Set Monthly Baseline", "menuSetMonthlyBaseline_");
// Add future config items here, once each

  menu.addSubMenu(cfg);

  menu.addToUi();
}
function menuClearBaselineMonth_() {
  const ss = SpreadsheetApp.getActive();
  withLock_(ss, () => {
    PropertiesService.getDocumentProperties().deleteProperty("BUDGETER_BASELINE_MONTH");
    ss.toast("Baseline month property cleared.", "Budgeter", 4);
  });
}




/** Harmless helper so you can confirm menu wiring works */
function openSystemMapGuidance_() {
  SpreadsheetApp.getUi().alert(
    'SYSTEM_MAP is a NEW TAB in this same spreadsheet.\n\n' +
    'Run: Budgeter → Run Read-Only Audit → creates AUDIT_REPORT.\n' +
    'Then we document Inputs/Formulas/Script-written in SYSTEM_MAP.'
  );
}
function menuSeedSplitterConfigFromSheet_() {
  withLock_("Seed Splitter Config from Current Sheet", () => {
    seedSplitterConfigFromLiveSheet_(); // <-- must be the named-range version
  });
}

function menuSyncAccounts_() {
  withLock_("Sync Accounts → System", () => {
    pushAccountsToSystem_();   // defined in AccountsSync.gs
  });
}

function menuSyncDashboardBalances_() {
  withLock_("Sync Dashboard Balances → System", () => {
    syncBalancesFromDashboard_();  // defined in AccountsSync.gs
  });
}

// Menu wiring expects this name, but your function is openSystemMapGuidance_()
function menuSystemMapGuidance_() {
  openSystemMapGuidance_();
}
function menuAllocateBalanceDeltaAsFunding_() {
  const ss = SpreadsheetApp.getActive();
  withLock_(ss, () => {
    allocateBalanceDeltaAsFunding_(ss);
  });
}
function RUN_clearBaselineMonth() {
  PropertiesService.getDocumentProperties().deleteProperty("BUDGETER_BASELINE_MONTH");
  SpreadsheetApp.getActive().toast("Baseline month property cleared.", "Budgeter", 4);
}

function menuResetBillsPctSplitPaidMtd_() {
  withLock_(SpreadsheetApp.getActive(), () => resetBillsPctCoreFormulas_());
}
function menuRunSpreadsheetAudit_() { runSpreadsheetAudit_(); }
function menuRunReadOnlyAudit_() { auditWorkbook_readOnly_(); }
function menuRunAllTests_() { runAllTests_(); }
function menuBackupScripts_() { backupScriptsToScriptBackupTab_REST_(); }
























