/***********************
 * Phase 2 — Render Splitter table from Config
 ***********************/

function renderSplitterCategoryTableFromConfig_() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName("Splitter");
  if (!sh) throw new Error('Missing sheet "Splitter"');

  const cfg = loadConfig_();

  const profileId = getDefaultProfileId_(); // Phase 2: default only (can become selector later)

  const activeCats = cfg.categories.rows
    .filter(r => truthy_(r.IsActive))
    .sort((a, b) => Number(a.SortOrder) - Number(b.SortOrder));

  if (activeCats.length > 20) {
    throw new Error(`Too many active categories (${activeCats.length}). Max is 20.`);
  }

  // Build percent lookup for this profile
  const allocRows = cfg.allocs.rows
    .filter(r => String(r.ProfileId).trim() === profileId);

  const pctByCatId = {};
  allocRows.forEach(r => {
    pctByCatId[String(r.CategoryId).trim()] = Number(r.Percent) || 0;
  });

  // Target region (current table)
  const startRow = 9;
  const maxRows = 20;

  // Write category names (E) and percents (F)
  const catOut = [];
  const pctOut = [];

  activeCats.forEach(c => {
    catOut.push([String(c.DisplayName)]);
    const pct = pctByCatId[String(c.CategoryId).trim()] || 0;
    pctOut.push([pct / 100]); // store as decimal for percent format
  });

  // Clear old rows beyond activeCats (E/F only) to avoid leftover categories
  const clearCount = maxRows - activeCats.length;
  if (clearCount > 0) {
    const blankCats = Array.from({ length: clearCount }, () => [""]);
    const blankPct = Array.from({ length: clearCount }, () => [""]);
    catOut.push(...blankCats);
    pctOut.push(...blankPct);
  }

  // Guardrails: if you want this enforced, add Splitter E9:E28 and F9:F28 to WRITE_ALLOWLIST first.
  // For Phase 2, I recommend we DO add those allowlisted ranges before enabling this renderer.

  sh.getRange(startRow, 5, maxRows, 1).setValues(catOut); // E
  sh.getRange(startRow, 6, maxRows, 1).setValues(pctOut); // F
  sh.getRange(startRow, 6, maxRows, 1).setNumberFormat("0.00%");

  ss.toast(`Rendered ${activeCats.length} categories on Splitter using profile ${profileId}.`, "Config Render", 4);
}

/** Public wrapper for Run dropdown + menu */
function Run_RenderSplitterFromConfig() {
  return renderSplitterCategoryTableFromConfig_();
}
function renderBillsSplitInputsFromConfig_() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName("Bills % Split");
  if (!sh) throw new Error('Missing sheet "Bills % Split"');

  const cfg = loadConfig_();
  const billProfileId = getDefaultBillProfileId_();

  const bills = readCfgTable_("CFG_Bills");
  const alloc = readCfgTable_("CFG_BillProfileAllocations");

  if (!bills || !alloc) {
    throw new Error("Missing CFG_Bills or CFG_BillProfileAllocations");
  }

  const activeBills = bills.rows
    .filter(r => truthy_(r.IsActive))
    .sort((a, b) => Number(a.SortOrder) - Number(b.SortOrder));

  if (activeBills.length > 20) {
    throw new Error(`Too many active bills (${activeBills.length}). Max is 20.`);
  }

  const pctByBillId = {};
  alloc.rows
    .filter(r => String(r.BillProfileId).trim() === billProfileId)
    .forEach(r => {
      pctByBillId[String(r.BillId).trim()] = Number(r.Percent) || 0;
    });

  const names = [];
  const pcts = [];

  activeBills.forEach(b => {
    names.push([String(b.DisplayName)]);
    pcts.push([(pctByBillId[String(b.BillId).trim()] || 0) / 100]);
  });

  // Pad to 20 rows so old data is cleared
  while (names.length < 20) {
    names.push([""]);
    pcts.push([""]);
  }

  // === Guardrailed writes ===
  safeSetValues_(sh, "A7:A26", names);
  safeSetValues_(sh, "B7:B26", pcts);
  sh.getRange("B7:B26").setNumberFormat("0.00%");

  ss.toast(
    `Rendered Bills % Split from config (profile=${billProfileId}, bills=${activeBills.length})`,
    "Budgeter Config",
    5
  );

  return {
    profile: billProfileId,
    count: activeBills.length
  };
}

function Run_RenderBillsSplitFromConfig() {
  return renderBillsSplitInputsFromConfig_();
}
