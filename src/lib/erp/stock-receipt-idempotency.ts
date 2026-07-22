import { z } from "zod";
import {
  createStockReceiptSchema,
  type CreateStockReceiptInput,
} from "@/lib/erp/schemas";
import {
  stockReceiptApiResponseSchema,
  type StockReceiptApiResponse,
} from "@/lib/erp/stock-receipt-command";
import { canonicalizeStockReceiptAmounts } from "@/lib/erp/stock-receipt-decimal";

export const STOCK_RECEIPT_PENDING_TTL_MS = 24 * 60 * 60 * 1_000;
const pendingStorageVersion = 1;
const pendingStoragePrefix = "valuintcorp:stock-receipt:pending:v1";

export type StockReceiptDraftSnapshot = Readonly<{
  itemId: string;
  warehouseId: string;
  quantity: number;
  unitCost: number;
  date: string;
  memo?: string;
}>;

export interface PendingStockReceiptCommand {
  readonly operationKey: string;
  readonly payload: StockReceiptDraftSnapshot;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly hadAmbiguousFailure: boolean;
}

export interface StockReceiptDraftIdentity {
  pending: PendingStockReceiptCommand | null;
}

export interface StockReceiptCommandScope {
  readonly businessId: string;
  readonly userId: string;
}

export interface StockReceiptPendingStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

const persistedPendingSchema = z
  .object({
    version: z.literal(pendingStorageVersion),
    operationKey: z.uuid(),
    payload: createStockReceiptSchema,
    createdAt: z.number().int().nonnegative(),
    expiresAt: z.number().int().positive(),
    hadAmbiguousFailure: z.boolean(),
  })
  .strict();

function snapshotStockReceipt(
  input: CreateStockReceiptInput,
): StockReceiptDraftSnapshot {
  const normalizedMemo = input.memo?.trim();

  return Object.freeze({
    itemId: input.itemId,
    warehouseId: input.warehouseId,
    quantity: input.quantity,
    unitCost: input.unitCost,
    date: input.date,
    memo: normalizedMemo ? normalizedMemo : undefined,
  });
}

function freezePendingStockReceipt(
  pending: PendingStockReceiptCommand,
): PendingStockReceiptCommand {
  return Object.freeze({
    ...pending,
    payload: snapshotStockReceipt(pending.payload),
  });
}

function pendingStorageKey(scope: StockReceiptCommandScope) {
  return `${pendingStoragePrefix}:${encodeURIComponent(scope.businessId)}:${encodeURIComponent(scope.userId)}`;
}

export function getStockReceiptPendingCommand(
  draft: StockReceiptDraftIdentity,
  input: CreateStockReceiptInput,
  generate: () => string = () => crypto.randomUUID(),
  now: number = Date.now(),
): PendingStockReceiptCommand {
  if (
    draft.pending &&
    draft.pending.expiresAt <= now &&
    !draft.pending.hadAmbiguousFailure
  ) {
    draft.pending = null;
  }

  if (!draft.pending) {
    draft.pending = freezePendingStockReceipt({
      operationKey: generate(),
      payload: snapshotStockReceipt(input),
      createdAt: now,
      expiresAt: now + STOCK_RECEIPT_PENDING_TTL_MS,
      hadAmbiguousFailure: false,
    });
  }

  return draft.pending;
}

export function hasPendingStockReceipt(draft: StockReceiptDraftIdentity) {
  return draft.pending !== null;
}

export function confirmStockReceipt(draft: StockReceiptDraftIdentity) {
  draft.pending = null;
}

export function markStockReceiptAmbiguous(
  draft: StockReceiptDraftIdentity,
) {
  if (!draft.pending || draft.pending.hadAmbiguousFailure) return;

  draft.pending = freezePendingStockReceipt({
    ...draft.pending,
    hadAmbiguousFailure: true,
  });
}

export function shouldReleaseStockReceiptAfterFailure(
  draft: StockReceiptDraftIdentity,
  resolution: {
    definitive: boolean;
    authoritativeConflict: boolean;
  },
) {
  return (
    resolution.authoritativeConflict ||
    (resolution.definitive && !draft.pending?.hadAmbiguousFailure)
  );
}

function responseMatchesPendingCommand(
  response: StockReceiptApiResponse,
  pending: PendingStockReceiptCommand,
  expectedBusinessId?: string,
) {
  if ("workspace" in response) {
    return (
      expectedBusinessId === undefined ||
      response.workspace.business.id === expectedBusinessId
    );
  }

  if (
    expectedBusinessId !== undefined &&
    response.movement.businessId !== expectedBusinessId
  ) {
    return false;
  }

  const canonical = canonicalizeStockReceiptAmounts(
    pending.payload.quantity,
    pending.payload.unitCost,
  );

  return (
    response.movement.itemId === pending.payload.itemId &&
    response.movement.warehouseId === pending.payload.warehouseId &&
    response.movement.date === pending.payload.date &&
    response.movement.quantity === canonical.quantity.value &&
    response.movement.value === canonical.value.value &&
    response.movement.memo ===
      (pending.payload.memo ?? "Stok masuk manual")
  );
}

export function confirmStockReceiptResponse(
  draft: StockReceiptDraftIdentity,
  response: unknown,
  expectedBusinessId?: string,
): StockReceiptApiResponse | null {
  const parsed = stockReceiptApiResponseSchema.safeParse(response);

  if (
    !parsed.success ||
    !draft.pending ||
    !responseMatchesPendingCommand(
      parsed.data,
      draft.pending,
      expectedBusinessId,
    )
  ) {
    return null;
  }

  confirmStockReceipt(draft);
  return parsed.data;
}

export function releaseStockReceiptAfterDefinitiveFailure(
  draft: StockReceiptDraftIdentity,
) {
  draft.pending = null;
}

export function persistStockReceiptDraftIdentity(
  storage: StockReceiptPendingStorage,
  scope: StockReceiptCommandScope,
  draft: StockReceiptDraftIdentity,
  now: number = Date.now(),
) {
  const key = pendingStorageKey(scope);

  try {
    if (
      !draft.pending ||
      (draft.pending.expiresAt <= now && !draft.pending.hadAmbiguousFailure)
    ) {
      draft.pending = null;
      storage.removeItem(key);
      return true;
    }

    storage.setItem(
      key,
      JSON.stringify({
        version: pendingStorageVersion,
        ...draft.pending,
      }),
    );
    return true;
  } catch {
    return false;
  }
}

export function restoreStockReceiptDraftIdentity(
  storage: StockReceiptPendingStorage,
  scope: StockReceiptCommandScope,
  now: number = Date.now(),
): StockReceiptDraftIdentity {
  // A persisted command may already have committed before its response was
  // lost. Its identity must survive elapsed wall-clock time until the server
  // returns a correlated replay or an authoritative conflict.
  void now;
  const key = pendingStorageKey(scope);

  try {
    const serialized = storage.getItem(key);
    if (!serialized) return { pending: null };

    const parsed = persistedPendingSchema.safeParse(JSON.parse(serialized));

    if (!parsed.success) {
      storage.removeItem(key);
      return { pending: null };
    }

    return {
      pending: freezePendingStockReceipt({
        ...parsed.data,
        // Surviving a component lifecycle means an in-flight outcome may have
        // been lost, so every restored command is conservatively ambiguous.
        hadAmbiguousFailure: true,
      }),
    };
  } catch {
    try {
      storage.removeItem(key);
    } catch {
      // Storage can be unavailable in hardened/private browser contexts.
    }
    return { pending: null };
  }
}

export function clearPersistedStockReceiptDraftIdentity(
  storage: StockReceiptPendingStorage,
  scope: StockReceiptCommandScope,
) {
  try {
    storage.removeItem(pendingStorageKey(scope));
    return true;
  } catch {
    return false;
  }
}
