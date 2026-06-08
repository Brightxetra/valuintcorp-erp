import { describe, expect, it } from "vitest";
import { buildRawImportPreview } from "@/lib/erp/import-preview";

const baseInput = {
  businessId: "biz-1",
  locationId: "loc-1",
  source: "pos_csv" as const,
};

describe("raw import CSV preview", () => {
  it("parses valid rows into raw transaction payloads", () => {
    const preview = buildRawImportPreview({
      ...baseInput,
      csvText: [
        "date,external_id,gross_amount,discount_amount,tax_amount,net_amount,payment_method,customer_name,description",
        "2026-06-01,POS-001,100000,5000,0,95000,qris,Walk-in,Penjualan outlet",
        "2026-06-01,POS-002,75000,0,0,75000,cash,Walk-in,Penjualan outlet",
      ].join("\n"),
    });

    expect(preview.totalRows).toBe(2);
    expect(preview.validRows).toBe(2);
    expect(preview.transactions).toHaveLength(2);
    expect(preview.transactions[0]).toMatchObject({
      locationId: "loc-1",
      externalId: "POS-001",
      netAmount: 95_000,
      paymentMethod: "qris",
    });
  });

  it("marks duplicate rows by idempotent fingerprint headers", () => {
    const preview = buildRawImportPreview({
      ...baseInput,
      csvText: [
        "date,external_id,gross_amount,discount_amount,tax_amount,net_amount,payment_method,description",
        "2026-06-01,POS-001,100000,0,0,100000,qris,Penjualan outlet",
        "2026-06-01,POS-001,100000,0,0,100000,qris,Penjualan outlet duplicate",
      ].join("\n"),
    });

    expect(preview.validRows).toBe(1);
    expect(preview.duplicateRows).toBe(1);
    expect(preview.rows.at(-1)).toMatchObject({ status: "duplicate" });
  });

  it("returns validation errors for invalid accounting totals", () => {
    const preview = buildRawImportPreview({
      ...baseInput,
      csvText: [
        "date,external_id,gross_amount,discount_amount,tax_amount,net_amount,payment_method,description",
        "2026-06-01,POS-001,100000,0,0,99000,qris,Penjualan outlet",
      ].join("\n"),
    });

    expect(preview.validRows).toBe(0);
    expect(preview.errorRows).toBe(1);
    expect(preview.rows[0].error).toContain("Gross - diskon + pajak harus sama dengan net amount");
  });

  it("rejects CSV files missing required raw transaction headers", () => {
    const preview = buildRawImportPreview({
      ...baseInput,
      csvText: ["date,external_id,amount", "2026-06-01,POS-001,100000"].join("\n"),
    });

    expect(preview.errors[0]).toContain("Missing headers");
    expect(preview.errorRows).toBe(1);
  });
});
