import { z } from "zod";
import type { StockMovement } from "@/lib/domain/types";
import type { ErpWorkspace } from "@/lib/erp/types";

export const stockReceiptMovementSchema = z
  .object({
    id: z.uuid(),
    businessId: z.uuid(),
    itemId: z.uuid(),
    warehouseId: z.uuid(),
    date: z.iso.date(),
    type: z.literal("purchase"),
    quantity: z.number().positive(),
    value: z.number().nonnegative(),
    memo: z.string(),
  })
  .strict();

export const stockReceiptCommandResultSchema = z
  .object({
    movementId: z.uuid(),
    created: z.boolean(),
    replayed: z.boolean(),
    movement: stockReceiptMovementSchema,
  })
  .strict()
  .superRefine((result, context) => {
    if (result.created === result.replayed) {
      context.addIssue({
        code: "custom",
        message: "Stock receipt command returned an invalid state.",
        path: ["created"],
      });
    }

    if (result.movementId !== result.movement.id) {
      context.addIssue({
        code: "custom",
        message: "Stock receipt movement identity is inconsistent.",
        path: ["movementId"],
      });
    }
  });

const requiredWorkspaceArrays = [
  "permissions",
  "accounts",
  "locations",
  "featureFlags",
  "industryTemplates",
  "transactionSources",
  "memberInvites",
  "customers",
  "suppliers",
  "products",
  "productStructures",
  "demandForecasts",
  "mrpRuns",
  "mrpRecommendations",
  "productionOrders",
  "warehouses",
  "salesInvoices",
  "purchaseBills",
  "payments",
  "paymentAllocations",
  "stockMovements",
  "stockTransfers",
  "stockAdjustments",
  "employees",
  "attendance",
  "payrollRuns",
  "journals",
  "importBatches",
  "rawImportBatches",
  "rawTransactions",
  "rawTransactionLines",
  "rawPayments",
  "settlementRecords",
  "dailyTransactionSummaries",
  "fixedAssets",
  "fixedAssetDepreciationRuns",
  "fixedAssetDepreciationLines",
  "fixedAssetDisposals",
  "locationMetrics",
  "attachments",
  "tasks",
  "activities",
] as const satisfies readonly (keyof ErpWorkspace)[];

const demoWorkspaceSchema = z.custom<ErpWorkspace>((value) => {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<ErpWorkspace>;

  return (
    Boolean(candidate.user && typeof candidate.user.id === "string") &&
    Boolean(candidate.business && typeof candidate.business.id === "string") &&
    Boolean(
      candidate.period &&
        typeof candidate.period.startDate === "string" &&
        typeof candidate.period.endDate === "string",
    ) &&
    Boolean(candidate.taxProfile && typeof candidate.taxProfile.businessId === "string") &&
    Boolean(candidate.metrics && typeof candidate.metrics.inventoryValue === "number") &&
    requiredWorkspaceArrays.every((key) => Array.isArray(candidate[key]))
  );
});

export const stockReceiptApiResponseSchema = z.union([
  stockReceiptCommandResultSchema,
  z.object({ workspace: demoWorkspaceSchema }).strict(),
]);

export type StockReceiptCommandResult = z.infer<
  typeof stockReceiptCommandResultSchema
>;
export type StockReceiptApiResponse = z.infer<
  typeof stockReceiptApiResponseSchema
>;

export function upsertStockReceiptMovement(
  movements: StockMovement[],
  movement: StockMovement,
) {
  const existingIndex = movements.findIndex((item) => item.id === movement.id);

  if (existingIndex < 0) {
    return [...movements, movement];
  }

  return movements.map((item, index) =>
    index === existingIndex ? movement : item,
  );
}
