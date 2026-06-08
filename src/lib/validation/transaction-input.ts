import { z } from "zod";

function isValidDateString(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const dateSchema = z.string().refine(isValidDateString, "Tanggal harus valid dengan format YYYY-MM-DD.");
const moneySchema = z.number().int().nonnegative().max(999_999_999_999);

export const saleInputSchema = z.object({
  type: z.literal("sale"),
  date: dateSchema,
  revenueAmount: moneySchema.positive(),
  cashReceived: moneySchema.default(0),
  receivableAmount: moneySchema.default(0),
  taxPayable: moneySchema.default(0),
  cogs: moneySchema.default(0),
  inventoryCost: moneySchema.default(0),
});

export const expenseInputSchema = z.object({
  type: z.literal("expense"),
  date: dateSchema,
  amount: moneySchema.positive(),
  paidAmount: moneySchema.default(0),
  payableAmount: moneySchema.default(0),
  description: z.string().min(3).default("Beban operasional"),
});

export const inventoryPurchaseInputSchema = z.object({
  type: z.literal("inventory_purchase"),
  date: dateSchema,
  inventoryAmount: moneySchema.positive(),
  paidAmount: moneySchema.default(0),
  payableAmount: moneySchema.default(0),
});

export const payrollInputSchema = z.object({
  type: z.literal("payroll"),
  date: dateSchema,
  grossPay: moneySchema.positive(),
  netCashPaid: moneySchema.default(0),
  salaryPayable: moneySchema.default(0),
  taxWithheld: moneySchema.default(0),
  otherDeductionsPayable: moneySchema.default(0),
});

export const transactionInputSchema = z.discriminatedUnion("type", [
  saleInputSchema,
  expenseInputSchema,
  inventoryPurchaseInputSchema,
  payrollInputSchema,
]);

export type TransactionInput = z.infer<typeof transactionInputSchema>;
