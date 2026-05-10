function snapshotDebtSplit_() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName("Debt Split");
  if (!sh) return { rows: [] };

  const startRow = 4;
  const lastRow = sh.getLastRow();
  if (lastRow < startRow) return { rows: [] };

  const cards = sh.getRange(startRow, 1, lastRow - startRow + 1, 1).getValues();
  let n = 0;
  for (let i = 0; i < cards.length; i++) {
    if (String(cards[i][0]).trim() !== "") n = i + 1;
  }
  if (n === 0) return { rows: [] };

  // A = Card, H = Total Payment (this deposit)
  const data = sh.getRange(startRow, 1, n, 8).getValues();

  const rows = data
    .map(r => ({ card: String(r[0] || "").trim(), total: Number(r[7]) || 0 }))
    .filter(r => r.card && r.total > 0);

  return { rows };
}
function snapshotBillsAllocation_() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName("Bills Allocation");
  if (!sh) return { rows: [] };

  const categories = sh.getRange("A4:A13").getDisplayValues().flat();
  const amountsRaw = sh.getRange("D4:D13").getDisplayValues().flat();

  const rows = [];
  for (let i = 0; i < categories.length; i++) {
    const category = String(categories[i] || "").trim();
    if (!category) continue;

    const amount = Number(String(amountsRaw[i] || "0").replace(/[$,]/g, ""));
    if (!amount) continue;

    rows.push({ category, amount });
  }
  return { rows };
}
/**
 * Ordered, capped, percentage allocation (continuous).
 * Categories are processed top → bottom.
 * Once a category is fully funded, remaining money continues downward.
 */
function DYN_ALLOC(pool, weights, targets, paid) {
  pool = Number(pool || 0);

  // Flatten & coerce
  const wRaw = (weights || []).flat().map(x => Number(x || 0));
  const t = (targets || []).flat().map(x => Number(x || 0));
  const p = (paid || []).flat().map(x => Number(x || 0));

  const n = Math.max(wRaw.length, t.length, p.length);
  const alloc = Array(n).fill(0);

  if (pool <= 0 || n === 0) return alloc.map(x => [x]);

  // Sanitize weights: negative/NaN => 0
  const w = Array(n).fill(0).map((_, i) => {
    const x = Number(wRaw[i] || 0);
    return (isFinite(x) && x > 0) ? x : 0;
  });

  // Remaining need
  const need = Array(n).fill(0).map((_, i) => {
    const ti = Number(t[i] || 0);
    const pi = Number(p[i] || 0);
    const cap = (isFinite(ti) && ti > 0) ? ti : 0;
    const paidVal = (isFinite(pi) && pi > 0) ? pi : 0;
    return Math.max(0, cap - paidVal);
  });

  let remaining = pool;
  const EPS = 1e-9;

  // Iterate redistribution (water-filling)
  for (let iter = 0; iter < 200 && remaining > EPS; iter++) {
    // Active lines (need > 0)
    const active = [];
    for (let i = 0; i < n; i++) {
      if (need[i] > EPS) active.push(i);
    }
    if (active.length === 0) break;

    // Eligible by weight
    let wsum = 0;
    const eligible = [];
    for (const i of active) {
      if (w[i] > EPS) {
        eligible.push(i);
        wsum += w[i];
      }
    }

    // If no weights, fallback to equal split across active needs
    const useEqualSplit = (eligible.length === 0 || wsum <= EPS);

    let spentThisRound = 0;

    if (useEqualSplit) {
      // Equal share among remaining-need lines
      const per = remaining / active.length;
      for (const i of active) {
        if (remaining <= EPS) break;
        const add = Math.min(need[i], per);
        if (add > EPS) {
          alloc[i] += add;
          need[i] -= add;
          remaining -= add;
          spentThisRound += add;
        }
      }
    } else {
      // Weighted shares among eligible, capped by need
      // Use remainingAtStart so shares are consistent within the round
      const remainingAtStart = remaining;

      for (const i of eligible) {
        if (remaining <= EPS) break;

        const share = remainingAtStart * (w[i] / wsum);
        const add = Math.min(need[i], share);

        if (add > EPS) {
          alloc[i] += add;
          need[i] -= add;
          remaining -= add;
          spentThisRound += add;
        }
      }
    }

    // No progress => stop (prevents infinite loops on precision dust)
    if (spentThisRound <= EPS) break;
  }

  // Output as a column
  return alloc.map(x => [x]);
}

