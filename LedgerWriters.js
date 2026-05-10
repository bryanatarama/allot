function writeDebtLedger_(ss, depositDate, key, snapshot) {
  const debtLedger = ss.getSheetByName("Debt Ledger");
  if (!debtLedger) throw new Error('Sheet "Debt Ledger" not found');

  const out = (snapshot.rows || []).map(r => [depositDate, key, r.card, r.total]);
  if (!out.length) return;

  debtLedger.getRange(debtLedger.getLastRow() + 1, 1, out.length, 4).setValues(out);
}
function writeBillsLedger_(ss, depositDate, key, snapshot) {
  let ledger = ss.getSheetByName("Ledger");
  if (!ledger) {
    ledger = ss.insertSheet("Ledger");
    ledger.getRange("A1:D1").setValues([["Date", "LogRowKey", "Category", "Amount"]]);
  }

  const out = (snapshot.rows || []).map(r => [depositDate, key, r.category, r.amount]);
  if (!out.length) return;

  ledger.getRange(ledger.getLastRow() + 1, 1, out.length, 4).setValues(out);
}