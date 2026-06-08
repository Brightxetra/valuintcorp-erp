import { describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/import/csv";

describe("csv import parser", () => {
  it("detects missing required headers", () => {
    const result = parseCsv("date,amount\n2026-06-01,1000", ["date", "amount", "description"]);

    expect(result.errors[0]).toContain("Missing headers");
  });

  it("separates duplicate transaction fingerprints", () => {
    const result = parseCsv(
      "date,amount,description,reference\n2026-06-01,1000,Sale,INV-1\n2026-06-01,1000,Sale,INV-1",
      ["date", "amount", "description"],
    );

    expect(result.rows).toHaveLength(1);
    expect(result.duplicates).toHaveLength(1);
  });
});
