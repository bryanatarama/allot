function getDefaultBillProfileId_() {
  const cfg = loadConfig_();
  const row = cfg.meta.rows.find(r => String(r.Key).trim() === "default_bill_profile_id");
  return row && row.Value ? String(row.Value).trim() : "BILLS_BASELINE";
}
function renderBillsPctSplitFromConfig_(ss) {
  const bills = ss.getSheetByName("Bills % Split");
  if (!bills) throw new Error('Missing sheet "Bills % Split"');

  const named = ss.getRangeByName("CFG_BillsSplitLines");
  if (!named) throw new Error('Missing named range "CFG_BillsSplitLines"');

  const cfgValues = named.getValues();
  if (cfgValues.length < 2) throw new Error('"CFG_BillsSplitLines" must include header + at least 1 row');

  // rows after header
    const rows = values
    .map(r => {
      const category = String(r[2] || "").trim();
      const enabledRaw = r[1];

      // Checkbox TRUE is boolean true in Apps Script
      const enabled =
        enabledRaw === true ||
        enabledRaw === 1 ||
        String(enabledRaw).trim().toUpperCase() === "TRUE" ||
        String(enabledRaw).trim().toUpperCase() === "YES";

      return {
        sort: Number(r[0] || 0),
        enabled,
        category,
        weight: Number(r[3] || 0),
        target: Number(r[4] || 0),
      };
    })
    // Critical: require category to be non-blank
    .filter(r => r.enabled && r.category);


  // If nothing enabled, render blanks (this would look like "nothing happened")
  // We'll still proceed.

  validateBillsSplitConfigRows_(rows);

  rows.sort((a, b) => (a.sort || 0) - (b.sort || 0));

  const MAX = 20;
  const outCat = Array.from({ length: MAX }, () => [""]);
  const outWgt = Array.from({ length: MAX }, () => [""]);
  const outTgt = Array.from({ length: MAX }, () => [""]);

  for (let i = 0; i < Math.min(rows.length, MAX); i++) {
    outCat[i][0] = rows[i].category;
    outWgt[i][0] = rows[i].weight;
    outTgt[i][0] = rows[i].target;
  }

  safeSetValues_(bills, "A7:A26", outCat);
  safeSetValues_(bills, "B7:B26", outWgt);
  safeSetValues_(bills, "F7:F26", outTgt);
}

function validateBillsSplitConfigRows_(rows) {
  const errs = [];
  const seen = new Set();

  if (rows.length > 20) errs.push(`Too many enabled rows (${rows.length}). Max is 20.`);

  for (const r of rows) {
    if (!r.category) errs.push("Enabled row missing Category.");

    const key = (r.category || "").toLowerCase();
    if (key) {
      if (seen.has(key)) errs.push(`Duplicate Category: "${r.category}"`);
      seen.add(key);
    }

    if (!(r.weight > 0)) errs.push(`Category "${r.category || "(blank)"}" has Weight <= 0.`);
    if (!isFinite(r.target) || r.target < 0) errs.push(`Category "${r.category || "(blank)"}" has invalid Monthly Target.`);
  }

  if (errs.length) throw new Error("CFG_BillsSplitLines validation failed:\n- " + errs.join("\n- "));
}


function Run_RenderBillsSplitFromConfig() {
  const ss = SpreadsheetApp.getActive();
  withLock_("Render Bills % Split from Config", () => {
    renderBillsPctSplitFromConfig_(ss);
  });
}
function seedSplitterConfigFromLiveSheet_() {
  const ss = SpreadsheetApp.getActive();

  const splitter = ss.getSheetByName("Splitter");
  if (!splitter) throw new Error('Missing sheet "Splitter"');

  const rngCats = ss.getRangeByName("CFG_CATEGORIES");
  if (!rngCats) throw new Error('Missing named range "CFG_CATEGORIES"');

  const rngAllocs = ss.getRangeByName("CFG_PROFILE_ALLOCATIONS");
  if (!rngAllocs) throw new Error('Missing named range "CFG_PROFILE_ALLOCATIONS"');

  // Default allocation profile (from CFG_Meta; falls back to BASELINE)
  let profileId = "BASELINE";
  try {
    const cfg = loadConfig_();
    const row = cfg.meta.rows.find(r => String(r.Key).trim() === "default_profile_id");
    if (row && row.Value) profileId = String(row.Value).trim();
  } catch (e) {
    // keep BASELINE
  }

  // ---- Read live Splitter table (DisplayName in E, Percent in G) ----
  const disp = splitter.getRange("E7:E26").getValues().flat().map(v => String(v || "").trim());
  const pct  = splitter.getRange("G7:G26").getValues().flat().map(v => Number(v || 0));

  const live = [];
  for (let i = 0; i < disp.length; i++) {
   if (!disp[i] || disp[i].toLowerCase() === "category") continue;
    live.push({
      sort: i + 1,
      displayName: disp[i],
      percent: isFinite(pct[i]) ? pct[i] : 0
    });
  }
  if (live.length === 0) throw new Error("No categories found in Splitter!E7:E26 to seed from.");

  // ---- Load CFG_CATEGORIES ----
  const catsVals = rngCats.getValues(); // header + body
  if (catsVals.length < 2) throw new Error('"CFG_CATEGORIES" must include header + rows');

  const catsHeader = catsVals[0];
  const catsBody = catsVals.slice(1);
  const catsIdx = headerIndexMap_(catsHeader);

  requireCols_(catsIdx, ["CategoryId", "DisplayName"]);

  const hasSort   = catsIdx.SortOrder != null;
  const hasActive = catsIdx.IsActive != null;
  const hasNotes  = catsIdx.Notes != null;
  const hasLedger = catsIdx.LedgerType != null;

  // Lookups
  const byName = new Map();     // displayNameLower -> row index
  const existingIds = new Set();

  for (let r = 0; r < catsBody.length; r++) {
    const id = String(catsBody[r][catsIdx.CategoryId] || "").trim();
    const nm = String(catsBody[r][catsIdx.DisplayName] || "").trim();
    if (id) existingIds.add(id);
    if (nm) byName.set(nm.toLowerCase(), r);
  }

  const catsOut = catsBody.map(row => row.slice());

  // Upsert categories
  for (const item of live) {
    const key = item.displayName.toLowerCase();
    let r = byName.get(key);

    if (r != null) {
      if (hasSort) catsOut[r][catsIdx.SortOrder] = item.sort;
      if (hasActive) catsOut[r][catsIdx.IsActive] = true;
      continue;
    }

    const empty = firstEmptyRowByCol_(catsOut, catsIdx.CategoryId);
    if (empty === -1) {
      throw new Error('CFG_CATEGORIES has no empty rows inside its named range. Expand the named range downward.');
    }

    const newId = makeUniqueCategoryId_(item.displayName, existingIds);
    existingIds.add(newId);

    catsOut[empty][catsIdx.CategoryId] = newId;
    catsOut[empty][catsIdx.DisplayName] = item.displayName;
    if (hasSort) catsOut[empty][catsIdx.SortOrder] = item.sort;
    if (hasActive) catsOut[empty][catsIdx.IsActive] = true;
    if (hasLedger) catsOut[empty][catsIdx.LedgerType] = "NONE";
    if (hasNotes) catsOut[empty][catsIdx.Notes] = "Seeded from Splitter";

    byName.set(key, empty);
  }

  // Write CFG_CATEGORIES back (body only)
  rngCats.offset(1, 0, catsBody.length, catsHeader.length).setValues(catsOut);

  // ---- Load CFG_PROFILE_ALLOCATIONS ----
  const allocVals = rngAllocs.getValues();
  if (allocVals.length < 2) throw new Error('"CFG_PROFILE_ALLOCATIONS" must include header + rows');

  const allocHeader = allocVals[0];
  const allocBody = allocVals.slice(1);
  const allocIdx = headerIndexMap_(allocHeader);

  requireCols_(allocIdx, ["ProfileId", "CategoryId", "Percent"]);
  const hasAllocNotes = allocIdx.Notes != null;

  const allocMap = new Map(); // "ProfileId|CategoryId" -> row index
  for (let r = 0; r < allocBody.length; r++) {
    const pid = String(allocBody[r][allocIdx.ProfileId] || "").trim();
    const cid = String(allocBody[r][allocIdx.CategoryId] || "").trim();
    if (pid && cid) allocMap.set(pid + "|" + cid, r);
  }

  const allocOut = allocBody.map(row => row.slice());

  // Upsert allocations for this profile
  for (const item of live) {
    const catRow = byName.get(item.displayName.toLowerCase());
    const cid = String(catsOut[catRow][catsIdx.CategoryId] || "").trim();
    if (!cid) continue;

    const k = profileId + "|" + cid;
    const existingRow = allocMap.get(k);

    if (existingRow != null) {
      allocOut[existingRow][allocIdx.Percent] = item.percent;
      if (hasAllocNotes) allocOut[existingRow][allocIdx.Notes] = "Seeded from Splitter";
      continue;
    }

    const empty = firstEmptyRowByCol_(allocOut, allocIdx.CategoryId);
    if (empty === -1) {
      throw new Error('CFG_PROFILE_ALLOCATIONS has no empty rows inside its named range. Expand the named range downward.');
    }

    allocOut[empty][allocIdx.ProfileId] = profileId;
    allocOut[empty][allocIdx.CategoryId] = cid;
    allocOut[empty][allocIdx.Percent] = item.percent;
    if (hasAllocNotes) allocOut[empty][allocIdx.Notes] = "Seeded from Splitter";

    allocMap.set(k, empty);
  }

  rngAllocs.offset(1, 0, allocBody.length, allocHeader.length).setValues(allocOut);

  return { ok: true, profileId, liveCount: live.length };
}

// ---------- helpers ----------

function headerIndexMap_(headerRow) {
  const m = {};
  for (let c = 0; c < headerRow.length; c++) {
    const k = String(headerRow[c] || "").trim();
    if (k) m[k] = c;
  }
  return m;
}

function requireCols_(idxMap, cols) {
  const missing = cols.filter(c => idxMap[c] == null);
  if (missing.length) throw new Error("Named range header missing required columns: " + missing.join(", "));
}

function firstEmptyRowByCol_(rows, colIdx) {
  for (let r = 0; r < rows.length; r++) {
    if (!String(rows[r][colIdx] || "").trim()) return r;
  }
  return -1;
}

function makeUniqueCategoryId_(displayName, existingIds) {
  let base = String(displayName || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");

  if (!base) base = "CATEGORY";
  if (!/^[A-Z]/.test(base)) base = "CAT_" + base;

  let id = base;
  let i = 2;
  while (existingIds.has(id)) {
    id = base + "_" + i;
    i++;
  }
  return id;
}

function menuSeedSplitterConfigFromSheet_() {
  withLock_("Seed Splitter Config from Live Sheet", () => {
    seedSplitterConfigFromLiveSheet_();
  });
}
