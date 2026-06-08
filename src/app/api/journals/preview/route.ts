import {
  buildExpenseJournal,
  buildInventoryPurchaseJournal,
  buildPayrollJournal,
  buildSalesJournal,
} from "@/lib/accounting/engine";
import { isApiResponse, requireApiPermission, withDemoHeader } from "@/lib/auth/api";
import { transactionInputSchema, type TransactionInput } from "@/lib/validation/transaction-input";

function buildJournal(input: TransactionInput) {
  switch (input.type) {
    case "sale":
      return buildSalesJournal(input);
    case "expense":
      return buildExpenseJournal(input);
    case "inventory_purchase":
      return buildInventoryPurchaseJournal(input);
    case "payroll":
      return buildPayrollJournal(input);
  }
}

export async function POST(request: Request) {
  const context = await requireApiPermission(request, "accounting:write");

  if (isApiResponse(context)) {
    return context;
  }

  const payload = await request.json().catch(() => null);
  const parsed = transactionInputSchema.safeParse(payload);

  if (!parsed.success) {
    return withDemoHeader(Response.json({ errors: parsed.error.flatten() }, { status: 400 }), context);
  }

  try {
    return withDemoHeader(
      Response.json(
        { journalEntry: buildJournal(parsed.data) },
        { headers: { "cache-control": "no-store" } },
      ),
      context,
    );
  } catch (error) {
    return withDemoHeader(
      Response.json(
        { errors: { formErrors: [error instanceof Error ? error.message : "Invalid transaction."] } },
        { status: 422 },
      ),
      context,
    );
  }
}
