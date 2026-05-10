function renderPreviewToDashboard_(ss, payload) {
  const dash = ss.getSheetByName("Dashboard");
  if (!dash) throw new Error('Sheet "Dashboard" not found');

  const splitter = ss.getSheetByName("Splitter");
  if (!splitter) throw new Error('Sheet "Splitter" not found');

  const { logRow, depositDate } = payload;

  // Always start from a known state
  dash.showRows(11);

  // Deposit source
  const deposit = Number(splitter.getRange("B8").getValue()) || 0;

  // Allocations from Splitter table (keep for Remaining math)
  const bills   = getAllocationFromSplitterTable_(splitter, "Bills");
  const debt    = getAllocationFromSplitterTable_(splitter, "Debt");
  const savings = getAllocationFromSplitterTable_(splitter, "Savings");
  const fun     = getAllocationFromSplitterTable_(splitter, "Fun");

  const remaining = deposit - (bills + debt + savings + fun);

  // Spending transfer from Bills % Split (Food + Gas + Misc rollup)
  const billsPct = ss.getSheetByName("Bills % Split");
  const spendingTransfer =
    billsPct ? (Number(String(billsPct.getRange("B18").getDisplayValue()).replace(/[$,]/g, "")) || 0) : 0;

  // Header values (guardrail-safe)
  safeSetValue_(dash, "G4", depositDate);
  dash.getRange("G4").setNumberFormat("m/d/yyyy");

  safeSetValue_(dash, "G5", logRow);

  // Allocation values (guardrail-safe)
  safeSetValue_(dash, "E5", deposit);
  dash.getRange("E5").setNumberFormat("$#,##0.00");

  safeSetValue_(dash, "E6", bills);
  dash.getRange("E6").setNumberFormat("$#,##0.00");

  safeSetValue_(dash, "E7", debt);
  dash.getRange("E7").setNumberFormat("$#,##0.00");

  safeSetValue_(dash, "E8", spendingTransfer);
  dash.getRange("E8").setNumberFormat("$#,##0.00");

  // Clear E9 (guardrail-safe)
  safeSetValue_(dash, "E9", "");

  // Remaining (auto-hide if ~0)
  const eps = 0.005;
  const remRow = 11;
  const remCell = dash.getRange("E11");

  if (Math.abs(remaining) <= eps) {
    safeSetValue_(dash, "E11", "");
    remCell.setFontColor(null).setFontWeight("normal");
    dash.hideRows(remRow);
  } else {
    dash.showRows(remRow);

    safeSetValue_(dash, "E11", remaining);
    remCell
      .setNumberFormat("$#,##0.00")
      .setFontWeight("bold")
      .setFontColor("#D93025");
  }
}
function clearDashboardPreview_(ss) {
  const dash = ss.getSheetByName("Dashboard");
  if (!dash) return;

  dash.showRows(11);

  ["G4","G5","E5","E6","E7","E8","E9","E11"].forEach(a1 => safeSetValue_(dash, a1, ""));

  dash.getRange("E11").setFontColor(null).setFontWeight("normal");
}
function getAllocationFromSplitterTable_(splitterSheet, categoryName) {
  // E = Category, G = Allocate (This Deposit)
  const data = splitterSheet.getRange("E9:G12").getDisplayValues();

  const target = String(categoryName).trim().toLowerCase();
  for (const row of data) {
    const cat = String(row[0] || "").trim().toLowerCase();   // col E
    const allocStr = String(row[2] || "0");                  // col G
    if (cat === target) {
      return Number(allocStr.replace(/[$,]/g, "")) || 0;
    }
  }
  return 0;
}