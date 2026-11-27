import { describe, expect, it, vi } from "vitest";
import {
  ErpApiError,
  isDefinitiveErpApiError,
} from "@/lib/erp/client-api";
import {
  STOCK_RECEIPT_PENDING_TTL_MS,
  confirmStockReceipt,
  confirmStockReceiptResponse,
  getStockReceiptPendingCommand,
  hasPendingStockReceipt,
  markStockReceiptAmbiguous,
  persistStockReceiptDraftIdentity,
  releaseStockReceiptAfterDefinitiveFailure,
  restoreStockReceiptDraftIdentity,
  shouldReleaseStockReceiptAfterFailure,
  type StockReceiptDraftIdentity,
  type StockReceiptPendingStorage,
} from "@/lib/erp/stock-receipt-idempotency";

const firstDraft = {
  itemId: "item-a",
  warehouseId: "warehouse-a",
  quantity: 2,
  unitCost: 12_500,
  date: "2026-07-19",
  memo: "Penerimaan pertama",
};
const productionDraft = {
  ...firstDraft,
  itemId: "30000000-0000-4000-8000-000000000001",
  warehouseId: "40000000-0000-4000-8000-000000000001",
};

const scope = {
  businessId: "10000000-0000-4000-8000-000000000001",
  userId: "20000000-0000-4000-8000-000000000001",
};
const persistedOperationKey = "50000000-0000-4000-8000-000000000001";

function memoryStorage(): StockReceiptPendingStorage {
  const values = new Map<string, string>();

  return {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

describe("stock receipt draft idempotency", () => {
  it("reuses one operation key and the original immutable snapshot after ambiguity", () => {
    const identity: StockReceiptDraftIdentity = { pending: null };
    const generate = vi.fn().mockReturnValue("first-operation-key");
    const first = getStockReceiptPendingCommand(identity, firstDraft, generate);
    const editedDraft = {
      ...firstDraft,
      quantity: 9,
      memo: "Draft diubah setelah response ambigu",
    };

    const retry = getStockReceiptPendingCommand(identity, editedDraft, generate);

    expect(retry).toBe(first);
    expect(retry.operationKey).toBe("first-operation-key");
    expect(retry.payload).toEqual(firstDraft);
    expect(retry.payload).not.toBe(firstDraft);
    expect(Object.isFrozen(retry)).toBe(true);
    expect(Object.isFrozen(retry.payload)).toBe(true);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(hasPendingStockReceipt(identity)).toBe(true);
  });

  it("rotates only after a valid success is confirmed", () => {
    const identity: StockReceiptDraftIdentity = { pending: null };
    const generate = vi
      .fn()
      .mockReturnValueOnce("first-operation-key")
      .mockReturnValueOnce("second-operation-key");

    expect(
      getStockReceiptPendingCommand(identity, firstDraft, generate).operationKey,
    ).toBe("first-operation-key");

    confirmStockReceipt(identity);

    expect(hasPendingStockReceipt(identity)).toBe(false);
    expect(
      getStockReceiptPendingCommand(identity, firstDraft, generate).operationKey,
    ).toBe("second-operation-key");
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("releases the frozen snapshot after a definitive client error", () => {
    const identity: StockReceiptDraftIdentity = { pending: null };
    const generate = vi
      .fn()
      .mockReturnValueOnce("first-operation-key")
      .mockReturnValueOnce("second-operation-key");

    getStockReceiptPendingCommand(identity, firstDraft, generate);
    releaseStockReceiptAfterDefinitiveFailure(identity);

    const next = getStockReceiptPendingCommand(
      identity,
      { ...firstDraft, quantity: 3 },
      generate,
    );

    expect(next.operationKey).toBe("second-operation-key");
    expect(next.payload.quantity).toBe(3);
  });

  it("keeps the pending snapshot for a null or malformed successful response", () => {
    const identity: StockReceiptDraftIdentity = { pending: null };
    getStockReceiptPendingCommand(identity, firstDraft, () => "operation-key");

    expect(confirmStockReceiptResponse(identity, null)).toBeNull();
    expect(confirmStockReceiptResponse(identity, {})).toBeNull();
    expect(hasPendingStockReceipt(identity)).toBe(true);
  });

  it("clears the pending snapshot only after a valid command envelope", () => {
    const identity: StockReceiptDraftIdentity = { pending: null };
    getStockReceiptPendingCommand(
      identity,
      productionDraft,
      () => "operation-key",
    );
    const movementId = "60000000-0000-4000-8000-000000000001";
    const response = {
      movementId,
      created: true,
      replayed: false,
      movement: {
        id: movementId,
        businessId: "10000000-0000-4000-8000-000000000001",
        itemId: productionDraft.itemId,
        warehouseId: productionDraft.warehouseId,
        date: "2026-07-19",
        type: "purchase",
        quantity: 2,
        value: 25_000,
        memo: "Penerimaan pertama",
      },
    };

    expect(confirmStockReceiptResponse(identity, response)).toEqual(response);
    expect(hasPendingStockReceipt(identity)).toBe(false);
  });

  it("restores one scoped command after remount and marks it ambiguous", () => {
    const storage = memoryStorage();
    const beforeUnmount: StockReceiptDraftIdentity = { pending: null };
    const created = getStockReceiptPendingCommand(
      beforeUnmount,
      firstDraft,
      () => persistedOperationKey,
      1_000,
    );

    expect(
      persistStockReceiptDraftIdentity(
        storage,
        scope,
        beforeUnmount,
        1_001,
      ),
    ).toBe(true);

    const restored = restoreStockReceiptDraftIdentity(
      storage,
      scope,
      2_000,
    );
    const anotherBusiness = restoreStockReceiptDraftIdentity(
      storage,
      { ...scope, businessId: "10000000-0000-4000-8000-000000000002" },
      2_000,
    );

    expect(restored.pending).toMatchObject({
      operationKey: created.operationKey,
      payload: firstDraft,
      hadAmbiguousFailure: true,
    });
    expect(anotherBusiness.pending).toBeNull();
  });

  it("retains an expired persisted command as ambiguous until server resolution", () => {
    const storage = memoryStorage();
    const identity: StockReceiptDraftIdentity = { pending: null };
    getStockReceiptPendingCommand(
      identity,
      productionDraft,
      () => persistedOperationKey,
      1_000,
    );
    persistStockReceiptDraftIdentity(storage, scope, identity, 1_001);

    expect(
      restoreStockReceiptDraftIdentity(
        storage,
        scope,
        1_000 + STOCK_RECEIPT_PENDING_TTL_MS,
      ).pending,
    ).toMatchObject({
      operationKey: persistedOperationKey,
      hadAmbiguousFailure: true,
    });
  });

  it.each(["", "   "])(
    "normalizes memo %j before persistence and confirms the server default",
    (memo) => {
      const identity: StockReceiptDraftIdentity = { pending: null };
      const command = getStockReceiptPendingCommand(
        identity,
        { ...productionDraft, memo },
        () => persistedOperationKey,
      );
      const movementId = "60000000-0000-4000-8000-000000000001";
      const response = {
        movementId,
        created: true,
        replayed: false,
        movement: {
          id: movementId,
          businessId: scope.businessId,
          itemId: productionDraft.itemId,
          warehouseId: productionDraft.warehouseId,
          date: productionDraft.date,
          type: "purchase",
          quantity: productionDraft.quantity,
          value: productionDraft.quantity * productionDraft.unitCost,
          memo: "Stok masuk manual",
        },
      };

      expect(command.payload.memo).toBeUndefined();
      expect(
        confirmStockReceiptResponse(identity, response, scope.businessId),
      ).toEqual(response);
      expect(hasPendingStockReceipt(identity)).toBe(false);
    },
  );

  it("keeps the same key when an ambiguous attempt is followed by 401", () => {
    const identity: StockReceiptDraftIdentity = { pending: null };
    const first = getStockReceiptPendingCommand(
      identity,
      firstDraft,
      () => persistedOperationKey,
    );
    markStockReceiptAmbiguous(identity);
    const unauthorized = new ErpApiError("Session expired", 401, null);

    expect(isDefinitiveErpApiError(unauthorized)).toBe(true);
    expect(
      shouldReleaseStockReceiptAfterFailure(identity, {
        definitive: isDefinitiveErpApiError(unauthorized),
        authoritativeConflict: false,
      }),
    ).toBe(false);
    expect(
      getStockReceiptPendingCommand(identity, firstDraft).operationKey,
    ).toBe(first.operationKey);
  });

  it("allows an explicit authoritative conflict to resolve ambiguity", () => {
    const identity: StockReceiptDraftIdentity = { pending: null };
    getStockReceiptPendingCommand(
      identity,
      firstDraft,
      () => persistedOperationKey,
    );
    markStockReceiptAmbiguous(identity);

    expect(
      shouldReleaseStockReceiptAfterFailure(identity, {
        definitive: true,
        authoritativeConflict: true,
      }),
    ).toBe(true);
  });

  it("does not clear a pending command for a response from another business", () => {
    const identity: StockReceiptDraftIdentity = { pending: null };
    getStockReceiptPendingCommand(
      identity,
      firstDraft,
      () => persistedOperationKey,
    );
    const movementId = "60000000-0000-4000-8000-000000000001";

    expect(
      confirmStockReceiptResponse(
        identity,
        {
          movementId,
          created: true,
          replayed: false,
          movement: {
            id: movementId,
            businessId: "10000000-0000-4000-8000-000000000099",
            itemId: productionDraft.itemId,
            warehouseId: productionDraft.warehouseId,
            date: productionDraft.date,
            type: "purchase",
            quantity: productionDraft.quantity,
            value: productionDraft.quantity * productionDraft.unitCost,
            memo: productionDraft.memo,
          },
        },
        scope.businessId,
      ),
    ).toBeNull();
    expect(hasPendingStockReceipt(identity)).toBe(true);
  });
});
