function resetBillsPctCoreFormulas_() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName("Bills % Split");
  if (!sh) throw new Error('Sheet "Bills % Split" not found');

  const startRow = 7;
  const endRow = 16;

  // 1) Restore Paid MTD (col D) = Baseline (col E) + Ledger SUMIFS
  for (let r = startRow; r <= endRow; r++) {
    const fPaid = `=IF($A${r}="","", $E${r} + SUMIFS(Ledger!$D:$D, Ledger!$C:$C, $A${r}, Ledger!$A:$A, ">="&Splitter!$B$5, Ledger!$A:$A, "<="&Splitter!$B$6))`;
    sh.getRange(r, 4).setFormula(fPaid); // D
  }

  ss.toast("Bills % Split: Paid MTD formulas reset (D7:D16).", "Budgeter", 4);
}
function seedCfgBillsSplitLinesFromBillsSheet_() {
  const ss = SpreadsheetApp.getActive();

  const bills = ss.getSheetByName("Bills % Split");
  if (!bills) throw new Error('Missing sheet "Bills % Split"');

  const named = ss.getRangeByName("CFG_BillsSplitLines");
  if (!named) throw new Error('Missing named range "CFG_BillsSplitLines"');

  const cfg = named.getValues(); // includes header row
  if (cfg.length < 2) throw new Error('"CFG_BillsSplitLines" must include header + rows');

  // Config writable area excludes header row
  const cfgBody = cfg.slice(1); // rows A127:F146 in your setup
  const ROWS = cfgBody.length;  // should be 20
  const COLS = cfg[0].length;   // should be 6

  // Read Bills % Split baseline inputs
  const cats = bills.getRange("A7:A26").getValues().map(r => String(r[0] || "").trim());
  const wgts = bills.getRange("B7:B26").getValues().map(r => Number(r[0] || 0));
  const tgts = bills.getRange("F7:F26").getValues().map(r => Number(r[0] || 0));

  // Build source rows from Bills sheet (skip blanks)
  const source = [];
  for (let i = 0; i < 20; i++) {
    const category = cats[i];
    if (!category) continue;
    source.push({
      category,
      weight: isFinite(wgts[i]) ? wgts[i] : 0,
      target: isFinite(tgts[i]) ? tgts[i] : 0
    });
  }

  if (source.length === 0) {
    throw new Error('No categories found on Bills % Split!A7:A26 to seed from.');
  }

  // Find empty slots in config body: treat as empty when Category cell is blank
  const emptyIdx = [];
  for (let r = 0; r < ROWS; r++) {
    const existingCategory = String(cfgBody[r][2] || "").trim(); // Category is col C => index 2
    if (!existingCategory) emptyIdx.push(r);
  }

  if (emptyIdx.length === 0) {
    throw new Error('CFG_BillsSplitLines has no empty rows to fill. Clear Category cells for rows you want auto-seeded.');
  }

  // Fill without overwriting existing populated rows
  const toWrite = cfgBody.map(row => row.slice()); // clone
  let sortCounter = 1;

  for (let i = 0; i < source.length && i < emptyIdx.length; i++) {
    const r = emptyIdx[i];
    toWrite[r][0] = sortCounter++;      // Sort (A)
    toWrite[r][1] = true;               // Enabled (B)
    toWrite[r][2] = source[i].category; // Category (C)
    toWrite[r][3] = source[i].weight;   // Weight (D)
    toWrite[r][4] = source[i].target;   // Monthly Target (E)
    // Notes (F) left as-is
  }

  // Write back config body only (exclude header)
  // We write through the named range by taking a subrange starting at row 2
  const dest = named.offset(1, 0, ROWS, COLS);
  dest.setValues(toWrite);
}
function menuSeedBillsSplitConfigFromSheet_() {
  withLock_("Seed CFG_BillsSplitLines from Bills % Split", () => {
    seedCfgBillsSplitLinesFromBillsSheet_();
  });
}
function RUN_SeedBillsSplitConfigFromSheet() {
  seedCfgBillsSplitLinesFromBillsSheet_();
}

