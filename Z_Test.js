/***********************
 * Z_Test.gs — Budgeter Test Harness
 *
 * Goal:
 * - Prove the system writes only where allowed
 * - Catch accidental writes / regressions fast
 ***********************/

function runAllTests_() {
  const ss = SpreadsheetApp.getActive();
  const results = [];
  const started = new Date();

  const add = (fn) => {
    try {
      results.push(fn(ss));
    } catch (err) {
      results.push({
        name: fn.name || "UNKNOWN_TEST",
        ok: false,
        details: (err && err.stack) ? err.stack : String(err)
      });
    }
  };

  add(TEST_guardrails_rangeContainment_);
  add(TEST_preview_writesOnlyPreviewSurfaces_);
  add(TEST_clearPreview_clearsPreviewSurfaces_);
  add(TEST_syncBalances_copiesTruthToSnapshot_);
  add(TEST_snapshot_shapes_);
  add(TEST_ledger_writers_append_);
  add(TEST_functionWiringAndFingerprints_);
  add(TEST_config_mapping_covers_allowlist_);

  writeTestReport_(ss, started, results);

  const failed = results.filter(r => !r.ok);
  ss.toast(
    failed.length ? `Tests failed: ${failed.length}/${results.length} (see TEST_REPORT)` :
                    `All tests passed: ${results.length}/${results.length}`,
    "Budgeter Tests",
    failed.length ? 7 : 4
  );
}

/**
 * Preview should only change Dashboard preview block:
 *  - G4:G5, E5:E9, E11
 * and should NOT change truth balances M6:M8.
 */
function TEST_preview_writesOnlyPreviewSurfaces_(ss) {
  const name = "Preview writes only preview surfaces";
  const dash = ss.getSheetByName("Dashboard");
  if (!dash) return fail_(name, 'Missing sheet "Dashboard"');

  const previewRanges = ["G4", "G5", "E5", "E6", "E7", "E8", "E9", "E11"];
  const truthRanges = ["M6:M8"]; // source of truth

  const beforePreview = snapshotDisplay_(dash, previewRanges);
  const beforeTruth = snapshotDisplay_(dash, truthRanges);

  renderPreviewToDashboard_(ss, {
    logRow: 999999,
    depositDate: new Date(),
    depositAmount: 123.45,
    debt: [],
    bills: []
  });

  const afterPreview = snapshotDisplay_(dash, previewRanges);
  const afterTruth = snapshotDisplay_(dash, truthRanges);

  const previewChanged = !deepEqual_(beforePreview, afterPreview);
  const truthUnchanged = deepEqual_(beforeTruth, afterTruth);

  if (!previewChanged) return fail_(name, "Expected preview ranges to change, but they did not.");
  if (!truthUnchanged) return fail_(name, "Truth/formula balances (M6:M8) changed during preview (unexpected).");

  return pass_(name);
}

function TEST_clearPreview_clearsPreviewSurfaces_(ss) {
  const name = "Clear preview clears preview surfaces";
  const dash = ss.getSheetByName("Dashboard");
  if (!dash) return fail_(name, 'Missing sheet "Dashboard"');

  renderPreviewToDashboard_(ss, {
    logRow: 888888,
    depositDate: new Date(),
    depositAmount: 55,
    debt: [],
    bills: []
  });

  clearDashboardPreview_(ss);

  const cells = ["G4","G5","E5","E6","E7","E8","E9","E11"];
  const vals = snapshotValuesFlat_(dash, cells);

  const anyNotBlank = Object.entries(vals).some(([, v]) => (v !== "" && v !== null));
  if (anyNotBlank) {
    return fail_(name, "Expected preview cells to be cleared, but at least one is still non-blank.");
  }

  return pass_(name);
}

/**
 * syncBalancesFromDashboard_ should copy M6:M8 -> N6:N8
 * and not modify M6:M8.
 */
function TEST_syncBalances_copiesTruthToSnapshot_(ss) {
  const name = "Sync balances copies M6:M8 -> N6:N8";
  const dash = ss.getSheetByName("Dashboard");
  if (!dash) return fail_(name, 'Missing sheet "Dashboard"');

  const beforeTruth = dash.getRange("M6:M8").getValues();
  syncBalancesFromDashboard_();
  const afterTruth = dash.getRange("M6:M8").getValues();

  const snap = dash.getRange("N6:N8").getValues();

  if (!deepEqual_(beforeTruth, afterTruth)) {
    return fail_(name, "Truth balances (M6:M8) changed during sync (unexpected).");
  }
  if (!deepEqual_(beforeTruth, snap)) {
    return fail_(name, "Snapshot balances (N6:N8) do not match truth (M6:M8) after sync.");
  }

  return pass_(name);
}

function TEST_snapshot_shapes_(ss) {
  const name = "Snapshot functions return expected shapes";
  const debt = snapshotDebtSplit_();
  const bills = snapshotBillsAllocation_();

  if (!debt || !Array.isArray(debt.rows)) return fail_(name, "snapshotDebtSplit_ did not return {rows: []}");
  if (!bills || !Array.isArray(bills.rows)) return fail_(name, "snapshotBillsAllocation_ did not return {rows: []}");

  const badDebt = debt.rows.find(r => !("card" in r) || !("total" in r));
  if (badDebt) return fail_(name, "Debt snapshot row missing {card,total}");

  const badBills = bills.rows.find(r => !("category" in r) || !("amount" in r));
  if (badBills) return fail_(name, "Bills snapshot row missing {category,amount}");

  return pass_(name);
}

/**
 * Ledger append smoke test:
 * Writes a single test row to Ledger and Debt Ledger.
 */
function TEST_ledger_writers_append_(ss) {
  const name = "Ledger writers append rows";
  const debtLedger = ss.getSheetByName("Debt Ledger");
  if (!debtLedger) return fail_(name, 'Missing sheet "Debt Ledger"');

  const ledger = ss.getSheetByName("Ledger");
  const beforeLedgerLast = ledger ? ledger.getLastRow() : 0;
  const beforeDebtLast = debtLedger.getLastRow();

  const depositDate = new Date();
  depositDate.setHours(0,0,0,0);
  const key = `TEST-${Utilities.getUuid()}`;

  writeBillsLedger_(ss, depositDate, key, { rows: [{ category: "TEST_CATEGORY", amount: 1.23 }]} );
  writeDebtLedger_(ss, depositDate, key, { rows: [{ card: "TEST_CARD", total: 4.56 }]} );

  const afterLedger = ss.getSheetByName("Ledger");
  const afterLedgerLast = afterLedger.getLastRow();
  const afterDebtLast = debtLedger.getLastRow();

  if (afterLedgerLast <= beforeLedgerLast) return fail_(name, "Ledger did not append a row.");
  if (afterDebtLast <= beforeDebtLast) return fail_(name, "Debt Ledger did not append a row.");

  return pass_(name);
}

function TEST_guardrails_rangeContainment_(ss) {
  const name = "Guardrails: single cell allowed inside allowlisted range";

  try {
    assertAllowedWrite_("Dashboard", "G4"); // allowed via G4:G5
  } catch (e) {
    return fail_(name, `Expected Dashboard!G4 to be allowed (via G4:G5), but it was blocked: ${e.message || e}`);
  }

  try {
    assertAllowedWrite_("Dashboard", "M6");
    return fail_(name, "Expected Dashboard!M6 to be blocked, but it was allowed.");
  } catch (e) {
    // expected
  }

  try {
    assertAllowedWrite_("Dashboard", "A1");
    return fail_(name, "Expected Dashboard!A1 to be blocked, but it was allowed.");
  } catch (e) {
    // expected
  }

  return pass_(name);
}

/**
 * Wiring sanity check: verifies key functions exist.
 */
function TEST_functionWiringAndFingerprints_(ss) {
  const required = [
    "onEdit",
    "getLogEditIntent_",
    "readDepositFromLogRow_",
    "handlePreview_",
    "handleCommit_",
    "withLock_",
    "getOrCreateSheet_",
    "snapshotDebtSplit_",
    "snapshotBillsAllocation_",
    "writeDebtLedger_",
    "writeBillsLedger_",
    "renderPreviewToDashboard_",
    "clearDashboardPreview_"
  ];

  const missing = required.filter(name => typeof globalThis[name] !== "function");

  return {
    name: "Function wiring sanity check",
    ok: missing.length === 0,
    details: missing.length
      ? `Missing functions:\n- ${missing.join("\n- ")}`
      : "All required functions are present."
  };
}

/**
 * Phase 0: config must include mapping rows that cover every WRITE_ALLOWLIST entry.
 */
function TEST_config_mapping_covers_allowlist_(ss) {
  const name = "Config: CFG_Mapping covers WRITE_ALLOWLIST surfaces";
  try {
    const res = validateMappingCoversAllowlist_();
    if (res.errors.length) return fail_(name, res.errors.join("\n"));
    return pass_(name);
  } catch (e) {
    return fail_(name, e && e.stack ? e.stack : String(e));
  }
}

/* ========= Helpers ========= */

function snapshotDisplay_(sheet, a1List) {
  const out = {};
  a1List.forEach(a1 => out[a1] = sheet.getRange(a1).getDisplayValues());
  return out;
}

function snapshotValuesFlat_(sheet, cellList) {
  const out = {};
  cellList.forEach(a1 => out[a1] = sheet.getRange(a1).getValue());
  return out;
}

function deepEqual_(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function pass_(name) {
  return { name, ok: true, details: "" };
}
function fail_(name, details) {
  return { name, ok: false, details };
}

function writeTestReport_(ss, started, results) {
  let sh = ss.getSheetByName("TEST_REPORT");
  if (!sh) sh = ss.insertSheet("TEST_REPORT");
  sh.clear();

  sh.getRange("A1").setValue("Budgeter Test Report");
  sh.getRange("A2").setValue("Run at:");
  sh.getRange("B2").setValue(started);

  sh.getRange("A4:D4").setValues([["Test", "OK", "Details", "Timestamp"]]);

  const rows = results.map(r => [r.name, r.ok ? "PASS" : "FAIL", r.details || "", new Date()]);
  if (rows.length) sh.getRange(5, 1, rows.length, 4).setValues(rows);

  sh.autoResizeColumns(1, 4);
  sh.setFrozenRows(4);
}

/**
 * Optional wrapper so you can run wiring check alone from the Run dropdown.
 */
function Run_FunctionWiringTest() {
  const ss = SpreadsheetApp.getActive();
  const result = TEST_functionWiringAndFingerprints_(ss);

  const sh = ss.getSheetByName("TEST_REPORT") || ss.insertSheet("TEST_REPORT");
  sh.clear();
  sh.getRange("A1:C1").setValues([["Test", "OK", "Details"]]);
  sh.getRange("A2:C2").setValues([[result.name, result.ok ? "PASS" : "FAIL", result.details]]);

  ss.toast(
    result.ok ? "Function wiring test PASSED" : "Function wiring test FAILED (see TEST_REPORT)",
    "Budgeter Tests",
    5
  );

  return result;
}
function TEST_config_shadow_matches_splitter_(ss) {
  const name = "Config shadow matches Splitter allocations";

  const dash = ss.getSheetByName("Splitter");
  if (!dash) return fail_(name, 'Missing sheet "Splitter"');

  const deposit = Number(dash.getRange("B8").getValue()) || 0;
  const profileId = getDefaultProfileId_();

  const cfgAlloc = computeCategoryAllocationsFromConfig_(deposit, profileId);
  const curAlloc = readCurrentSplitterAllocations_();

  for (const cfg of cfgAlloc) {
    const cur = curAlloc.find(c => c.displayName === cfg.displayName);
    if (!cur) return fail_(name, `Missing current category: ${cfg.displayName}`);

    if (Math.abs(cfg.amount - cur.amount) > 0.01) {
      return fail_(
        name,
        `Mismatch ${cfg.displayName}: current=${cur.amount}, config=${cfg.amount}`
      );
    }
  }

  return pass_(name);
}
function TEST_dynAlloc_fulfilledGetsZero_() {
  const a = DYN_ALLOC(100, [1, 1], [30, 200], [30, 0]).flat();
  const ok = nearly_(a[0], 0) && nearly_(a[1], 100);
  return { name: "DYN_ALLOC fulfilled line receives 0", ok, details: a };
}

function TEST_dynAlloc_capsRedistribute_() {
  const a = DYN_ALLOC(100, [1, 1, 1], [20, 200, 200], [0, 0, 0]).flat();
  const ok = nearly_(a[0], 20) && nearly_(a[1], 40) && nearly_(a[2], 40);
  return { name: "DYN_ALLOC cap hit redistributes", ok, details: a };
}

function TEST_dynAlloc_equalSplitWhenNoWeights_() {
  const a = DYN_ALLOC(90, [0, 0, 0], [200, 200, 200], [0, 0, 0]).flat();
  const ok = nearly_(a[0], 30) && nearly_(a[1], 30) && nearly_(a[2], 30);
  return { name: "DYN_ALLOC equal-splits when all weights are 0", ok, details: a };
}

function TEST_dynAlloc_neverExceedsNeed_() {
  const pool = 500;
  const weights = [1, 2, 3];
  const targets = [50, 60, 70];
  const paid = [10, 0, 30]; // needs: 40, 60, 40 => total need 140
  const a = DYN_ALLOC(pool, weights, targets, paid).flat();
  const needs = [40, 60, 40];

  const ok = a.every((x, i) => x <= needs[i] + 1e-6) && (a.reduce((s,x)=>s+x,0) <= 140 + 1e-6);
  return { name: "DYN_ALLOC never exceeds remaining need", ok, details: { a, needs } };
}

function nearly_(a, b, eps = 1e-6) {
  return Math.abs((a || 0) - (b || 0)) <= eps;
}
function menuSetMonthlyBaseline_() {
  const ss = SpreadsheetApp.getActive();
  withLock_(ss, () => setMonthlyBaseline_(ss));
}
function TEST_clearBaselineMonth_() {
  PropertiesService.getDocumentProperties().deleteProperty("BUDGETER_BASELINE_MONTH");
  SpreadsheetApp.getActive().toast("Cleared baseline month property.", "Budgeter", 4);
}
function RUN_clearBaselineMonth_() {
  PropertiesService
    .getDocumentProperties()
    .deleteProperty("BUDGETER_BASELINE_MONTH");

  SpreadsheetApp.getActive().toast(
    "Baseline month property cleared.",
    "Budgeter",
    4
  );
}
