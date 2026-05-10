const ENABLE_BALANCE_DELTA_FUNDING = false; // baseline-only mode

function allocateBalanceDeltaAsFunding_() {
    if (!ENABLE_BALANCE_DELTA_FUNDING) {
    SpreadsheetApp.getActive().toast(
      "Balance-delta funding is disabled (baseline-only mode).",
      "Budgeter",
      4
    );
    return;
  }

  const ss = SpreadsheetApp.getActive();
  const dash = ss.getSheetByName("Dashboard");
  const ledger = ss.getSheetByName("Ledger");
  const billsPct = ss.getSheetByName("Bills % Split");
  if (!dash) throw new Error('Sheet "Dashboard" not found');
  if (!ledger) throw new Error('Sheet "Ledger" not found');
  if (!billsPct) throw new Error('Sheet "Bills % Split" not found');

  const dbg = ss.getSheetByName("Debug") || ss.insertSheet("Debug");
  const log = (msg) => dbg.appendRow([new Date(), "BALSYNC", msg]);

  // Current balances (Dashboard)
  const spending = Number(dash.getRange("M6").getValue()) || 0;
  const bills    = Number(dash.getRange("M7").getValue()) || 0;
  const savings  = Number(dash.getRange("M8").getValue()) || 0;

  // Previous snapshot (hidden cells)
  const prevSpending = Number(dash.getRange("N6").getValue()) || 0;
  const prevBills    = Number(dash.getRange("N7").getValue()) || 0;
  const prevSavings  = Number(dash.getRange("N8").getValue()) || 0;
  // === BASELINE GUARD (first-time initialization) ===
  const baselineUnset =
    dash.getRange("N6").isBlank() &&
    dash.getRange("N7").isBlank() &&
    dash.getRange("N8").isBlank();

  if (baselineUnset) {
    dash.getRange("N6").setValue(spending);
    dash.getRange("N7").setValue(bills);
    dash.getRange("N8").setValue(savings);
    ss.toast("Baseline established. No funding posted.", "Budgeter", 4);
    return;
  }



  const deltaCash = (spending + bills + savings) - (prevSpending + prevBills + prevSavings);

  log(`M6:M8=${spending},${bills},${savings}`);
  log(`N6:N8=${prevSpending},${prevBills},${prevSavings}`);
  log(`deltaCash=${deltaCash}`);

  // Update snapshot for next time (prevents double counting)
  dash.getRange("N6").setValue(spending);
  dash.getRange("N7").setValue(bills);
  dash.getRange("N8").setValue(savings);

  if (deltaCash <= 0.0001) {
    log("Exit: deltaCash <= 0 (no new funding).");
    return;
  }

  // ===== IMPORTANT: set these ranges to your funding table on Bills % Split =====
  // These MUST be: category labels + dollar amounts you want to treat as "this funding event".
  // Example shown is placeholder.
  const CAT_RANGE = "A7:A16";
  const AMT_RANGE = "C7:C16";
  // ============================================================================

  const cats = billsPct.getRange(CAT_RANGE).getDisplayValues().flat().map(s => String(s || "").trim());
  const amtsRaw = billsPct.getRange(AMT_RANGE).getDisplayValues().flat();

  const rows = [];
  for (let i = 0; i < cats.length; i++) {
    const cat = cats[i];
    if (!cat) continue;
    const amt = Number(String(amtsRaw[i] || "0").replace(/[$,]/g, "")) || 0;
    if (amt <= 0) continue;
    rows.push({ category: cat, amount: amt });
  }

  log(`Parsed funding rows=${rows.length} from ${CAT_RANGE}/${AMT_RANGE}`);

  if (!rows.length) {
    log("Exit: funding rows empty (ranges wrong or amounts are 0).");
    return;
  }

  const totalAlloc = rows.reduce((s, r) => s + r.amount, 0);
  if (totalAlloc <= 0.0001) {
    log("Exit: totalAlloc <= 0.");
    return;
  }

  // Scale allocation amounts to match the deltaCash
  const scale = deltaCash / totalAlloc;
  const scaled = rows.map(r => ({
    category: r.category,
    amount: Math.round(r.amount * scale * 100) / 100
  }));

  // Write a date with NO time so SUMIFS date windows behave
  const date = new Date();
  date.setHours(0, 0, 0, 0);

  const tz = ss.getSpreadsheetTimeZone();
  const key = `BALSYNC-${Utilities.formatDate(new Date(), tz, "yyyyMMdd-HHmmss")}`;

  const out = scaled.map(r => [date, key, r.category, r.amount]);
  ledger.getRange(ledger.getLastRow() + 1, 1, out.length, 4).setValues(out);

  log(`Wrote ${out.length} Ledger rows key=${key}`);
}
function setMonthlyBaseline_(ss) {
  const dash = ss.getSheetByName("Dashboard");
  if (!dash) throw new Error('Sheet "Dashboard" not found');

  const tz = ss.getSpreadsheetTimeZone();
  const monthKey = Utilities.formatDate(new Date(), tz, "yyyy-MM");

  const props = PropertiesService.getDocumentProperties();
  const lastBaselineMonth = props.getProperty("BUDGETER_BASELINE_MONTH");

  if (lastBaselineMonth === monthKey) {
    ss.toast(`Baseline already set for ${monthKey}.`, "Budgeter", 4);
    return;
  }

  const spending = Number(dash.getRange("M6").getValue()) || 0;
  const bills    = Number(dash.getRange("M7").getValue()) || 0;
  const savings  = Number(dash.getRange("M8").getValue()) || 0;

  // Snapshot baseline (Dashboard N6:N8) — guardrail-safe
  if (typeof safeSetValues_ === "function") {
    safeSetValues_(dash, "N6:N8", [[spending], [bills], [savings]]);
  } else {
    dash.getRange("N6:N8").setValues([[spending], [bills], [savings]]);
  }

  // Seed Bills baseline Paid MTD from Bills account balance (one-time per month)
  seedBillsBaselinePaidMTDFromBillsBalance_(ss, bills);
seedLivingBaselinePaidMTDFromSpendingBalance_(ss, spending);

  // Only lock the month AFTER successful writes
  props.setProperty("BUDGETER_BASELINE_MONTH", monthKey);

  ss.toast(`Baseline set for ${monthKey}. No funding posted.`, "Budgeter", 4);
}

function seedBillsBaselinePaidMTDFromBillsBalance_(ss, billsBalance) {
  const sh = ss.getSheetByName("Bills % Split");
  if (!sh) throw new Error('Sheet "Bills % Split" not found');

  // ===== CONFIRMED RANGES FROM YOUR SHEET =====
  const CAT_RANGE   = "A7:A26";   // Category
  const PCT_RANGE   = "B7:B26";   // Percent (e.g. 52 for 52%)
  const BASE_RANGE  = "E7:E26";   // Baseline Paid MTD (SCRIPT-WRITTEN)
  const DESC_RANGE  = "H7:H26";   // Descriptor ("Bills" / "Living")
  const TGT_RANGE   = "F7:F26";   // Monthly Target (for optional capping)
  // ===========================================

  const cats  = sh.getRange(CAT_RANGE).getDisplayValues().flat();
  const pcts0 = sh.getRange(PCT_RANGE).getDisplayValues().flat();
  const descs = sh.getRange(DESC_RANGE).getDisplayValues().flat();
  const tgts0 = sh.getRange(TGT_RANGE).getDisplayValues().flat();

  const rows = [];
  for (let i = 0; i < cats.length; i++) {
    const cat = String(cats[i] || "").trim();
    if (!cat) continue;

    const desc = String(descs[i] || "").toLowerCase();
    if (desc !== "bills") continue;

    const pct = Number(String(pcts0[i] || "0").replace(/[%\s]/g, "")) || 0;
    if (pct <= 0) continue;

    const tgt = Number(String(tgts0[i] || "0").replace(/[$,]/g, "")) || 0;
    rows.push({ i, pct, target: tgt });
  }

  if (!rows.length) {
    ss.toast("No Bills rows found to seed baseline Paid MTD.", "Budgeter", 4);
    return;
  }

  const pctTotal = rows.reduce((s, r) => s + r.pct, 0);
  if (pctTotal <= 0.0001) {
    throw new Error("Bills % Split: Bills-row percent total is 0.");
  }

  // Prepare output array (blank for non-bills rows)
  const out = Array(cats.length).fill([""]);

  for (const r of rows) {
    let amt = billsBalance * (r.pct / pctTotal);
    amt = Math.round(amt * 100) / 100;

    // Cap at monthly target to avoid >100% funded baseline
    if (r.target > 0) amt = Math.min(amt, r.target);

    out[r.i] = [amt];
  }

  // Respect guardrails
  if (typeof safeSetValues_ === "function") {
    safeSetValues_(sh, BASE_RANGE, out);
  } else {
    sh.getRange(BASE_RANGE).setValues(out);
  }

  ss.toast(
    `Seeded Bills baseline Paid MTD from Bills balance ($${billsBalance.toFixed(2)})`,
    "Budgeter",
    4
  );
}
function seedLivingBaselinePaidMTDFromSpendingBalance_(ss, spendingBalance) {
  const sh = ss.getSheetByName("Bills % Split");
  if (!sh) throw new Error('Sheet "Bills % Split" not found');

  // Confirmed layout
  const CAT_RANGE  = "A7:A26";
  const PCT_RANGE  = "B7:B26";
  const BASE_RANGE = "E7:E26";   // Baseline Paid MTD
  const DESC_RANGE = "H7:H26";   // Descriptor
  const TGT_RANGE  = "F7:F26";   // Monthly Target (optional cap)

  const cats  = sh.getRange(CAT_RANGE).getDisplayValues().flat().map(s => String(s||"").trim());
  const pcts0 = sh.getRange(PCT_RANGE).getDisplayValues().flat();
  const descs = sh.getRange(DESC_RANGE).getDisplayValues().flat().map(s => String(s||"").trim().toLowerCase());
  const tgts0 = sh.getRange(TGT_RANGE).getDisplayValues().flat();

  // Read existing baseline so we only overwrite the rows we’re seeding
  const existing = sh.getRange(BASE_RANGE).getValues(); // 20x1

  const items = [];
  for (let i = 0; i < cats.length; i++) {
    if (!cats[i]) continue;

    const desc = descs[i];
    const isLiving = (desc === "living" || desc === "living expenses");
    if (!isLiving) continue;

    const pct = Number(String(pcts0[i] || "0").replace(/[%\s]/g, "")) || 0;
    if (pct <= 0) continue;

    const tgt = Number(String(tgts0[i] || "0").replace(/[$,]/g, "")) || 0;
    items.push({ i, pct, target: tgt });
  }

  if (!items.length) {
    ss.toast("No Living rows found to seed baseline (check descriptor values).", "Budgeter", 4);
    return;
  }

  const pctTotal = items.reduce((s, it) => s + it.pct, 0);
  if (pctTotal <= 0.0001) throw new Error("Living rows percent total is 0.");

  // Write allocations into the existing baseline array (only Living rows)
  for (const it of items) {
    let amt = (Number(spendingBalance) || 0) * (it.pct / pctTotal);
    amt = Math.round(amt * 100) / 100;

    // Optional cap at target
    if (it.target > 0) amt = Math.min(amt, it.target);

    existing[it.i][0] = amt;
  }

  if (typeof safeSetValues_ === "function") {
    safeSetValues_(sh, BASE_RANGE, existing);
  } else {
    sh.getRange(BASE_RANGE).setValues(existing);
  }

  ss.toast(`Seeded Living baseline Paid MTD from Spending ($${(Number(spendingBalance)||0).toFixed(2)})`, "Budgeter", 4);
}

