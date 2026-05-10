/***********************
 * Phase 1 — Config Shadow Compute
 * No writes to production sheets.
 ***********************/

function computeCategoryAllocationsFromConfig_(depositAmount, profileId) {
  const cfg = loadConfig_();

  const activeCats = cfg.categories.rows
    .filter(r => truthy_(r.IsActive))
    .sort((a, b) => Number(a.SortOrder) - Number(b.SortOrder));

  const allocRows = cfg.allocs.rows
    .filter(r => String(r.ProfileId).trim() === profileId);

  const allocByCat = {};
  allocRows.forEach(r => {
    allocByCat[String(r.CategoryId).trim()] = Number(r.Percent) || 0;
  });

  const results = [];
  let runningTotal = 0;

  activeCats.forEach((cat, idx) => {
    const pct = allocByCat[String(cat.CategoryId).trim()] || 0;

    let amount;
    if (idx === activeCats.length - 1) {
      // last row absorbs rounding
      amount = round2_(depositAmount - runningTotal);
    } else {
      amount = round2_(depositAmount * pct / 100);
      runningTotal += amount;
    }

    results.push({
      categoryId: cat.CategoryId,
      displayName: cat.DisplayName,
      percent: pct,
      amount
    });
  });

  return results;
}

function round2_(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}
function readCurrentSplitterAllocations_() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName("Splitter");
  if (!sh) throw new Error('Missing sheet "Splitter"');

  const startRow = 9;
  const numRows = 4;

  const cats = sh.getRange(`E${startRow}:E${startRow + numRows - 1}`).getValues().flat();
  const pcts = sh.getRange(`F${startRow}:F${startRow + numRows - 1}`).getValues().flat();
  const amts = sh.getRange(`G${startRow}:G${startRow + numRows - 1}`).getValues().flat();

  return cats.map((name, i) => ({
    displayName: name,
    percent: Number(pcts[i]) * 100, // Sheets stores as 0.85
    amount: Number(amts[i]) || 0
  }));
}
function writeConfigShadowComparison_() {
  const ss = SpreadsheetApp.getActive();
  const dash = ss.getSheetByName("Splitter");

  const deposit = Number(dash.getRange("B8").getValue()) || 0;
  const profileId = getDefaultProfileId_();

  const cfgAlloc = computeCategoryAllocationsFromConfig_(deposit, profileId);
  const curAlloc = readCurrentSplitterAllocations_();

  let sh = ss.getSheetByName("CONFIG_SHADOW");
  if (!sh) sh = ss.insertSheet("CONFIG_SHADOW");
  sh.clear();

  sh.getRange("A1:G1").setValues([[
    "Category",
    "Current %",
    "Config %",
    "Current Amount",
    "Config Amount",
    "Delta",
    "OK?"
  ]]);

  const rows = [];

  cfgAlloc.forEach(cfg => {
    const cur = curAlloc.find(c => c.displayName === cfg.displayName) || {};

    const delta = round2_((cur.amount || 0) - cfg.amount);
    const ok = Math.abs(delta) <= 0.01;

    rows.push([
      cfg.displayName,
      cur.percent ?? "",
      cfg.percent,
      cur.amount ?? "",
      cfg.amount,
      delta,
      ok ? "✓" : "❌"
    ]);
  });

  sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  sh.autoResizeColumns(1, rows[0].length);
}

// ---- Public wrapper so it shows up in the Run dropdown ----
function Run_ConfigShadowComparison() {
  return writeConfigShadowComparison_();
}
