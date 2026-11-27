import { describe, expect, it } from "vitest";
import {
  canonicalizeDecimal,
  canonicalizeStockReceiptAmounts,
} from "@/lib/erp/stock-receipt-decimal";

describe("stock receipt decimal canonicalization", () => {
  it("matches PostgreSQL half-away-from-zero rounding at four decimals", () => {
    expect(canonicalizeDecimal(2.00085, 4)).toMatchObject({
      scaled: BigInt(20_009),
      text: "2.0009",
      value: 2.0009,
    });
    expect(canonicalizeDecimal(2.00084, 4).value).toBe(2.0008);
  });

  it("supports exponent notation without binary floating-point rounding", () => {
    expect(canonicalizeDecimal(5e-5, 4).text).toBe("0.0001");
    expect(canonicalizeDecimal(4e-5, 4).text).toBe("0.0000");
  });

  it("calculates value from the canonical quantity and unit cost", () => {
    const amounts = canonicalizeStockReceiptAmounts(2.00085, 12_500);

    expect(amounts.quantity.value).toBe(2.0009);
    expect(amounts.unitCost.text).toBe("12500.00");
    expect(amounts.value).toMatchObject({
      scaled: BigInt(2_501_125),
      text: "25011.25",
      value: 25_011.25,
    });
  });

  it("uses half-away-from-zero for signed decimals", () => {
    expect(canonicalizeDecimal(-1.005, 2).text).toBe("-1.01");
  });
});
