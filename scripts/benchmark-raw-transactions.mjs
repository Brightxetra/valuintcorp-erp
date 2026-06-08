import { performance } from "node:perf_hooks";

const rowCount = Number(process.argv[2] ?? 10000);
const locationCount = Number(process.argv[3] ?? 5);
const sourceTypes = ["pos_csv", "marketplace_csv", "bank_csv"];

function makeRows(count) {
  return Array.from({ length: count }, (_, index) => {
    const source = sourceTypes[index % sourceTypes.length];
    const day = String((index % 30) + 1).padStart(2, "0");
    const netAmount = 25_000 + (index % 50) * 1_000;

    return {
      locationId: `loc-${index % locationCount}`,
      source,
      transactionDate: `2026-06-${day}`,
      grossAmount: netAmount,
      discountAmount: 0,
      taxAmount: 0,
      netAmount,
      paymentMethod: index % 2 === 0 ? "qris" : "cash",
    };
  });
}

function summarize(rows) {
  const summaries = new Map();

  for (const row of rows) {
    const key = `${row.locationId}|${row.source}|${row.transactionDate}`;
    const existing = summaries.get(key) ?? {
      locationId: row.locationId,
      source: row.source,
      date: row.transactionDate,
      transactionCount: 0,
      grossAmount: 0,
      discountAmount: 0,
      taxAmount: 0,
      netAmount: 0,
      paymentBreakdown: {},
    };

    existing.transactionCount += 1;
    existing.grossAmount += row.grossAmount;
    existing.discountAmount += row.discountAmount;
    existing.taxAmount += row.taxAmount;
    existing.netAmount += row.netAmount;
    existing.paymentBreakdown[row.paymentMethod] = (existing.paymentBreakdown[row.paymentMethod] ?? 0) + row.netAmount;
    summaries.set(key, existing);
  }

  return [...summaries.values()];
}

const start = performance.now();
const rows = makeRows(rowCount);
const generatedAt = performance.now();
const summaries = summarize(rows);
const summarizedAt = performance.now();

console.log(JSON.stringify({
  rowCount,
  locationCount,
  summaryCount: summaries.length,
  generationMs: Math.round(generatedAt - start),
  summaryMs: Math.round(summarizedAt - generatedAt),
  totalMs: Math.round(summarizedAt - start),
}, null, 2));
