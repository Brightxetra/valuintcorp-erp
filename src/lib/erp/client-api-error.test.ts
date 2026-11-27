import { describe, expect, it } from "vitest";
import {
  ErpApiError,
  hasErpApiErrorCode,
  isDefinitiveErpApiError,
} from "@/lib/erp/client-api";

describe("ERP API error classification", () => {
  it.each([400, 401, 403, 409, 422])(
    "treats a completed %s response as definitive",
    (status) => {
      expect(
        isDefinitiveErpApiError(new ErpApiError("Rejected", status, null)),
      ).toBe(true);
    },
  );

  it.each([408, 425, 429, 500, 502, 503])(
    "keeps request identity after ambiguous or retryable status %s",
    (status) => {
      expect(
        isDefinitiveErpApiError(new ErpApiError("Ambiguous", status, null)),
      ).toBe(false);
    },
  );

  it("does not classify a network failure as a definitive API response", () => {
    expect(isDefinitiveErpApiError(new TypeError("fetch failed"))).toBe(false);
  });

  it("matches only structured ERP API error codes", () => {
    const conflict = new ErpApiError("Conflict", 409, {
      code: "STOCK_RECEIPT_IDEMPOTENCY_CONFLICT",
    });

    expect(
      hasErpApiErrorCode(conflict, [
        "STOCK_RECEIPT_IDEMPOTENCY_CONFLICT",
      ]),
    ).toBe(true);
    expect(
      hasErpApiErrorCode(new ErpApiError("Conflict", 409, null), [
        "STOCK_RECEIPT_IDEMPOTENCY_CONFLICT",
      ]),
    ).toBe(false);
  });
});
