import { describe, expect, it } from "vitest";
import { buildCsvContent } from "@/lib/exports/csv";

describe("CSV export content", () => {
  it("quotes cells and escapes embedded quotes", () => {
    expect(buildCsvContent(["Nama"], [["Dimas, Owner"]])).toBe('"Nama"\r\n"Dimas, Owner"');
    expect(buildCsvContent(["Nama"], [['Dimas "Owner"']])).toBe('"Nama"\r\n"Dimas ""Owner"""');
  });

  it("prefixes formula-like text without changing numeric values", () => {
    expect(buildCsvContent(["Nama", "Jumlah"], [["=1+1", -20]])).toBe('"Nama","Jumlah"\r\n"\'=1+1","-20"');
  });
});
