/***********************
 * Config.gs — Phase 0
 * - Loads configuration tables from "Config" sheet
 * - Validates schema + mapping
 * - Writes results to "Config_Diagnostics"
 * - Does NOT affect runtime behavior yet
 ***********************/

const CONFIG_SHEET_NAME_ = "Config";
const CONFIG_DIAG_SHEET_NAME_ = "Config_Diagnostics";

/**
 * Reads a named table from the Config sheet.
 * Table format (as you created):
 * Row: [TableName] in A column (e.g. "CFG_Meta")
 * Next row: headers
 * Following rows: data until first blank in col A
 *
 * Returns: { headers: string[], rows: object[] }
 */
function readCfgTable_(tableName) {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(CONFIG_SHEET_NAME_);
  if (!sh) throw new Error(`Missing sheet "${CONFIG_SHEET_NAME_}"`);

  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < 1) throw new Error(`Config sheet is empty`);

  const values = sh.getRange(1, 1, lastRow, lastCol).getValues();

  // Find the table name in column A
  let tableRow = -1;
  for (let r = 0; r < values.length; r++) {
    if (String(values[r][0]).trim() === tableName) {
      tableRow = r + 1; // 1-based row number in sheet
      break;
    }
  }
  if (tableRow < 0) return null;

  const headerRow = tableRow + 1;
  const headers = sh.getRange(headerRow, 1, 1, lastCol).getValues()[0]
    .map(h => String(h).trim())
    .filter(h => h !== "");

  if (headers.length === 0) throw new Error(`Table "${tableName}" has no headers`);

  const dataStart = headerRow + 1;

  // Read until blank in column A
  const out = [];
  for (let r = dataStart; r <= lastRow; r++) {
    const first = sh.getRange(r, 1).getValue();
    if (first === "" || first === null) break;

    const rowVals = sh.getRange(r, 1, 1, headers.length).getValues()[0];
    const obj = {};
    headers.forEach((h, i) => obj[h] = rowVals[i]);
    out.push(obj);
  }

  return { headers, rows: out };
}

function loadConfig_() {
  const meta = readCfgTable_("CFG_Meta");
  const categories = readCfgTable_("CFG_Categories");
  const profiles = readCfgTable_("CFG_Profiles");
  const allocs = readCfgTable_("CFG_ProfileAllocations");
  const accounts = readCfgTable_("CFG_Accounts");
  const mapping = readCfgTable_("CFG_Mapping");

  return {
    meta,
    categories,
    profiles,
    allocs,
    accounts,
    mapping
  };
}

function validateConfig_(cfg) {
  const errors = [];
  const warns = [];

  const req = ["meta", "categories", "profiles", "allocs", "accounts", "mapping"];
  req.forEach(k => {
    if (!cfg[k] || !cfg[k].rows) errors.push(["ERROR", "MissingTable", `Missing CFG table: ${k}`]);
  });
  if (errors.length) return { ok: false, errors, warns };

  const metaMap = {};
  cfg.meta.rows.forEach(r => metaMap[String(r.Key).trim()] = r.Value);

  const maxCategories = Number(metaMap.max_categories) || 20;
  const maxAccounts = Number(metaMap.max_accounts) || 20;

  // Categories
  const catRows = cfg.categories.rows;
  const activeCats = catRows.filter(r => truthy_(r.IsActive));
  if (activeCats.length > maxCategories) {
    errors.push(["ERROR", "Categories", `Active categories (${activeCats.length}) exceed max_categories (${maxCategories})`]);
  }
  uniqueKeyCheck_(activeCats, "CategoryId", "Categories", errors);

  // Profiles
  const profRows = cfg.profiles.rows.filter(r => truthy_(r.IsActive));
  uniqueKeyCheck_(profRows, "ProfileId", "Profiles", errors);

  // Allocations: sums per profile across active categories
  const allocRows = cfg.allocs.rows;
  const allocByProfile = {};
  allocRows.forEach(r => {
    const pid = String(r.ProfileId).trim();
    const cid = String(r.CategoryId).trim();
    if (!pid || !cid) return;
    if (!allocByProfile[pid]) allocByProfile[pid] = {};
    allocByProfile[pid][cid] = Number(r.Percent);
  });

  profRows.forEach(p => {
    const pid = String(p.ProfileId).trim();
    const totalMust = Number(p.TotalMustEqual) || 100;

    let sum = 0;
    const missing = [];

    activeCats.forEach(c => {
      const cid = String(c.CategoryId).trim();
      const v = allocByProfile[pid]?.[cid];
      if (v === undefined || v === null || v === "") missing.push(cid);
      sum += Number(v) || 0;
    });

    if (missing.length) {
      warns.push(["WARN", "ProfileAllocations", `Profile ${pid} missing category rows: ${missing.join(", ")} (treated as 0)`]);
    }

    // Floating tolerance for 2.5 + 2.5 etc.
    if (Math.abs(sum - totalMust) > 0.000001) {
      errors.push(["ERROR", "ProfileAllocations", `Profile ${pid} totals ${sum} but must equal ${totalMust}`]);
    }
  });

  // Accounts
  const acctRows = cfg.accounts.rows;
  const activeAccts = acctRows.filter(r => truthy_(r.IsActive));
  if (activeAccts.length > maxAccounts) {
    errors.push(["ERROR", "Accounts", `Active accounts (${activeAccts.length}) exceed max_accounts (${maxAccounts})`]);
  }
  uniqueKeyCheck_(activeAccts, "AccountId", "Accounts", errors);

  // Mapping keys uniqueness + sheet existence + A1 parseable
  const ss = SpreadsheetApp.getActive();
  const mapRows = cfg.mapping.rows;
  uniqueKeyCheck_(mapRows, "MappingKey", "Mapping", errors);

  mapRows.forEach(r => {
    const key = String(r.MappingKey).trim();
    const shName = String(r.SheetName).trim();
    const a1 = String(r.A1Notation).trim();
    if (!key || !shName || !a1) {
      errors.push(["ERROR", "Mapping", `Mapping row missing required fields: ${JSON.stringify(r)}`]);
      return;
    }
    const sh = ss.getSheetByName(shName);
    if (!sh) {
      errors.push(["ERROR", "Mapping", `MappingKey ${key} refers to missing sheet "${shName}"`]);
      return;
    }
    try {
      sh.getRange(a1); // just parse/validate
    } catch (e) {
      errors.push(["ERROR", "Mapping", `MappingKey ${key} has invalid A1 "${a1}" for sheet "${shName}"`]);
    }
  });

  // Coverage check: ensure mapping includes all WRITE_ALLOWLIST surfaces (Phase 0 safety)
  const coverage = validateMappingCoversAllowlist_();
  coverage.errors.forEach(msg => errors.push(["ERROR", "AllowlistCoverage", msg]));
  coverage.warns.forEach(msg => warns.push(["WARN", "AllowlistCoverage", msg]));

  return { ok: errors.length === 0, errors, warns };
}

function writeConfigDiagnostics_(result) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(CONFIG_DIAG_SHEET_NAME_);
  if (!sh) sh = ss.insertSheet(CONFIG_DIAG_SHEET_NAME_);
  sh.clear();

  sh.getRange("A1").setValue("Config Validation Diagnostics");
  sh.getRange("A2").setValue("Run at:");
  sh.getRange("B2").setValue(new Date());

  sh.getRange("A4:D4").setValues([["Severity", "Area", "Message", "Hint"]]);

  const rows = [];
  (result.errors || []).forEach(e => rows.push([e[0], e[1], e[2], "Fix Config table values / mapping"]));
  (result.warns || []).forEach(w => rows.push([w[0], w[1], w[2], "Review (may be OK)"]));

  if (rows.length) {
    sh.getRange(5, 1, rows.length, 4).setValues(rows);
  } else {
    sh.getRange(5, 1).setValue("No issues found ✅");
  }

  sh.autoResizeColumns(1, 4);
  sh.setFrozenRows(4);
}

function menuValidateConfig_() {
  const cfg = loadConfig_();
  const result = validateConfig_(cfg);
  writeConfigDiagnostics_(result);

  SpreadsheetApp.getActive().toast(
    result.ok ? "Config OK (see Config_Diagnostics)" : "Config has issues (see Config_Diagnostics)",
    "Budgeter Config",
    result.ok ? 4 : 7
  );

  return result;
}

function openConfigDiagnostics_() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(CONFIG_DIAG_SHEET_NAME_);
  if (!sh) {
    SpreadsheetApp.getUi().alert(`Missing sheet "${CONFIG_DIAG_SHEET_NAME_}". Run Validate Config first.`);
    return;
  }
  ss.setActiveSheet(sh);
}

/** Ensures CFG_Mapping has entries matching every WRITE_ALLOWLIST (Phase 0 guard). */
function validateMappingCoversAllowlist_() {
  const errors = [];
  const warns = [];

  const cfg = readCfgTable_("CFG_Mapping");
  if (!cfg) {
    errors.push(`Missing CFG_Mapping table (needed for allowlist coverage check).`);
    return { errors, warns };
  }

  const mapped = new Set(
    cfg.rows.map(r => `${String(r.SheetName).trim()}!${String(r.A1Notation).trim()}`)
  );

  Object.keys(WRITE_ALLOWLIST).forEach(sheetName => {
    (WRITE_ALLOWLIST[sheetName] || []).forEach(a1 => {
      const key = `${sheetName}!${a1}`;
      if (!mapped.has(key)) {
        errors.push(`CFG_Mapping missing allowlisted surface: ${key}`);
      }
    });
  });

  return { errors, warns };
}

/* ===== helpers ===== */

function uniqueKeyCheck_(rows, keyName, area, errors) {
  const seen = new Set();
  rows.forEach(r => {
    const k = String(r[keyName] ?? "").trim();
    if (!k) {
      errors.push(["ERROR", area, `Missing ${keyName} value in row: ${JSON.stringify(r)}`]);
      return;
    }
    if (seen.has(k)) errors.push(["ERROR", area, `Duplicate ${keyName}: ${k}`]);
    seen.add(k);
  });
}

function truthy_(v) {
  return v === true || String(v).toUpperCase() === "TRUE";
}
function getDefaultProfileId_() {
  const cfg = loadConfig_();
  const row = cfg.meta.rows.find(r => String(r.Key).trim() === "default_profile_id");
  if (!row || !row.Value) {
    throw new Error("CFG_Meta missing default_profile_id");
  }
  return String(row.Value).trim();
}
function getDefaultProfileId_() {
  // Uses your existing config loader (preferred).
  // Falls back safely to BASELINE if key missing.
  try {
    const cfg = loadConfig_();
    const row = cfg.meta.rows.find(r => String(r.Key).trim() === "default_profile_id");
    return row && row.Value ? String(row.Value).trim() : "BASELINE";
  } catch (e) {
    return "BASELINE";
  }
}

function seedSplitterConfigFromLiveSheet_() {
  const ss = SpreadsheetApp.getActive();

  const splitter = ss.getSheetByName("Splitter");
  if (!splitter) throw new Error('Missing sheet "Splitter"');

  const rngCats = ss.getRangeByName("CFG_CATEGORIES");
  if (!rngCats) throw new Error('Missing named range "CFG_CATEGORIES"');

  const rngAllocs = ss.getRangeByName("CFG_PROFILE_ALLOCATIONS");
  if (!rngAllocs) throw new Error('Missing named range "CFG_PROFILE_ALLOCATIONS"');

  const profileId = getDefaultProfileId_();

  // ---- Read live Splitter table (per your system map: top-left at E7) ----
  const disp = splitter.getRange("E7:E26").getValues().flat().map(v => String(v || "").trim());
  const pct  = splitter.getRange("G7:G26").getValues().flat().map(v => Number(v || 0));

  const live = [];
  for (let i = 0; i < disp.length; i++) {
    if (!disp[i]) continue;
    live.push({
      sort: i + 1,
      displayName: disp[i],
      percent: isFinite(pct[i]) ? pct[i] : 0
    });
  }
  if (live.length === 0) throw new Error("No categories found in Splitter!E7:E26 to seed from.");

  // ---- Read CFG_CATEGORIES table ----
  const catsVals = rngCats.getValues(); // includes header row
  if (catsVals.length < 2) throw new Error('"CFG_CATEGORIES" must include header + rows');

  const catsHeader = catsVals[0];
  const catsBody = catsVals.slice(1);
  const catsIdx = headerIndexMap_(catsHeader);

  // Required columns
  requireCols_(catsIdx, ["CategoryId", "DisplayName"]);
  // Optional columns we may set if present
  const hasSort = catsIdx.SortOrder != null;
  const hasActive = catsIdx.IsActive != null;
  const hasNotes = catsIdx.Notes != null;
  const hasLedger = catsIdx.LedgerType != null;

  // Build lookup by DisplayName
  const byName = new Map();
  const existingIds = new Set();

  for (let r = 0; r < catsBody.length; r++) {
    const id = String(catsBody[r][catsIdx.CategoryId] || "").trim();
    const name = String(catsBody[r][catsIdx.DisplayName] || "").trim();
    if (id) existingIds.add(id);
    if (name) byName.set(name.toLowerCase(), r);
  }

  // Clone for editing
  const catsOut = catsBody.map(row => row.slice());

  // Upsert categories
  for (const item of live) {
    const key = item.displayName.toLowerCase();
    let rowIdx = byName.get(key);

    if (rowIdx != null) {
      // Update existing row: SortOrder/IsActive (optional)
      if (hasSort) catsOut[rowIdx][catsIdx.SortOrder] = item.sort;
      if (hasActive) catsOut[rowIdx][catsIdx.IsActive] = true;
      continue;
    }

    // Need to add a new category row
    const emptyRow = firstEmptyRowByCol_(catsOut, catsIdx.CategoryId);
    if (emptyRow === -1) {
      throw new Error('CFG_CATEGORIES has no empty rows to seed into (within the named range). Expand the named range downward.');
    }

    const newId = makeUniqueCategoryId_(item.displayName, existingIds);
    existingIds.add(newId);

    catsOut[emptyRow][catsIdx.CategoryId] = newId;
    catsOut[emptyRow][catsIdx.DisplayName] = item.displayName;
    if (hasSort) catsOut[emptyRow][catsIdx.SortOrder] = item.sort;
    if (hasActive) catsOut[emptyRow][catsIdx.IsActive] = true;
    if (hasLedger) catsOut[emptyRow][catsIdx.LedgerType] = "NONE";
    if (hasNotes) catsOut[emptyRow][catsIdx.Notes] = "Seeded from Splitter";

    byName.set(key, emptyRow);
  }

  // Write back CFG_CATEGORIES body
  rngCats.offset(1, 0, catsBody.length, catsHeader.length).setValues(catsOut);

  // ---- Read CFG_PROFILE_ALLOCATIONS table ----
  const allocVals = rngAllocs.getValues();
  if (allocVals.length < 2) throw new Error('"CFG_PROFILE_ALLOCATIONS" must include header + rows');

  const allocHeader = allocVals[0];
  const allocBody = allocVals.slice(1);
  const allocIdx = headerIndexMap_(allocHeader);

  requireCols_(allocIdx, ["ProfileId", "CategoryId", "Percent"]);

  const hasAllocNotes = allocIdx.Notes != null;

  // Build lookup (profileId|categoryId) -> row index
  const allocMap = new Map();
  for (let r = 0; r < allocBody.length; r++) {
    const pid = String(allocBody[r][allocIdx.ProfileId] || "").trim();
    const cid = String(allocBody[r][allocIdx.CategoryId] || "").trim();
    if (pid && cid) allocMap.set(pid + "|" + cid, r);
  }

  const allocOut = allocBody.map(row => row.slice());

  // Upsert allocations for the default profile
  for (const item of live) {
    const cid = catsOut[byName.get(item.displayName.toLowerCase())][catsIdx.CategoryId];
    const k = profileId + "|" + cid;

    const existingRow = allocMap.get(k);
    if (existingRow != null) {
      allocOut[existingRow][allocIdx.Percent] = item.percent;
      if (hasAllocNotes) allocOut[existingRow][allocIdx.Notes] = "Seeded from Splitter";
      continue;
    }

    const emptyRow = firstEmptyRowByCol_(allocOut, allocIdx.CategoryId);
    if (emptyRow === -1) {
      throw new Error('CFG_PROFILE_ALLOCATIONS has no empty rows to seed into (within the named range). Expand the named range downward.');
    }

    allocOut[emptyRow][allocIdx.ProfileId] = profileId;
    allocOut[emptyRow][allocIdx.CategoryId] = cid;
    allocOut[emptyRow][allocIdx.Percent] = item.percent;
    if (hasAllocNotes) allocOut[emptyRow][allocIdx.Notes] = "Seeded from Splitter";

    allocMap.set(k, emptyRow);
  }

  // Write back allocations body
  rngAllocs.offset(1, 0, allocBody.length, allocHeader.length).setValues(allocOut);

  return { ok: true, profileId, liveCount: live.length };
}

// ---------------- helpers ----------------

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
  // Upper snake-case slug
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
