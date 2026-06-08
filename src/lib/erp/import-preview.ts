import { parseCsv } from "@/lib/import/csv";
import { rawTransactionInputSchema } from "@/lib/erp/schemas";
import type { PaymentMethod, RawTransaction, TransactionSourceType } from "@/lib/erp/types";

const requiredHeaders = ["date", "external_id", "gross_amount", "net_amount"];
const fingerprintHeaders = ["date", "external_id", "gross_amount", "net_amount"];
const paymentMethods: PaymentMethod[] = ["cash", "bank_transfer", "qris", "marketplace", "other"];

export interface RawImportPreviewInput {
  csvText: string;
  businessId: string;
  locationId: string;
  source: TransactionSourceType;
}

export interface RawImportPreviewRow {
  rowNumber: number;
  status: "valid" | "duplicate" | "error";
  error?: string;
  transaction?: Omit<RawTransaction, "id" | "businessId" | "batchId" | "status" | "createdAt"> & {
    lines: Array<{
      productId?: string;
      description: string;
      quantity: number;
      unitPrice: number;
      total: number;
    }>;
  };
}

export interface RawImportPreview {
  totalRows: number;
  validRows: number;
  duplicateRows: number;
  errorRows: number;
  rows: RawImportPreviewRow[];
  transactions: Array<RawImportPreviewRow["transaction"] & object>;
  errors: string[];
}

function numberFromCsv(value: string | undefined) {
  const normalized = (value ?? "").replaceAll(".", "").replace(",", ".").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function paymentMethodFromCsv(value: string | undefined): PaymentMethod {
  const normalized = (value ?? "cash").trim().toLowerCase();
  return paymentMethods.includes(normalized as PaymentMethod) ? (normalized as PaymentMethod) : "other";
}

export function buildRawImportPreview(input: RawImportPreviewInput): RawImportPreview {
  const parsed = parseCsv(input.csvText, requiredHeaders, fingerprintHeaders);
  const rows: RawImportPreviewRow[] = [];

  if (parsed.errors.length > 0) {
    return {
      totalRows: 0,
      validRows: 0,
      duplicateRows: 0,
      errorRows: parsed.errors.length,
      rows: [],
      transactions: [],
      errors: parsed.errors,
    };
  }

  for (const row of parsed.rows) {
    const grossAmount = numberFromCsv(row.values.gross_amount);
    const discountAmount = numberFromCsv(row.values.discount_amount || "0");
    const taxAmount = numberFromCsv(row.values.tax_amount || "0");
    const netAmount = numberFromCsv(row.values.net_amount);
    const quantity = numberFromCsv(row.values.quantity || "1");
    const unitPrice = numberFromCsv(row.values.unit_price || row.values.net_amount);
    const lineTotal = numberFromCsv(row.values.line_total || row.values.net_amount);
    const candidate = {
      locationId: input.locationId,
      source: input.source,
      externalId: row.values.external_id,
      transactionDate: row.values.date,
      grossAmount,
      discountAmount,
      netAmount,
      taxAmount,
      paymentMethod: paymentMethodFromCsv(row.values.payment_method),
      customerName: row.values.customer_name || undefined,
      lines: row.values.description
        ? [
            {
              productId: row.values.product_id || undefined,
              description: row.values.description,
              quantity,
              unitPrice,
              total: lineTotal,
            },
          ]
        : [],
    };
    const validation = rawTransactionInputSchema.safeParse(candidate);

    if (!validation.success) {
      rows.push({
        rowNumber: row.rowNumber,
        status: "error",
        error: validation.error.issues.map((issue) => issue.message).join("; "),
      });
      continue;
    }

    rows.push({
      rowNumber: row.rowNumber,
      status: "valid",
      transaction: validation.data,
    });
  }

  for (const duplicate of parsed.duplicates) {
    rows.push({
      rowNumber: duplicate.rowNumber,
      status: "duplicate",
      error: "Duplicate row in CSV preview.",
    });
  }

  rows.sort((left, right) => left.rowNumber - right.rowNumber);

  return {
    totalRows: rows.length,
    validRows: rows.filter((row) => row.status === "valid").length,
    duplicateRows: rows.filter((row) => row.status === "duplicate").length,
    errorRows: rows.filter((row) => row.status === "error").length,
    rows,
    transactions: rows.flatMap((row) => (row.transaction ? [row.transaction] : [])),
    errors: [],
  };
}
