// One-time migration: copies data from GAS DocumentProperties → Cloudflare Worker KV
// Usage from Script Editor:
//   1. Get your session token: in browser console → JSON.parse(localStorage.getItem("BUDGETER_SESSION_V1")).token
//   2. Paste it below as TOKEN, then Run migrateToWorker
//
// Safe to run multiple times — each call just overwrites with the same data.

var MIGRATE_WORKER_URL = "https://lingering-truth-5f8b.bryanatarama.workers.dev";
var TOKEN = ""; // ← paste your session token here before running

function migrateToWorker() {
  if (!TOKEN) { Logger.log("ERROR: paste your session token into the TOKEN variable first."); return; }

  function post_(key, data) {
    var res = UrlFetchApp.fetch(
      MIGRATE_WORKER_URL + "?api=userSet&token=" + encodeURIComponent(TOKEN),
      {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify({ key: key, data: data }),
        muteHttpExceptions: true,
      }
    );
    var body = JSON.parse(res.getContentText());
    Logger.log(key + ": " + (body.ok ? "OK" : "FAILED — " + body.error));
    return body.ok;
  }

  Logger.log("Starting migration...");

  // Categories
  var cats = web_cfgCategoriesGet_();
  post_("categories", cats.state || { rows: [] });

  // Bills split targets
  var bills = web_billsSplitGet_();
  post_("billsSplit", bills.state || { rows: [] });

  // Accounts
  var accts = web_cfgAccountsGet_();
  post_("accounts", accts.state || { rows: [] });

  // Engine state (splitter)
  var engine = web_engineGetState_();
  post_("engineState", engine.state || {});

  // Debt items
  var debt = web_debtItemsGet_();
  post_("debtItems", debt.state || { items: [] });

  Logger.log("Migration complete! Reload the app to see your data.");
}
