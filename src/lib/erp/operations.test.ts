import { describe, expect, it } from "vitest";
import { assertBalanced } from "@/lib/accounting/engine";
import { createDemoErpWorkspace } from "@/lib/erp/demo-workspace";
import {
  buildPaymentJournal,
  buildPurchaseBillJournal,
  buildSalesInvoiceJournal,
  calculateErpMetrics,
  isOverdue,
  outstandingPurchase,
  outstandingSales,
  purchaseBillTotal,
  salesInvoiceCogs,
  salesInvoiceTotal,
} from "@/lib/erp/operations";

describe("erp operations", () => {
  it("calculates sales and purchase document totals", () => {
    const workspace = createDemoErpWorkspace();
    const invoice = workspace.salesInvoices[0];
    const bill = workspace.purchaseBills[0];

    expect(salesInvoiceTotal(invoice)).toBe(invoice.total);
    expect(salesInvoiceCogs(invoice)).toBe(2_820_000);
    expect(purchaseBillTotal(bill)).toBe(bill.total);
  });

  it("builds balanced journals from business documents", () => {
    const workspace = createDemoErpWorkspace();
    const salesJournal = buildSalesInvoiceJournal(workspace.salesInvoices[0]);
    const purchaseJournal = buildPurchaseBillJournal(workspace.purchaseBills[0]);
    const paymentJournal = buildPaymentJournal(workspace.payments[0]);

    expect(() => assertBalanced(salesJournal.lines)).not.toThrow();
    expect(() => assertBalanced(purchaseJournal.lines)).not.toThrow();
    expect(() => assertBalanced(paymentJournal.lines)).not.toThrow();
  });

  it("calculates AR/AP outstanding and overdue metrics", () => {
    const workspace = createDemoErpWorkspace();
    const metrics = calculateErpMetrics(workspace);

    expect(outstandingSales(workspace.salesInvoices[0])).toBe(2_200_000);
    expect(outstandingPurchase(workspace.purchaseBills[0])).toBe(2_600_000);
    expect(isOverdue("2026-06-19", "2026-06-30")).toBe(true);
    expect(metrics.accountsReceivable).toBeGreaterThan(0);
    expect(metrics.accountsPayable).toBeGreaterThan(0);
  });
});

