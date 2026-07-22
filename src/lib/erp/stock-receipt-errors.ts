export const stockReceiptErrorCodes = {
  forbidden: "STOCK_RECEIPT_FORBIDDEN",
  idempotencyConflict: "STOCK_RECEIPT_IDEMPOTENCY_CONFLICT",
  invalid: "STOCK_RECEIPT_INVALID",
  periodLocked: "STOCK_RECEIPT_PERIOD_LOCKED",
  unavailable: "STOCK_RECEIPT_UNAVAILABLE",
  unexpected: "STOCK_RECEIPT_UNEXPECTED",
} as const;

export const authoritativeStockReceiptConflictCodes = [
  stockReceiptErrorCodes.idempotencyConflict,
  stockReceiptErrorCodes.periodLocked,
] as const;
