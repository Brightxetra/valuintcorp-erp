import { describe, expect, it } from "vitest";
import { createDemoErpWorkspace } from "@/lib/erp/demo-workspace";
import {
  postPayment,
  postPurchaseBill,
  postSalesInvoice,
  postStockAdjustment,
  runPayroll,
} from "@/lib/erp/posting";
import { outstandingSales } from "@/lib/erp/operations";

describe("erp posting engine", () => {
  it("posts a sales invoice with journal, stock movement, and refreshed metrics", () => {
    const workspace = createDemoErpWorkspace();
    const result = postSalesInvoice(workspace, {
      customerId: "cust-001",
      productId: "item-rendang",
      quantity: 1,
      unitPrice: 45_000,
      date: "2026-06-28",
      dueDate: "2026-07-05",
    });

    expect(result.salesInvoices).toHaveLength(workspace.salesInvoices.length + 1);
    expect(result.journals).toHaveLength(workspace.journals.length + 1);
    expect(result.stockMovements.length).toBeGreaterThan(workspace.stockMovements.length);
    expect(result.salesInvoices[0].journalEntryId).toBe(result.journals[0].id);
    expect(result.metrics.revenue).toBeGreaterThan(workspace.metrics.revenue);
  });

  it("rejects dates that are inside a locked period", () => {
    const workspace = createDemoErpWorkspace();

    expect(() =>
      postPurchaseBill(
        { ...workspace, period: { ...workspace.period, locked: true } },
        {
          supplierId: "sup-001",
          productId: "item-rendang",
          quantity: 1,
          unitCost: 20_000,
          date: "2026-06-28",
          dueDate: "2026-07-05",
        },
      ),
    ).toThrow(/dikunci/);
  });

  it("rejects due dates before document dates", () => {
    const workspace = createDemoErpWorkspace();

    expect(() =>
      postSalesInvoice(workspace, {
        customerId: "cust-001",
        productId: "item-rendang",
        quantity: 1,
        unitPrice: 45_000,
        date: "2026-06-28",
        dueDate: "2026-06-01",
      }),
    ).toThrow(/jatuh tempo/i);
  });

  it("rejects overpayment against open receivables", () => {
    const workspace = createDemoErpWorkspace();
    const invoice = workspace.salesInvoices[0];

    expect(() =>
      postPayment(workspace, {
        direction: "inbound",
        documentType: "sales_invoice",
        documentId: invoice.id,
        amount: outstandingSales(invoice) + 1,
        method: "bank_transfer",
        date: "2026-06-28",
      }),
    ).toThrow(/melebihi piutang/);
  });

  it("rejects stock postings that would create negative inventory", () => {
    const workspace = createDemoErpWorkspace();
    const workspaceWithLargeCredit = {
      ...workspace,
      customers: workspace.customers.map((customer) =>
        customer.id === "cust-001" ? { ...customer, creditLimit: 10_000_000_000 } : customer,
      ),
    };

    expect(() =>
      postSalesInvoice(workspaceWithLargeCredit, {
        customerId: "cust-001",
        productId: "item-rendang",
        quantity: 100_000,
        unitPrice: 45_000,
        date: "2026-06-28",
        dueDate: "2026-07-05",
      }),
    ).toThrow(/negative stock|stok/i);
  });

  it("posts stock adjustment with journal and movement", () => {
    const workspace = createDemoErpWorkspace();
    const result = postStockAdjustment(workspace, {
      itemId: "item-rendang",
      warehouseId: "wh-kitchen",
      quantity: 2,
      value: 40_000,
      reason: "Stock opname",
      date: "2026-06-28",
    });

    expect(result.stockAdjustments).toHaveLength(workspace.stockAdjustments.length + 1);
    expect(result.stockMovements).toHaveLength(workspace.stockMovements.length + 1);
    expect(result.journals).toHaveLength(workspace.journals.length + 1);
  });

  it("posts payroll and rejects unreconciled gross/net/tax", () => {
    const workspace = createDemoErpWorkspace();
    const result = runPayroll(workspace, {
      employeeId: "emp-1",
      grossPay: 5_200_000,
      netCashPaid: 4_800_000,
      taxWithheld: 200_000,
      date: "2026-06-28",
    });

    expect(result.payrollRuns).toHaveLength(workspace.payrollRuns.length + 1);
    expect(result.journals[0].source).toBe("payroll");

    expect(() =>
      runPayroll(workspace, {
        employeeId: "emp-1",
        grossPay: 5_000_000,
        netCashPaid: 4_900_000,
        taxWithheld: 200_000,
        date: "2026-06-28",
      }),
    ).toThrow(/gross pay/);
  });
});
