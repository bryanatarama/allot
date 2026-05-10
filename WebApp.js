/** WebApp.gs — Wrapper-safe Web App (JSONP)
 *
 * UI: /exec
 * JSON API: /exec?api=... (supports JSONP via &jsonp=cbName)
 *
 * Notes:
 * - We DO NOT rely on google.script.run (wrapper breaks it).
 * - index.html calls /exec?api=... via JSONP: <script src="...&jsonp=cbName">
 */

// -------------------------
// Spec version (displayed in-app)
// -------------------------
const SPEC_VERSION =
  "Spec v0.15 (Cloudflare Pages mobile testing alias + begin mobile-first Dashboard layout)";






// -------------------------
// Config write allowlist
// -------------------------
const CONFIG_RANGE_ALLOWLIST = new Set([
  "CFG_META",
  "CFG_CATEGORIES",
  "CFG_ACCOUNTS",
  "CFG_ACCOUNTS_PRIMARY", // Accounts!A1:D5 (header row + 4 rows)
  "CFG_BUCKETS",
  "CFG_BILLS",
  "CFG_BILLSSPLITLINES",
  "CFG_PROFILES",
  "CFG_PROFILE_ALLOCATIONS",
  "CFG_BILLPROFILES",
  "CFG_BILLPROFILEALLOCATIONS",
]);
// ============================================================
// Config — Categories (DocumentProperties, sheet-less storage)
// ============================================================
const CFG_CATEGORIES_STATE_KEY = "BUDGETER_CFG_CATEGORIES_JSON";

function cfg_categoriesDefault_(){
  return {
    version: 1,
    // rows: [ [Name, TargetAccount, Descriptor], ... ] (no header)
    rows: [],
  };
}

function cfg_categoriesNormalize_(obj){
  const out = cfg_categoriesDefault_();
  if (obj && typeof obj === "object") {
    out.version = Number(obj.version) || 1;
    if (Array.isArray(obj.rows)) out.rows = obj.rows;
  }

  // Normalize rows to 3 cols, strings, max 20 (matches UI)
  const norm = [];
  const rows = Array.isArray(out.rows) ? out.rows : [];
  for (let i = 0; i < Math.min(rows.length, 20); i++){
    const r = Array.isArray(rows[i]) ? rows[i] : [];
    norm.push([
      String(r[0] ?? ""),
      String(r[1] ?? ""),
      String(r[2] ?? ""),
    ]);
  }
  out.rows = norm;
  return out;
}
// ============================================================
// Storage Adapter (Shared now, Per-user later)
// ============================================================
const CFG_STORAGE_MODE = "shared"; // "shared" | "user" (later)

function cfg_props_(){
  // Shared across all users of this deployment (current choice)
  if (CFG_STORAGE_MODE === "shared") {
    return PropertiesService.getDocumentProperties();
  }

  // Per-user later (each signed-in user gets their own storage)
  // NOTE: only flip this when you're ready; behavior changes immediately.
  return PropertiesService.getUserProperties();
}

function cfg_getJson_(key, fallbackObj){
  const props = cfg_props_();
  const txt = props.getProperty(key);
  if (!txt) return fallbackObj;
  try { return JSON.parse(txt); }
  catch (e) { return fallbackObj; }
}

function cfg_setJson_(key, obj){
  const props = cfg_props_();
  props.setProperty(key, JSON.stringify(obj));
  return obj;
}

function cfg_categoriesRead_(){
  const obj = cfg_getJson_(CFG_CATEGORIES_STATE_KEY, cfg_categoriesDefault_());
  return cfg_categoriesNormalize_(obj);
}

function cfg_categoriesWrite_(obj){
  const norm = cfg_categoriesNormalize_(obj);
  cfg_setJson_(CFG_CATEGORIES_STATE_KEY, norm);
  return norm;
}
// ============================================================
// Debt Tab Inputs (DocumentProperties, sheet-less storage)
// ============================================================
const CFG_DEBT_ITEMS_STATE_KEY = "BUDGETER_CFG_DEBT_ITEMS_JSON";

function cfg_debtItemsDefault_(){
  return { version: 1, items: [] };
}

function cfg_debtItemsNormalize_(obj){
  const out = cfg_debtItemsDefault_();
  if (obj && typeof obj === "object") {
    out.version = Number(obj.version) || 1;
    if (Array.isArray(obj.items)) out.items = obj.items;
  }

  // Normalize: array of objects; cap to 20 rows (spec-ish; adjust later if needed)
  const items = Array.isArray(out.items) ? out.items : [];
  const norm = [];
  for (let i = 0; i < Math.min(items.length, 20); i++){
    const it = items[i] && typeof items[i] === "object" ? items[i] : {};
    norm.push({
      name: String(it.name ?? ""),
      balance: Number(it.balance || 0) || 0,
      apr: Number(it.apr || 0) || 0,
      min: Number(it.min || 0) || 0,
      weight: Number(it.weight || 0) || 0,
    });
  }
  out.items = norm;
  return out;
}

function cfg_debtItemsRead_(){
  const obj = cfg_getJson_(CFG_DEBT_ITEMS_STATE_KEY, cfg_debtItemsDefault_());
  return cfg_debtItemsNormalize_(obj);
}

function cfg_debtItemsWrite_(obj){
  const norm = cfg_debtItemsNormalize_(obj);
  cfg_setJson_(CFG_DEBT_ITEMS_STATE_KEY, norm);
  return norm;
}

// ============================================================
// Accounts (DocumentProperties, sheet-free)
// ============================================================
const CFG_ACCOUNTS_STATE_KEY = "BUDGETER_CFG_ACCOUNTS_JSON";

function cfg_accountsDefault_(){
  return {
    version: 1,
    // rows: [ [Name, Balance, Type, Notes], ... ] (no header, max 4)
    rows: [],
  };
}

function cfg_accountsNormalize_(obj){
  const out = cfg_accountsDefault_();
  if (obj && typeof obj === "object") {
    out.version = Number(obj.version) || 1;
    if (Array.isArray(obj.rows)) out.rows = obj.rows;
  }
  const norm = [];
  const rows = Array.isArray(out.rows) ? out.rows : [];
  for (let i = 0; i < Math.min(rows.length, 4); i++){
    const r = Array.isArray(rows[i]) ? rows[i] : [];
    norm.push([
      String(r[0] ?? "").trim(),  // Name
      String(r[1] ?? "").trim(),  // Balance
      String(r[2] ?? "").trim(),  // Type
      String(r[3] ?? "").trim(),  // Notes
    ]);
  }
  out.rows = norm;
  return out;
}

function cfg_accountsRead_(){
  const obj = cfg_getJson_(CFG_ACCOUNTS_STATE_KEY, cfg_accountsDefault_());
  return cfg_accountsNormalize_(obj);
}

function cfg_accountsWrite_(obj){
  const norm = cfg_accountsNormalize_(obj);
  cfg_setJson_(CFG_ACCOUNTS_STATE_KEY, norm);
  return norm;
}

function web_cfgAccountsGet_(){
  return { ok: true, now: new Date().toISOString(), state: cfg_accountsRead_() };
}

function web_cfgAccountsSet_(payloadText){
  if (!payloadText) throw new Error("Missing payload");
  let payload;
  try { payload = JSON.parse(payloadText); }
  catch(e){ throw new Error("Invalid JSON in payload"); }

  const incoming = (payload && payload.state) ? payload.state : payload;
  const rows = incoming && Array.isArray(incoming.rows) ? incoming.rows : null;
  if (!rows) throw new Error("payload.rows must be an array");

  for (const r of rows){
    if (!Array.isArray(r)) continue;
    for (const cell of r){
      if (String(cell ?? "").trim().startsWith("=")) throw new Error("Formulas are not allowed.");
    }
  }
  const next = cfg_accountsWrite_({ version: 1, rows });
  return { ok: true, now: new Date().toISOString(), state: next };
}

// One-time migrate from sheet named range CFG_ACCOUNTS_PRIMARY into DocumentProperties
function web_cfgAccountsMigrateFromSheet_(){
  const sheet = web_readNamedRangeTable_("CFG_ACCOUNTS_PRIMARY");
  const rows = Array.isArray(sheet.rows) ? sheet.rows : [];
  const next = cfg_accountsWrite_({ version: 1, rows });
  return { ok: true, now: new Date().toISOString(), migrated: true, state: next };
}
// ============================================================
// Bills % Split Monthly Targets (DocumentProperties, sheet-less)
// ============================================================
const CFG_BILLSSPLIT_STATE_KEY = "BUDGETER_CFG_BILLSSPLIT_JSON";

function cfg_billsSplitDefault_(){
  return { version: 1, rows: [] }; // rows: [ [key, monthlyTarget], ... ]
}

function cfg_billsSplitNormalize_(obj){
  const out = cfg_billsSplitDefault_();
  if (obj && typeof obj === "object") {
    out.version = Number(obj.version) || 1;
    if (Array.isArray(obj.rows)) out.rows = obj.rows;
  }

  const norm = [];
  const rows = Array.isArray(out.rows) ? out.rows : [];
  for (let i = 0; i < rows.length; i++){
    const r = Array.isArray(rows[i]) ? rows[i] : [];
    const key = String(r[0] ?? "").trim().toLowerCase();
    if (!key) continue;
    const mt = Number(r[1] || 0) || 0;
    norm.push([key, mt]);
  }

  out.rows = norm;
  return out;
}

function cfg_billsSplitRead_(){
  const obj = cfg_getJson_(CFG_BILLSSPLIT_STATE_KEY, cfg_billsSplitDefault_());
  return cfg_billsSplitNormalize_(obj);
}

function cfg_billsSplitWrite_(obj){
  const norm = cfg_billsSplitNormalize_(obj);
  cfg_setJson_(CFG_BILLSSPLIT_STATE_KEY, norm);
  return norm;
}

function web_billsSplitGet_(){
  return { ok:true, now:new Date().toISOString(), state: cfg_billsSplitRead_() };
}

function web_billsSplitSet_(payloadText){
  if (!payloadText) throw new Error("Missing payload");
  let payload;
  try { payload = JSON.parse(payloadText); }
  catch (e) { throw new Error("Invalid JSON in payload"); }

  const incoming = (payload && payload.state) ? payload.state : payload;
  const rows = incoming && Array.isArray(incoming.rows) ? incoming.rows : null;
  if (!rows) throw new Error("payload.rows must be an array");

  // No formulas guard
  for (const r of rows){
    if (!Array.isArray(r)) continue;
    for (const cell of r){
      const v = String(cell ?? "");
      if (v.trim().startsWith("=")) throw new Error("Formulas are not allowed.");
    }
  }

  const next = cfg_billsSplitWrite_({ version: 1, rows });
  return { ok:true, now:new Date().toISOString(), state: next };
}


function web_debtItemsGet_(){
  return { ok:true, now:new Date().toISOString(), state: cfg_debtItemsRead_() };
}

function web_debtItemsSet_(payloadText){
  if (!payloadText) throw new Error("Missing payload");
  let payload;
  try { payload = JSON.parse(payloadText); }
  catch (e) { throw new Error("Invalid JSON in payload"); }

  const incoming = (payload && payload.state) ? payload.state : payload;
  const items = incoming && Array.isArray(incoming.items) ? incoming.items : null;
  if (!items) throw new Error("payload.items must be an array");

  // No formulas guard (paranoid; mostly strings/numbers anyway)
  for (const it of items){
    if (!it || typeof it !== "object") continue;
    for (const k of Object.keys(it)){
      const v = String(it[k] ?? "");
      if (v.trim().startsWith("=")) throw new Error("Formulas are not allowed.");
    }
  }

  const next = cfg_debtItemsWrite_({ version: 1, items });
  return { ok:true, now:new Date().toISOString(), state: next };
}


// -------------------------
// Standalone Engine State (DocumentProperties)
// -------------------------
const ENGINE_STATE_KEY = "BUDGETER_ENGINE_STATE_JSON";

// ============================================================
// Dashboard App State (Paid MTD + last posted) — NO SHEET WRITES
// ============================================================
const DASH_APP_STATE_KEY = "BUDGETER_DASH_APP_STATE_JSON";

function dash_defaultState_() {
  return {
    version: 1,
    // paidByMonthKey: { "YYYY-MM": { "rent": 123.45, "car": 67.89 } }
    paidByMonthKey: {},
    // lastPosted: { postedAt, monthKey, deposit, totalAllocated, allocations: [{key, category, amount}] }
    lastPosted: null,
  };
}

function dash_readState_() {
  const props = PropertiesService.getDocumentProperties();
  const txt = props.getProperty(DASH_APP_STATE_KEY);
  if (!txt) return dash_defaultState_();
  try {
    const obj = JSON.parse(txt);
    return dash_normalizeState_(obj);
  } catch (e) {
    return dash_defaultState_();
  }
}

function dash_writeState_(stateObj) {
  const norm = dash_normalizeState_(stateObj);
  PropertiesService.getDocumentProperties().setProperty(DASH_APP_STATE_KEY, JSON.stringify(norm));
  return norm;
}

function dash_normalizeState_(obj) {
  const base = dash_defaultState_();
  const out = base;

  if (obj && typeof obj === "object") {
    out.version = Number(obj.version) || 1;

    out.paidByMonthKey = (obj.paidByMonthKey && typeof obj.paidByMonthKey === "object")
      ? obj.paidByMonthKey
      : {};

    out.lastPosted = (obj.lastPosted && typeof obj.lastPosted === "object")
      ? obj.lastPosted
      : null;
  }

  // Ensure paidByMonthKey is a plain object-of-objects
  if (!out.paidByMonthKey || typeof out.paidByMonthKey !== "object") out.paidByMonthKey = {};
  for (const k of Object.keys(out.paidByMonthKey)) {
    const v = out.paidByMonthKey[k];
    if (!v || typeof v !== "object") out.paidByMonthKey[k] = {};
  }

  return out;
}

function dash_key_(s) {
  return String(s || "").trim().toLowerCase();
}
function web_cfgCategoriesGet_(){
  return { ok:true, now:new Date().toISOString(), state: cfg_categoriesRead_() };
}

function web_cfgCategoriesSet_(payloadText){
  if (!payloadText) throw new Error("Missing payload");
  let payload;
  try { payload = JSON.parse(payloadText); }
  catch (e) { throw new Error("Invalid JSON in payload"); }

  // Accept either {rows:[...]} or {state:{rows:[...]}}
  const incoming = (payload && payload.state) ? payload.state : payload;
  const rows = incoming && Array.isArray(incoming.rows) ? incoming.rows : null;
  if (!rows) throw new Error("payload.rows must be an array");

  // No formulas guard
  for (const r of rows){
    if (!Array.isArray(r)) continue;
    for (const cell of r){
      const v = String(cell ?? "");
      if (v.trim().startsWith("=")) throw new Error("Formulas are not allowed.");
    }
  }

  const next = cfg_categoriesWrite_({ version:1, rows });
  return { ok:true, now:new Date().toISOString(), state: next };
}

// Optional: one-time migrate FROM sheet named range CFG_CATEGORIES into DocumentProperties
function web_cfgCategoriesMigrateFromSheet_(){
  const sheet = web_readNamedRangeTable_("CFG_CATEGORIES"); // already exists + allowlisted read
  const rows = Array.isArray(sheet.rows) ? sheet.rows : [];
  const next = cfg_categoriesWrite_({ version:1, rows });
  return { ok:true, now:new Date().toISOString(), migrated:true, state: next };
}

// ---- Dashboard App API functions ----

function web_dashboardAppGet_() {
  return { ok: true, now: new Date().toISOString(), state: dash_readState_() };
}

function web_dashboardAppPostDeposit_(payloadText) {
  if (!payloadText) throw new Error("Missing payload");
  let payload;
  try { payload = JSON.parse(payloadText); }
  catch (e) { throw new Error("Invalid JSON in payload"); }

  const monthKey = String(payload.monthKey || "").trim(); // e.g. "2026-01"
  if (!monthKey) throw new Error("payload.monthKey is required");

  const deposit = Number(payload.deposit || 0) || 0;
  const allocations = Array.isArray(payload.allocations) ? payload.allocations : [];

  const state = dash_readState_();
  state.paidByMonthKey[monthKey] = state.paidByMonthKey[monthKey] || {};

  let totalAllocated = 0;

  for (const a of allocations) {
    const key = dash_key_(a.key || a.category);
    const amt = Number(a.amount || 0) || 0;
    if (!key) continue;

    totalAllocated += amt;
    const prev = Number(state.paidByMonthKey[monthKey][key] || 0) || 0;
    state.paidByMonthKey[monthKey][key] = Math.round((prev + amt) * 100) / 100;
  }

  state.lastPosted = {
    postedAt: payload.postedAt ? String(payload.postedAt) : new Date().toISOString(),
    monthKey,
    deposit: Math.round(deposit * 100) / 100,
    totalAllocated: Math.round(totalAllocated * 100) / 100,
    allocations: allocations.map(a => ({
      key: dash_key_(a.key || a.category),
      category: String(a.category || a.key || "").trim(),
      amount: Math.round((Number(a.amount || 0) || 0) * 100) / 100,
    })),
  };

  const next = dash_writeState_(state);
  return { ok: true, now: new Date().toISOString(), state: next };
}

function web_dashboardAppResetPaidMTD_(payloadText) {
  let payload = {};
  if (payloadText) {
    try { payload = JSON.parse(payloadText); } catch (e) { payload = {}; }
  }

  const monthKey = String(payload.monthKey || "").trim();
  if (!monthKey) throw new Error("payload.monthKey is required");

  const state = dash_readState_();
  state.paidByMonthKey[monthKey] = {}; // ✅ keep monthly targets elsewhere (localStorage)
  state.lastPosted = null;

  const next = dash_writeState_(state);
  return { ok: true, now: new Date().toISOString(), state: next };
}


// -------------------------
// Spreadsheet resolver (still used for current read-only views + import helper)
// -------------------------
function getBudgeterSS_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty("BUDGETER_SPREADSHEET_ID");

  if (id) return SpreadsheetApp.openById(id);

  const bound = SpreadsheetApp.getActiveSpreadsheet();
  if (bound) {
    props.setProperty("BUDGETER_SPREADSHEET_ID", bound.getId());
    return bound;
  }

  throw new Error(
    "No spreadsheet context. Set Script Property BUDGETER_SPREADSHEET_ID to your Budgeter Sheet ID."
  );
}

// -------------------------
// Entry points
// -------------------------
function doGet(e) {
  if (e && e.parameter && e.parameter.api) {
    return web_apiGet_(e);
  }

  const t = HtmlService.createTemplateFromFile("index");
  t.EXEC_URL = ScriptApp.getService().getUrl(); // canonical /exec
  t.BUILD_STAMP = "build-" + new Date().toISOString();
  t.SPEC_VERSION = SPEC_VERSION;
  t.ADMIN_MODE = (e && e.parameter && e.parameter["admin"] === "1") ? "true" : "false";

  return t
    .evaluate()
    .setTitle("Budgeter — Super Alpha (JSONP)")
    .setSandboxMode(HtmlService.SandboxMode.IFRAME);
  

}

function doPost(e) {
  return web_json_({ ok: false, error: "POST not implemented. Use GET /exec?api=..." });
}

// -------------------------
// Helpers (JSON / JSONP)
// -------------------------
function web_json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj, null, 2)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function web_js_(jsText) {
  return ContentService.createTextOutput(jsText).setMimeType(
    ContentService.MimeType.JAVASCRIPT
  );
}

function web_respond_(e, obj) {
  const cb = e && e.parameter ? String(e.parameter.jsonp || "") : "";
  if (cb) {
    const safeCb = cb.replace(/[^\w.$]/g, "");
    return web_js_(`${safeCb}(${JSON.stringify(obj)});`);
  }
  return web_json_(obj);
}
// -------------------------
// Diagnostics / proof endpoints
// -------------------------
function web_pingLite_() {
  return { ok: true, now: new Date().toISOString(), mode: "lite" };
}

function web_has_() {
  return {
    ok: true,
    now: new Date().toISOString(),
    build: "webapp-jsonp-003",
    has: {
      doGet: typeof doGet === "function",
      web_apiGet_: typeof web_apiGet_ === "function",
      web_pingLite_: typeof web_pingLite_ === "function",
      web_has_: typeof web_has_ === "function",
      web_getAppState_: typeof web_getAppState_ === "function",
      web_readNamedRangeTable_: typeof web_readNamedRangeTable_ === "function",
      web_debugNamedRange_: typeof web_debugNamedRange_ === "function",
      web_writeNamedRangeTable_: typeof web_writeNamedRangeTable_ === "function",
      web_appendBlankRow_: typeof web_appendBlankRow_ === "function",
      web_runAction_: typeof web_runAction_ === "function",

      // Dashboard read-only
      web_getDashboardReadOnly_: typeof web_getDashboardReadOnly_ === "function",

      // ✅ Debt Split (read-only)
      web_getDebtSplitReadOnly_: typeof web_getDebtSplitReadOnly_ === "function",

      // Dashboard app-state
      web_dashboardAppGet_: typeof web_dashboardAppGet_ === "function",
      web_dashboardAppPostDeposit_: typeof web_dashboardAppPostDeposit_ === "function",
      web_dashboardAppResetPaidMTD_: typeof web_dashboardAppResetPaidMTD_ === "function",

      // Budgeter read-only (sheet-backed)
      web_getSplitterBudgeterReadOnly_: typeof web_getSplitterBudgeterReadOnly_ === "function",
      web_getBillsPctSplitBudgeterReadOnly_: typeof web_getBillsPctSplitBudgeterReadOnly_ === "function",

      // Standalone engine (splitter-only)
      web_engineGetState_: typeof web_engineGetState_ === "function",
      web_engineSetState_: typeof web_engineSetState_ === "function",
      web_engineResetState_: typeof web_engineResetState_ === "function",
      web_engineImportSplitterFromSheet_: typeof web_engineImportSplitterFromSheet_ === "function",
      web_engineComputeSplitter_: typeof web_engineComputeSplitter_ === "function",
      web_billsSplitGet_: typeof web_billsSplitGet_ === "function",
web_billsSplitSet_: typeof web_billsSplitSet_ === "function",
web_cfgCategoriesGet_: typeof web_cfgCategoriesGet_ === "function",
web_cfgCategoriesSet_: typeof web_cfgCategoriesSet_ === "function",
web_debtItemsGet_: typeof web_debtItemsGet_ === "function",
web_debtItemsSet_: typeof web_debtItemsSet_ === "function",

    },
  };
}

function web_listServerFns_() {
  return {
    ok: true,
    now: new Date().toISOString(),
    version: "webapp-jsonp-003",
    has: web_has_().has,
  };
}

// -------------------------
// App state (DocumentProperties, sheet-free)
// -------------------------
function web_getAppState_() {
  const props = PropertiesService.getDocumentProperties();
  const cats = cfg_categoriesRead_();
  const bills = cfg_billsSplitRead_();
  const debt = cfg_debtItemsRead_();
  return {
    specVersion: SPEC_VERSION,
    source: "documentProperties",
    baselineMonthKey: props.getProperty("BUDGETER_BASELINE_MONTH_KEY") || "",
    counts: {
      categories: Array.isArray(cats.rows) ? cats.rows.length : 0,
      billsTargets: Array.isArray(bills.rows) ? bills.rows.length : 0,
      debtItems: Array.isArray(debt.items) ? debt.items.length : 0,
    },
  };
}

// ============================================================
// Dashboard Phase 1 — READ-ONLY (DocumentProperties, sheet-free)
// ============================================================
function web_getDashboardReadOnly_() {
  // The frontend only needs ok:true to show "Server: OK" / "Sheets: Connected".
  // All actual dashboard rendering uses DocumentProperties (categories, billsSplit,
  // dashboardApp paid-MTD state) — none of which require the sheet.
  const cats = cfg_categoriesRead_();
  const bills = cfg_billsSplitRead_();
  return {
    ok: true,
    now: new Date().toISOString(),
    specVersion: SPEC_VERSION,
    source: "documentProperties",
    summary: {
      categoryCount: Array.isArray(cats.rows) ? cats.rows.length : 0,
      billsTargetCount: Array.isArray(bills.rows) ? bills.rows.length : 0,
    },
    // ranges kept as empty stubs so any code reading res.ranges won't throw
    ranges: { summary: { values: [] }, preview: { values: [] }, table: { values: [] } },
  };
}

// ============================================================
// ✅ Debt Split — READ-ONLY (DocumentProperties, sheet-free)
// ============================================================
function web_getDebtSplitReadOnly_() {
  // Debt items are stored in DocumentProperties via debtItemsGet/Set.
  // KPI calculations (minimums, shortfall, etc.) are done client-side.
  const state = cfg_debtItemsRead_();
  const items = Array.isArray(state.items) ? state.items : [];
  return {
    ok: true,
    now: new Date().toISOString(),
    source: "documentProperties",
    specVersion: SPEC_VERSION,
    itemCount: items.length,
    items,
    kpis: { debtPool: {}, totalMinimums: {}, extraAfterMin: {}, minShortfall: {} },
    table: { header: [], rows: [] },
  };
}
// ============================================================
// Budgeter Phase 1 — Splitter (DocumentProperties, sheet-free)
// ============================================================
function web_getSplitterBudgeterReadOnly_() {
  const state = engine_readState_();
  const splitter = state.splitter || {};
  const deposit = splitter.deposit || 0;
  const rows = Array.isArray(splitter.rows) ? splitter.rows : [];

  // Return same shape as the old sheet-backed version so the UI needs no changes
  return {
    ok: true,
    now: new Date().toISOString(),
    source: "documentProperties",
    ranges: {
      deposit: {
        a1: "engine",
        displayValue: deposit === 0 ? "" : String(deposit),
        rawValue: deposit,
        numberFormat: "General",
      },
      basePct: {
        a1: "engine",
        values: rows.map(r => [String(r.category || ""), String(r.pct || "")]),
      },
    },
  };
}

// ============================================================
// Budgeter Phase 1 — Bills % Split (DocumentProperties, sheet-free)
// ============================================================
function web_getBillsPctSplitBudgeterReadOnly_() {
  // Categories: rows = [[Name, TargetAccount, Descriptor], ...]
  const catState = cfg_categoriesRead_();
  const catRows = Array.isArray(catState.rows) ? catState.rows : [];

  // Build a lookup: key (lowercase name) -> { name, descriptor }
  const catByKey = {};
  for (const r of catRows) {
    const name = String(r[0] ?? "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    catByKey[key] = { name, descriptor: String(r[2] ?? "").trim() };
  }

  // Bills % Split targets: rows = [[key, monthlyTarget], ...]
  const splitState = cfg_billsSplitRead_();
  const splitRows = Array.isArray(splitState.rows) ? splitState.rows : [];

  // Build output rows: [Category, Descriptor, Percent, AmountFromDeposit, MonthlyTarget]
  // Percent and AmountFromDeposit were sheet-computed formulas never used by the engine —
  // we omit them (empty string) since all allocation math uses monthlyTarget + descriptor.
  const outRows = [];
  for (const sr of splitRows) {
    const key = String(sr[0] ?? "").trim().toLowerCase();
    if (!key) continue;
    const mt = Number(sr[1] || 0) || 0;
    const cat = catByKey[key] || {};
    const name = cat.name || key; // fall back to key if category not found in cfg
    const descriptor = cat.descriptor || "";
    outRows.push([name, descriptor, "", "", String(mt)]);
  }

  return {
    ok: true,
    now: new Date().toISOString(),
    source: "documentProperties",
    columns: ["Category", "Descriptor", "Percent", "Amount from Deposit", "Monthly Target"],
    rows: outRows,
  };
}

// ============================================================
// Standalone Engine — Splitter-only (NO SHEET REQUIRED)
// ============================================================

function engine_defaultState_() {
  return {
    version: 1,
    splitter: {
      deposit: 0,
      rows: [
        { category: "Bills",    pct: "85%"  },
        { category: "Debt",     pct: "10%"  },
        { category: "Savings",  pct: "2.5%" },
        { category: "Spending", pct: "2.5%" },
      ],
    },
  };
}

function engine_readState_() {
  const props = PropertiesService.getDocumentProperties();
  const txt = props.getProperty(ENGINE_STATE_KEY);
  if (!txt) return engine_defaultState_();

  try {
    const obj = JSON.parse(txt);
    return engine_normalizeState_(obj);
  } catch (e) {
    return engine_defaultState_();
  }
}

function engine_writeState_(stateObj) {
  const norm = engine_normalizeState_(stateObj);
  const props = PropertiesService.getDocumentProperties();
  props.setProperty(ENGINE_STATE_KEY, JSON.stringify(norm));
  return norm;
}

function engine_applyPctDefaults_(out) {
  const defaults = ["85%", "10%", "2.5%", "2.5%"];
  if (!out.splitter || !Array.isArray(out.splitter.rows)) return out;

  while (out.splitter.rows.length < 4) out.splitter.rows.push({ category: "", pct: "" });
  out.splitter.rows = out.splitter.rows.slice(0, 4);

  for (let i = 0; i < 4; i++) {
    const r = out.splitter.rows[i] || {};
    const pct = String(r.pct ?? "").trim();
    if (!pct) out.splitter.rows[i].pct = defaults[i];
  }
  return out;
}

function engine_normalizeState_(obj) {
  const base = engine_defaultState_();
  const out = base;

  if (obj && typeof obj === "object") {
    if (obj.version) out.version = Number(obj.version) || 1;

    if (obj.splitter && typeof obj.splitter === "object") {
      const s = obj.splitter;

      out.splitter.deposit = (s.deposit === "" || s.deposit === null || s.deposit === undefined)
        ? 0
        : Number(s.deposit) || 0;

      const rows = Array.isArray(s.rows) ? s.rows : [];
      out.splitter.rows = [];
      for (let i = 0; i < 4; i++) {
        const r = rows[i] || {};
        out.splitter.rows.push({
          category: String(r.category ?? ""),
          pct: String(r.pct ?? ""),
        });
      }
    }
  }

  // ✅ Ensure base % defaults always exist (prevents reset wiping)
  engine_applyPctDefaults_(out);

  return out;
}
function engine_parsePct_(v) {
  if (v === null || v === undefined) return 0;
  const s = String(v).trim();
  if (!s) return 0;

  const hasPct = s.includes("%");
  const cleaned = s.replace(/%/g, "").trim();
  let n = Number(cleaned);
  if (!isFinite(n)) return 0;

  if (hasPct) return n / 100;
  if (n > 1 && n <= 100) return n / 100;
  return n;
}

function engine_round2_(x) {
  const n = Number(x) || 0;
  return Math.round(n * 100) / 100;
}

function engine_computeSplitter_(stateObj) {
  const state = engine_normalizeState_(stateObj);
  const deposit = Number(state.splitter.deposit) || 0;

  const allocations = [];
  let total = 0;

  for (let i = 0; i < 4; i++) {
    const r = state.splitter.rows[i] || { category: "", pct: "" };
    const category = String(r.category || "").trim();
    const pctInput = r.pct;

    const pct = engine_parsePct_(pctInput);
    const amount = engine_round2_(deposit * pct);

    total += amount;

    allocations.push({
      index: i + 1,
      category,
      pctInput: String(pctInput ?? ""),
      pctDecimal: pct,
      amount,
    });
  }

  const totalAllocated = engine_round2_(total);
  const remainder = engine_round2_(deposit - totalAllocated);

  return {
    ok: true,
    now: new Date().toISOString(),
    engine: "splitter",
    state,
    result: {
      deposit,
      allocations,
      totalAllocated,
      remainder,
    },
  };
}

// ---- Engine API wrappers ----

function web_engineGetState_() {
  return { ok: true, now: new Date().toISOString(), state: engine_readState_() };
}

function web_engineSetState_(payloadText) {
  if (!payloadText) throw new Error("Missing payload");
  let payload;
  try { payload = JSON.parse(payloadText); }
  catch (e) { throw new Error("Invalid JSON in payload"); }

  const nextState = engine_writeState_(payload && payload.state ? payload.state : payload);
  return { ok: true, now: new Date().toISOString(), state: nextState };
}

function web_engineResetState_() {
  const next = engine_writeState_(engine_defaultState_());
  return { ok: true, now: new Date().toISOString(), state: next };
}

function web_engineImportSplitterFromSheet_() {
  const ss = getBudgeterSS_();
  const sh = ss.getSheetByName("Splitter");
  if (!sh) throw new Error('Sheet "Splitter" not found');

  const dep = sh.getRange("B8").getValue();
  const base = sh.getRange("E9:F12").getValues();

  const state = engine_readState_();
  state.splitter.deposit = Number(dep) || 0;

  for (let i = 0; i < 4; i++) {
    const row = base[i] || ["", ""];
    state.splitter.rows[i] = {
      category: String(row[0] ?? ""),
      pct: String(row[1] ?? ""),
    };
  }

  const next = engine_writeState_(state);
  return { ok: true, now: new Date().toISOString(), state: next };
}

function web_engineComputeSplitter_(payloadText) {
  let state = null;

  if (payloadText) {
    try {
      const payload = JSON.parse(payloadText);
      state = payload && payload.state ? payload.state : payload;
    } catch (e) {
      throw new Error("Invalid JSON in payload");
    }
  } else {
    state = engine_readState_();
  }

  return engine_computeSplitter_(state);
}

// ============================================================
// Named range table helpers
// ============================================================

function web_readNamedRangeTable_(rangeName) {
  const ss = getBudgeterSS_();
  const r = ss.getRangeByName(rangeName);
  if (!r) throw new Error(`Named range not found: ${rangeName}`);

  const values = r.getValues();
  const headers = values[0].map((h) => String(h || "").trim());
  const rows = values.slice(1).map((row) => row.map((v) => (v === null ? "" : v)));

  return {
    ok: true,
    rangeName,
    a1: r.getA1Notation(),
    sheetName: r.getSheet().getName(),
    headers,
    rows,
  };
}

function web_debugNamedRange_(rangeName) {
  const ss = getBudgeterSS_();
  const r = ss.getRangeByName(rangeName);
  if (!r) {
    return {
      ok: false,
      error: `Range not found: ${rangeName}`,
      available: ss
        .getNamedRanges()
        .map((nr) => nr.getName())
        .sort(),
    };
  }
  return {
    ok: true,
    rangeName,
    sheetName: r.getSheet().getName(),
    a1: r.getA1Notation(),
    numRows: r.getNumRows(),
    numCols: r.getNumCols ? r.getNumCols() : r.getNumColumns(),
  };
}

function web_writeNamedRangeTable_(rangeName, rows) {
  const ss = getBudgeterSS_();

  if (!CONFIG_RANGE_ALLOWLIST.has(rangeName)) {
    throw new Error(`Refusing to write: ${rangeName} (not in Config allowlist)`);
  }

  const r = ss.getRangeByName(rangeName);
  if (!r) throw new Error(`Named range not found: ${rangeName}`);

  const numCols = r.getNumColumns();
  const numRows = r.getNumRows();
  const bodyRowCount = numRows - 1;

  const normalized = [];
  for (let i = 0; i < bodyRowCount; i++) {
    const src = rows[i] || [];
    const out = [];
    for (let c = 0; c < numCols; c++) out.push(src[c] === undefined ? "" : src[c]);
    normalized.push(out);
  }

  // SPECIAL CASE: CFG_ACCOUNTS_PRIMARY — ONLY write B:D
  if (rangeName === "CFG_ACCOUNTS_PRIMARY") {
    if (numCols < 4) {
      throw new Error(
        `CFG_ACCOUNTS_PRIMARY must span 4 columns (A1:D5). Currently it is ${numCols} column(s) at ${r.getA1Notation()}. ` +
          `Fix the named range to include A1:D5.`
      );
    }

    const bd = [];
    for (let i = 0; i < bodyRowCount; i++) {
      const row = normalized[i] || [];
      bd.push([row[1] ?? "", row[2] ?? "", row[3] ?? ""]);
    }

    r.offset(1, 1, bodyRowCount, 3).setValues(bd);
    return { ok: true, rangeName, wrote: "B:D", a1: r.getA1Notation() };
  }

  r.offset(1, 0, bodyRowCount, numCols).setValues(normalized);
  return { ok: true, rangeName, wrote: "ALL", a1: r.getA1Notation() };
}

function web_appendBlankRow_(rangeName) {
  const t = web_readNamedRangeTable_(rangeName);
  const cols = t.headers.length || (t.rows[0] ? t.rows[0].length : 1);
  const blank = Array(cols).fill("");

  let inserted = false;
  for (let i = 0; i < t.rows.length; i++) {
    const row = t.rows[i];
    const allBlank = row.every((v) => String(v || "").trim() === "");
    if (allBlank) {
      t.rows[i] = blank;
      inserted = true;
      break;
    }
  }
  if (!inserted && t.rows.length) t.rows[t.rows.length - 1] = blank;

  web_writeNamedRangeTable_(rangeName, t.rows);
  return { ok: true, rangeName, insertedIntoEmptyRow: inserted };
}

// -------------------------
// Existing stable actions
// -------------------------
function web_runAction_(actionName) {
  const ss = SpreadsheetApp.getActive();
  const ACTIONS = {
    "Sync Accounts": () => pushAccountsToSystem_(),
    "Sync Dashboard Balances": () => syncBalancesFromDashboard_(),
    "Set Monthly Baseline": () => setMonthlyBaseline_(ss),
    "Clear Monthly Baseline (Dev/Test)": () => {
      PropertiesService.getDocumentProperties().deleteProperty("BUDGETER_BASELINE_MONTH");
      ss.toast("Baseline month cleared.", "Budgeter", 4);
    },
    "Reset Bills % Split Paid MTD": () => resetBillsPctCoreFormulas_(),
    "Run Spreadsheet Audit": () => runSpreadsheetAudit_(),
    "Run Read-Only Audit → AUDIT_REPORT": () => auditWorkbook_readOnly_(),
    "Run Tests → TEST_REPORT": () => runAllTests_(),
  };

  const fn = ACTIONS[actionName];
  if (!fn) throw new Error(`Unknown action: ${actionName}`);

  return withLock_(ss, () => {
    fn();
    return { ok: true, actionName };
  });
}

// One-time init helper
function web_initSpreadsheetId_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error("Run this once from the spreadsheet-bound script context.");
  PropertiesService.getScriptProperties().setProperty("BUDGETER_SPREADSHEET_ID", ss.getId());
}
function Init_WebApp_Spreadsheet_ID() {
  web_initSpreadsheetId_();
}

// ============================================================
// Ideas (DocumentProperties — mobile capture app)
// ============================================================
const CFG_IDEAS_KEY = "BUDGETER_IDEAS_JSON";

function web_ideasGet_() {
  const raw = PropertiesService.getDocumentProperties().getProperty(CFG_IDEAS_KEY);
  const ideas = raw ? JSON.parse(raw) : [];
  return { ok: true, now: new Date().toISOString(), ideas };
}

function web_ideasSet_(payloadText) {
  if (!payloadText) throw new Error("Missing payload");
  const payload = JSON.parse(payloadText);
  const ideas = Array.isArray(payload.ideas) ? payload.ideas : [];
  PropertiesService.getDocumentProperties().setProperty(CFG_IDEAS_KEY, JSON.stringify(ideas));
  return { ok: true, now: new Date().toISOString(), count: ideas.length };
}

function MigrateAccountsFromSheet() {
  const result = web_cfgAccountsMigrateFromSheet_();
  Logger.log(JSON.stringify(result, null, 2));
}

// ============================================================
// Bills % Split Monthly Targets — optional migrate from sheet
// ============================================================
function web_billsSplitMigrateFromSheet_(){
  const ss = getBudgeterSS_();
  const sh = ss.getSheetByName("Bills % Split");
  if (!sh) throw new Error('Sheet "Bills % Split" not found');

  // Matches your read-only range: A6:H26
  const a1 = "A6:H26";
  const dv = sh.getRange(a1).getDisplayValues();

  const rows = [];
  for (let i = 0; i < dv.length; i++){
    const row = dv[i] || [];
    const category = String(row[0] ?? "").trim();     // A
    const monthlyTargetTxt = String(row[3] ?? "").trim(); // D
    if (!category) continue;
    if (category.toLowerCase() === "category") continue;

    const key = category.toLowerCase();
    const mt = Number(String(monthlyTargetTxt).replace(/[^0-9.\-]/g, "")) || 0;
    rows.push([key, mt]);
  }

  const next = cfg_billsSplitWrite_({ version: 1, rows });
  return { ok:true, now:new Date().toISOString(), migrated:true, fromA1:a1, state: next };
}

// -------------------------
// GET API router
// -------------------------
function web_apiGet_(e) {
  try {
    const api = String(e && e.parameter && e.parameter.api ? e.parameter.api : "").trim();
    // --- Config: Categories (DocumentProperties, sheet-less) ---
    if (api === "cfgCategoriesGet" || api === "cfg.categories.get") {
      return web_respond_(e, web_cfgCategoriesGet_());
    }
    if (api === "cfgCategoriesSet" || api === "cfg.categories.set") {
      const payloadText = String(e.parameter && e.parameter.payload ? e.parameter.payload : "");
      return web_respond_(e, web_cfgCategoriesSet_(payloadText));
    }
    if (api === "cfgCategoriesMigrateFromSheet" || api === "cfg.categories.migrateFromSheet") {
      return web_respond_(e, web_cfgCategoriesMigrateFromSheet_());
    }
    if (api === "billsSplitMigrateFromSheet" || api === "cfg.billsSplit.migrateFromSheet") {
  return web_respond_(e, web_billsSplitMigrateFromSheet_());
}

// --- Bills % Split targets (DocumentProperties, sheet-less) ---
if (api === "billsSplitGet" || api === "cfg.billsSplit.get") {
  return web_respond_(e, web_billsSplitGet_());
}
if (api === "billsSplitSet" || api === "cfg.billsSplit.set") {
  const payloadText = String(e.parameter && e.parameter.payload ? e.parameter.payload : "");
  return web_respond_(e, web_billsSplitSet_(payloadText));
}

    // --- Diagnostics ---
    if (api === "pingLite") return web_respond_(e, web_pingLite_());
    if (api === "has") return web_respond_(e, web_has_());
    if (api === "listServerFns") return web_respond_(e, web_listServerFns_());

    // --- App State ---
    if (api === "getAppState") {
      return web_respond_(e, { ok: true, api, state: web_getAppState_() });
    }

    // --- Dashboard (read-only) ---
    if (api === "getDashboardReadOnly") {
      return web_respond_(e, web_getDashboardReadOnly_());
    }
    // Alias (additive)
    if (api === "dashboard.get") {
      return web_respond_(e, web_getDashboardReadOnly_());
    }

    // ✅ Debt Split (read-only) ---
    if (api === "getDebtSplitReadOnly" || api === "debtSplit.get") {
      return web_respond_(e, web_getDebtSplitReadOnly_());
    }

    // --- Dashboard App (Paid MTD state) ---
    if (api === "dashboardAppGet" || api === "dashboard.app.get") {
      return web_respond_(e, web_dashboardAppGet_());
    }
    if (api === "dashboardAppPostDeposit" || api === "dashboard.app.postDeposit") {
      const payloadText = String(e.parameter && e.parameter.payload ? e.parameter.payload : "");
      return web_respond_(e, web_dashboardAppPostDeposit_(payloadText));
    }
    if (api === "dashboardAppResetPaidMTD" || api === "dashboard.app.resetPaidMTD") {
      const payloadText = String(e.parameter && e.parameter.payload ? e.parameter.payload : "");
      return web_respond_(e, web_dashboardAppResetPaidMTD_(payloadText));
    }

    // --- Budgeter (sheet-backed read-only) ---
    if (api === "getSplitterBudgeterReadOnly") {
      return web_respond_(e, web_getSplitterBudgeterReadOnly_());
    }
    if (api === "getBillsPctSplitBudgeterReadOnly") {
      return web_respond_(e, web_getBillsPctSplitBudgeterReadOnly_());
    }

    // --- Standalone Engine (splitter-only) ---
    if (api === "engineGetState") {
      return web_respond_(e, web_engineGetState_());
    }
    if (api === "engineSetState") {
      const payloadText = String(e.parameter && e.parameter.payload ? e.parameter.payload : "");
      return web_respond_(e, web_engineSetState_(payloadText));
    }
    if (api === "engineResetState") {
      return web_respond_(e, web_engineResetState_());
    }
    if (api === "engineImportSplitterFromSheet") {
      return web_respond_(e, web_engineImportSplitterFromSheet_());
    }
    if (api === "engineComputeSplitter") {
      const payloadText = String(e.parameter && e.parameter.payload ? e.parameter.payload : "");
      return web_respond_(e, web_engineComputeSplitter_(payloadText));
    }
    // --- Debt Tab Inputs (DocumentProperties, sheet-less) ---
    if (api === "debtItemsGet" || api === "cfg.debt.items.get") {
      return web_respond_(e, web_debtItemsGet_());
    }
    if (api === "debtItemsSet" || api === "cfg.debt.items.set") {
      const payloadText = String(e.parameter && e.parameter.payload ? e.parameter.payload : "");
      return web_respond_(e, web_debtItemsSet_(payloadText));
    }

    // --- Accounts (DocumentProperties, sheet-free) ---
    if (api === "cfgAccountsGet" || api === "cfg.accounts.get") {
      return web_respond_(e, web_cfgAccountsGet_());
    }
    if (api === "cfgAccountsSet" || api === "cfg.accounts.set") {
      const payloadText = String(e.parameter && e.parameter.payload ? e.parameter.payload : "");
      return web_respond_(e, web_cfgAccountsSet_(payloadText));
    }
    if (api === "cfgAccountsMigrateFromSheet" || api === "cfg.accounts.migrateFromSheet") {
      return web_respond_(e, web_cfgAccountsMigrateFromSheet_());
    }

    // --- Ideas (mobile capture app) ---
    if (api === "ideasGet") {
      return web_respond_(e, web_ideasGet_());
    }
    if (api === "ideasSet") {
      const payloadText = String(e.parameter && e.parameter.payload ? e.parameter.payload : "");
      return web_respond_(e, web_ideasSet_(payloadText));
    }

    // --- Named ranges ---
    if (api === "debugNamedRange") {
      const rangeName = String(e.parameter && e.parameter.rangeName ? e.parameter.rangeName : "").trim();
      if (!rangeName) return web_respond_(e, { ok: false, api, error: "Missing rangeName" });
      return web_respond_(e, web_debugNamedRange_(rangeName));
    }

    if (api === "readNamedRangeTable") {
      const rangeName = String(e.parameter && e.parameter.rangeName ? e.parameter.rangeName : "").trim();
      if (!rangeName) return web_respond_(e, { ok: false, api, error: "Missing rangeName" });
      return web_respond_(e, web_readNamedRangeTable_(rangeName));
    }

    if (api === "writeNamedRangeTable") {
      const rangeName = String(e.parameter && e.parameter.rangeName ? e.parameter.rangeName : "").trim();
      if (!rangeName) return web_respond_(e, { ok: false, api, error: "Missing rangeName" });

      const payloadText = String(e.parameter && e.parameter.payload ? e.parameter.payload : "");
      if (!payloadText) return web_respond_(e, { ok: false, api, error: "Missing payload" });

      let payload;
      try {
        payload = JSON.parse(payloadText);
      } catch (err) {
        return web_respond_(e, { ok: false, api, error: "Invalid JSON in payload" });
      }

      const rows = payload && Array.isArray(payload.rows) ? payload.rows : null;
      if (!rows) return web_respond_(e, { ok: false, api, error: "payload.rows must be an array" });

      for (const r of rows) {
        if (!Array.isArray(r)) continue;
        for (const cell of r) {
          const v = String(cell ?? "");
          if (v.trim().startsWith("=")) {
            return web_respond_(e, { ok: false, api, error: "Formulas are not allowed in config tables." });
          }
          


        }
      }

      const result = web_writeNamedRangeTable_(rangeName, rows);
      return web_respond_(e, result);
    }

    return web_respond_(e, { ok: false, error: "Unknown api", api });
  } catch (err) {
    return web_respond_(e, {
      ok: false,
      error: String(err && err.stack ? err.stack : err),
    });
  }
}
