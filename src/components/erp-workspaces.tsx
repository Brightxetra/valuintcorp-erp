"use client";

import HCaptcha from "@hcaptcha/react-hcaptcha";
import type { HCaptcha as HCaptchaInstance } from "@hcaptcha/react-hcaptcha";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  BookOpenCheck,
  Boxes,
  CalendarCheck,
  CheckCircle2,
  Clock3,
  Download,
  FileSpreadsheet,
  Landmark,
  PackagePlus,
  ReceiptText,
  ShoppingCart,
  UsersRound,
} from "lucide-react";
import {
  ActionButton,
  DataTable,
  EmptyState,
  FilterBar,
  MetricCard,
  Panel,
  SelectField,
  StatTile,
  StatusPill,
  TextField,
  WorkspaceHeader,
} from "@/components/ui";
import { FeedbackToast } from "@/components/feedback-toast";
import { useErpWorkspace } from "@/components/erp-context";
import type { ErpDocumentStatus, ErpWorkspace, PaymentDirection } from "@/lib/erp/types";
import { outstandingPurchase, outstandingSales } from "@/lib/erp/operations";
import { destinationAfterLogin, sanitizeLoginNextPath } from "@/lib/erp/login-routing";
import { valueInventory } from "@/lib/inventory/valuation";
import { money, percent } from "@/lib/format";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  erpApiDownload,
  erpApiFetch,
  clearServerSession,
  shouldUseDemoFallbackBrowser,
  syncServerSession,
} from "@/lib/erp/client-api";

const MARKETING_SITE_URL =
  process.env.NEXT_PUBLIC_MARKETING_SITE_URL ?? "https://valuintcorp.vercel.app";

function currentLoginNextPath() {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("next");
}

async function tryBootstrapDemoAccount() {
  try {
    return await erpApiFetch<{
      demoAccount: boolean;
      businessId: string | null;
      runtimeMode: "demo_fallback" | "demo_account" | "production";
    }>("/api/demo/bootstrap", {
      method: "POST",
      body: JSON.stringify({}),
    });
  } catch {
    return null;
  }
}

function statusTone(status: ErpDocumentStatus): "emerald" | "amber" | "gray" | "red" | "cyan" {
  if (status === "paid") return "emerald";
  if (status === "partially_paid") return "cyan";
  if (status === "posted") return "amber";
  if (status === "void") return "red";
  return "gray";
}

function customerName(workspace: ErpWorkspace, id: string) {
  return workspace.customers.find((customer) => customer.id === id)?.name ?? "Customer";
}

function supplierName(workspace: ErpWorkspace, id: string) {
  return workspace.suppliers.find((supplier) => supplier.id === id)?.name ?? "Supplier";
}

function productName(workspace: ErpWorkspace, id: string) {
  return workspace.products.find((product) => product.id === id)?.name ?? "Produk";
}

function warehouseName(workspace: ErpWorkspace, id: string) {
  return workspace.warehouses.find((warehouse) => warehouse.id === id)?.name ?? "Gudang";
}

function locationName(workspace: ErpWorkspace, id: string) {
  return workspace.locations.find((location) => location.id === id)?.name ?? "Lokasi";
}

type RequestFn = ReturnType<typeof useErpWorkspace>["request"];

async function postJson(
  request: RequestFn,
  endpoint: string,
  payload: Record<string, string | number>,
  method: "POST" | "PATCH" | "DELETE" = "POST",
) {
  return request<{ workspace?: ErpWorkspace }>(endpoint, {
    method,
    body: JSON.stringify(payload),
  });
}

async function postObject(
  request: RequestFn,
  endpoint: string,
  payload: Record<string, unknown>,
  method: "POST" | "PATCH" | "DELETE" = "POST",
) {
  return request<{ workspace?: ErpWorkspace } & Record<string, unknown>>(endpoint, {
    method,
    body: JSON.stringify(payload),
  });
}

function WorkspaceFeedback({ error, success }: { error: string | null; success: string | null }) {
  const isPersistentStatus =
    success?.startsWith("Memuat ") || success?.startsWith("Demo fallback aktif");

  return (
    <>
      <FeedbackToast error={error} success={isPersistentStatus ? null : success} />
      {isPersistentStatus ? (
        <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{success}</p>
      ) : null}
    </>
  );
}

export function DashboardWorkspace({ initialWorkspace }: { initialWorkspace: ErpWorkspace }) {
  const { workspace, loading, error, demoMode, activeBusinessId } = useErpWorkspace(initialWorkspace);
  const marginRate = workspace.metrics.revenue > 0 ? workspace.metrics.grossMargin / workspace.metrics.revenue : 0;

  return (
    <>
      <WorkspaceHeader
        title="Command center"
        description="Ringkasan operasional lintas penjualan, pembelian, stok, payroll, pajak, dan closing bulanan."
        primaryAction={<a href="/sales" className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white">Quick create invoice</a>}
        secondaryAction={<ActionButton variant="secondary" onClick={() => erpApiDownload("/api/exports/financials?format=xlsx", activeBusinessId)}>Export ringkasan</ActionButton>}
      />
      {loading || error || demoMode ? (
        <WorkspaceFeedback
          error={error}
          success={loading ? "Memuat workspace production..." : demoMode ? "Demo fallback aktif. Isi Supabase env untuk mode produksi." : null}
        />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Omzet posted" value={money(workspace.metrics.revenue)} meta={`${percent(marginRate)} gross margin`} icon={ReceiptText} />
        <MetricCard label="Kas operasional" value={money(workspace.metrics.cash)} meta="Dari jurnal posted" icon={Banknote} tone="cyan" />
        <MetricCard label="Piutang terbuka" value={money(workspace.metrics.accountsReceivable)} meta={`${money(workspace.metrics.overdueReceivables)} jatuh tempo`} icon={Clock3} tone="amber" />
        <MetricCard label="Nilai stok" value={money(workspace.metrics.inventoryValue)} meta={`${workspace.metrics.stockAlertCount} SKU perlu review`} icon={Boxes} tone={workspace.metrics.stockAlertCount ? "red" : "emerald"} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Raw transactions" value={String(workspace.metrics.rawTransactionCount)} meta="Rows terbaru di bounded workspace" icon={FileSpreadsheet} tone="gray" />
        <MetricCard label="Daily sales summary" value={money(workspace.metrics.summarizedRevenue)} meta="Omzet dari raw layer per hari" icon={CalendarCheck} tone="cyan" />
        <MetricCard label="Lokasi aktif" value={String(workspace.locations.filter((location) => location.isActive).length)} meta="Cabang/outlet/store/workshop" icon={Landmark} tone="emerald" />
        <MetricCard label="Batch import" value={String(workspace.rawImportBatches.length)} meta="Upload, validate, summarize, post" icon={PackagePlus} tone="amber" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel title="Prioritas hari ini" description="Task dibuat dari status AR/AP, stok, payroll, pajak, dan periode laporan.">
          <div className="space-y-3">
            {workspace.tasks.map((task) => (
              <div key={task.id} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
                <span className={task.severity === "critical" ? "text-red-600" : task.severity === "warning" ? "text-amber-700" : "text-emerald-700"}>
                  {task.severity === "critical" ? <AlertTriangle className="size-5" /> : <CheckCircle2 className="size-5" />}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-slate-950">{task.title}</p>
                    <StatusPill tone={task.severity === "critical" ? "red" : task.severity === "warning" ? "amber" : "emerald"}>
                      {task.module}
                    </StatusPill>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{task.description}</p>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Aktivitas terbaru" description="Audit operasional yang mudah dibaca pemilik.">
          <div className="space-y-3">
            {workspace.activities.slice(0, 5).map((activity) => (
              <div key={activity.id} className="rounded-lg bg-slate-50 p-3">
                <p className="text-sm font-medium text-slate-950">{activity.description}</p>
                <p className="mt-1 text-xs text-slate-500">{activity.actorName} - {activity.createdAt.slice(0, 10)}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Panel title="AR/AP due">
          <div className="grid gap-3">
            <StatTile label="Piutang jatuh tempo" value={money(workspace.metrics.overdueReceivables)} helper="Invoice yang perlu ditagih" />
            <StatTile label="Utang jatuh tempo" value={money(workspace.metrics.overduePayables)} helper="Bill supplier yang perlu dibayar" />
          </div>
        </Panel>
        <Panel title="Payroll">
          <StatTile label="Biaya payroll" value={money(workspace.metrics.payrollCost)} helper={`${workspace.employees.length} karyawan aktif/demo`} />
        </Panel>
        <Panel title="Pajak">
          <StatTile label="Estimasi PPh final" value={money(workspace.metrics.taxEstimate)} helper="Belum submit langsung ke Coretax" />
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel title="Performa per lokasi" description="Dashboard tetap ringan karena membaca summary per lokasi, bukan scan semua struk.">
          <DataTable columns={["Lokasi", "Transaksi", "Omzet summary", "Average ticket"]}>
            {workspace.locationMetrics.map((metric) => (
              <tr key={metric.locationId}>
                <td className="px-4 py-3 font-medium">{locationName(workspace, metric.locationId)}</td>
                <td className="px-4 py-3 text-right">{metric.transactionCount}</td>
                <td className="px-4 py-3 text-right">{money(metric.revenue)}</td>
                <td className="px-4 py-3 text-right">{money(metric.averageTicket)}</td>
              </tr>
            ))}
          </DataTable>
        </Panel>
        <Panel title="Import dan summary" description="Status raw transaction layer untuk POS, marketplace, bank CSV, dan batch manual.">
          <div className="space-y-3">
            {workspace.rawImportBatches.slice(0, 5).map((batch) => (
              <div key={batch.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-slate-950">{batch.source}</p>
                  <StatusPill tone={batch.status === "posted" ? "emerald" : batch.status === "failed" ? "red" : "amber"}>{batch.status}</StatusPill>
                </div>
                <p className="mt-1 text-sm text-slate-500">{batch.validRows}/{batch.totalRows} valid, {batch.duplicateRows} duplicate, {batch.errorRows} error</p>
              </div>
            ))}
            {workspace.rawImportBatches.length === 0 ? <EmptyState title="Belum ada raw import" description="Upload transaksi POS/marketplace/bank CSV dari laporan untuk membuat summary harian." /> : null}
          </div>
        </Panel>
      </div>
    </>
  );
}

export function SalesWorkspace({ initialWorkspace }: { initialWorkspace: ErpWorkspace }) {
  const { workspace, setWorkspace, request, loading: workspaceLoading, error: workspaceError } = useErpWorkspace(initialWorkspace);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const openInvoices = workspace.salesInvoices.filter((invoice) => outstandingSales(invoice) > 0);
  const filteredInvoices = workspace.salesInvoices.filter((invoice) => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return true;

    return (
      invoice.invoiceNo.toLowerCase().includes(normalized) ||
      customerName(workspace, invoice.customerId).toLowerCase().includes(normalized) ||
      invoice.status.toLowerCase().includes(normalized)
    );
  });

  async function createInvoice(formData: FormData) {
    setPending(true);
    setError(null);
    setSuccess(null);

    try {
      const body = await postJson(request, "/api/erp/sales-invoices", {
        customerId: String(formData.get("customerId")),
        productId: String(formData.get("productId")),
        warehouseId: String(formData.get("warehouseId") || ""),
        quantity: Number(formData.get("quantity")),
        unitPrice: Number(formData.get("unitPrice")),
        date: String(formData.get("date")),
        dueDate: String(formData.get("dueDate")),
      });
      if (body.workspace) setWorkspace(body.workspace);
      setSuccess("Invoice dipost. Jurnal dan stock movement dibuat otomatis.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Invoice gagal dibuat.");
    } finally {
      setPending(false);
    }
  }

  async function receivePayment(formData: FormData) {
    setPending(true);
    setError(null);
    setSuccess(null);

    try {
      const body = await postJson(request, "/api/erp/payments", {
        direction: "inbound",
        documentType: "sales_invoice",
        documentId: String(formData.get("documentId")),
        amount: Number(formData.get("amount")),
        method: String(formData.get("method")),
        date: String(formData.get("date")),
      });
      if (body.workspace) setWorkspace(body.workspace);
      setSuccess("Payment receipt dipost dan piutang diperbarui.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Payment gagal dibuat.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <WorkspaceHeader
        title="Penjualan"
        description="Kelola customer, invoice, penerimaan pembayaran, piutang, dan jurnal otomatis dari dokumen penjualan."
        primaryAction={<ActionButton form="sales-invoice-form" disabled={pending}><PackagePlus className="size-4" />Buat invoice</ActionButton>}
      />
      <WorkspaceFeedback error={workspaceError} success={workspaceLoading ? "Memuat data penjualan production..." : null} />

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Panel title="Buat invoice" description="Dokumen posted akan membentuk AR, revenue, HPP, dan inventory relief.">
          <form id="sales-invoice-form" action={createInvoice} className="grid gap-3 sm:grid-cols-2">
            <SelectField name="customerId" label="Customer">
              {workspace.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
            </SelectField>
            <SelectField name="productId" label="Produk">
              {workspace.products.filter((product) => product.isSellable).map((product) => <option key={product.id} value={product.id}>{product.sku} - {product.name}</option>)}
            </SelectField>
            <SelectField name="warehouseId" label="Gudang">
              {workspace.warehouses.filter((warehouse) => warehouse.isActive).map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
            </SelectField>
            <TextField name="quantity" label="Qty" type="number" defaultValue={10} />
            <TextField name="unitPrice" label="Harga jual" type="number" defaultValue={45_000} />
            <TextField name="date" label="Tanggal invoice" type="date" defaultValue="2026-06-28" />
            <TextField name="dueDate" label="Jatuh tempo" type="date" defaultValue="2026-07-05" />
          </form>
          <div className="mt-4">
            <WorkspaceFeedback error={error} success={success} />
          </div>
        </Panel>

        <Panel title="Terima pembayaran" description="Payment receipt mengurangi piutang dan menambah kas.">
          <form action={receivePayment} className="grid gap-3 sm:grid-cols-2">
            <SelectField name="documentId" label="Invoice terbuka">
              {openInvoices.map((invoice) => (
                <option key={invoice.id} value={invoice.id}>{invoice.invoiceNo} - {money(outstandingSales(invoice))}</option>
              ))}
            </SelectField>
            <SelectField name="method" label="Metode">
              <option value="bank_transfer">Bank transfer</option>
              <option value="qris">QRIS</option>
              <option value="cash">Cash</option>
              <option value="marketplace">Marketplace</option>
            </SelectField>
            <TextField name="amount" label="Nominal" type="number" defaultValue={openInvoices[0] ? outstandingSales(openInvoices[0]) : 0} />
            <TextField name="date" label="Tanggal bayar" type="date" defaultValue="2026-06-28" />
            <div className="sm:col-span-2">
              <ActionButton disabled={pending || openInvoices.length === 0}>Post payment receipt</ActionButton>
            </div>
          </form>
        </Panel>
      </div>

      <Panel title="Invoice penjualan" description="Daftar dokumen, status pembayaran, dan piutang.">
        <FilterBar placeholder="Cari invoice/customer" value={query} onChange={setQuery}>
          <StatusPill tone="amber">{openInvoices.length} open</StatusPill>
        </FilterBar>
        <DataTable columns={["Invoice", "Customer", "Tanggal", "Status", "Total", "Piutang"]}>
          {filteredInvoices.map((invoice) => (
            <tr key={invoice.id}>
              <td className="px-4 py-3 font-medium">{invoice.invoiceNo}</td>
              <td className="px-4 py-3">{customerName(workspace, invoice.customerId)}</td>
              <td className="px-4 py-3 text-slate-500">{invoice.date}</td>
              <td className="px-4 py-3"><StatusPill tone={statusTone(invoice.status)}>{invoice.status}</StatusPill></td>
              <td className="px-4 py-3 text-right">{money(invoice.total)}</td>
              <td className="px-4 py-3 text-right">{money(outstandingSales(invoice))}</td>
            </tr>
          ))}
        </DataTable>
      </Panel>
    </>
  );
}

export function PurchasesWorkspace({ initialWorkspace }: { initialWorkspace: ErpWorkspace }) {
  const { workspace, setWorkspace, request, loading: workspaceLoading, error: workspaceError } = useErpWorkspace(initialWorkspace);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const openBills = workspace.purchaseBills.filter((bill) => outstandingPurchase(bill) > 0);
  const filteredBills = workspace.purchaseBills.filter((bill) => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return true;

    return (
      bill.billNo.toLowerCase().includes(normalized) ||
      supplierName(workspace, bill.supplierId).toLowerCase().includes(normalized) ||
      bill.status.toLowerCase().includes(normalized)
    );
  });

  async function createBill(formData: FormData) {
    setPending(true);
    setError(null);
    setSuccess(null);

    try {
      const body = await postJson(request, "/api/erp/purchase-bills", {
        supplierId: String(formData.get("supplierId")),
        productId: String(formData.get("productId")),
        warehouseId: String(formData.get("warehouseId") || ""),
        quantity: Number(formData.get("quantity")),
        unitCost: Number(formData.get("unitCost")),
        date: String(formData.get("date")),
        dueDate: String(formData.get("dueDate")),
      });
      if (body.workspace) setWorkspace(body.workspace);
      setSuccess("Bill dipost. Utang dan stok diperbarui.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Bill gagal dibuat.");
    } finally {
      setPending(false);
    }
  }

  async function payBill(formData: FormData) {
    setPending(true);
    setError(null);
    setSuccess(null);

    try {
      const body = await postJson(request, "/api/erp/payments", {
        direction: "outbound" satisfies PaymentDirection,
        documentType: "purchase_bill",
        documentId: String(formData.get("documentId")),
        amount: Number(formData.get("amount")),
        method: String(formData.get("method")),
        date: String(formData.get("date")),
      });
      if (body.workspace) setWorkspace(body.workspace);
      setSuccess("Payment supplier dipost dan utang diperbarui.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Payment gagal dibuat.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <WorkspaceHeader
        title="Pembelian"
        description="Kelola supplier, purchase bill, payment, utang, dan pembelian yang langsung masuk nilai persediaan."
        primaryAction={<ActionButton form="purchase-bill-form" disabled={pending}><ShoppingCart className="size-4" />Buat bill</ActionButton>}
      />
      <WorkspaceFeedback error={workspaceError} success={workspaceLoading ? "Memuat data pembelian production..." : null} />

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Panel title="Buat purchase bill">
          <form id="purchase-bill-form" action={createBill} className="grid gap-3 sm:grid-cols-2">
            <SelectField name="supplierId" label="Supplier">
              {workspace.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
            </SelectField>
            <SelectField name="productId" label="Produk">
              {workspace.products.filter((product) => product.isPurchasable).map((product) => <option key={product.id} value={product.id}>{product.sku} - {product.name}</option>)}
            </SelectField>
            <SelectField name="warehouseId" label="Gudang">
              {workspace.warehouses.filter((warehouse) => warehouse.isActive).map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
            </SelectField>
            <TextField name="quantity" label="Qty" type="number" defaultValue={20} />
            <TextField name="unitCost" label="Harga beli" type="number" defaultValue={20_000} />
            <TextField name="date" label="Tanggal bill" type="date" defaultValue="2026-06-28" />
            <TextField name="dueDate" label="Jatuh tempo" type="date" defaultValue="2026-07-05" />
          </form>
          <div className="mt-4">
            <WorkspaceFeedback error={error} success={success} />
          </div>
        </Panel>

        <Panel title="Bayar supplier">
          <form action={payBill} className="grid gap-3 sm:grid-cols-2">
            <SelectField name="documentId" label="Bill terbuka">
              {openBills.map((bill) => (
                <option key={bill.id} value={bill.id}>{bill.billNo} - {money(outstandingPurchase(bill))}</option>
              ))}
            </SelectField>
            <SelectField name="method" label="Metode">
              <option value="bank_transfer">Bank transfer</option>
              <option value="cash">Cash</option>
            </SelectField>
            <TextField name="amount" label="Nominal" type="number" defaultValue={openBills[0] ? outstandingPurchase(openBills[0]) : 0} />
            <TextField name="date" label="Tanggal bayar" type="date" defaultValue="2026-06-28" />
            <div className="sm:col-span-2">
              <ActionButton disabled={pending || openBills.length === 0}>Post payment supplier</ActionButton>
            </div>
          </form>
        </Panel>
      </div>

      <Panel title="Purchase bills" description="Daftar pembelian, status pembayaran, dan utang supplier.">
        <FilterBar placeholder="Cari bill/supplier" value={query} onChange={setQuery}>
          <StatusPill tone="amber">{openBills.length} open</StatusPill>
        </FilterBar>
        <DataTable columns={["Bill", "Supplier", "Tanggal", "Status", "Total", "Utang"]}>
          {filteredBills.map((bill) => (
            <tr key={bill.id}>
              <td className="px-4 py-3 font-medium">{bill.billNo}</td>
              <td className="px-4 py-3">{supplierName(workspace, bill.supplierId)}</td>
              <td className="px-4 py-3 text-slate-500">{bill.date}</td>
              <td className="px-4 py-3"><StatusPill tone={statusTone(bill.status)}>{bill.status}</StatusPill></td>
              <td className="px-4 py-3 text-right">{money(bill.total)}</td>
              <td className="px-4 py-3 text-right">{money(outstandingPurchase(bill))}</td>
            </tr>
          ))}
        </DataTable>
      </Panel>
    </>
  );
}

export function InventoryWorkspaceV2({ initialWorkspace }: { initialWorkspace: ErpWorkspace }) {
  const { workspace, setWorkspace, request, loading: workspaceLoading, error: workspaceError } = useErpWorkspace(initialWorkspace);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const positions = useMemo(() => valueInventory(workspace.stockMovements), [workspace.stockMovements]);
  const filteredPositions = positions.filter((position) => {
    const normalized = query.trim().toLowerCase();
    const product = workspace.products.find((item) => item.id === position.itemId);
    const warehouse = workspace.warehouses.find((item) => item.id === position.warehouseId);
    if (!normalized) return true;

    return (
      product?.sku.toLowerCase().includes(normalized) ||
      product?.name.toLowerCase().includes(normalized) ||
      warehouse?.name.toLowerCase().includes(normalized)
    );
  });

  async function createAdjustment(formData: FormData) {
    setPending(true);
    setError(null);
    setSuccess(null);

    try {
      const body = await postJson(request, "/api/erp/stock-adjustments", {
        itemId: String(formData.get("itemId")),
        warehouseId: String(formData.get("warehouseId")),
        quantity: Number(formData.get("quantity")),
        value: Number(formData.get("value")),
        reason: String(formData.get("reason")),
        date: String(formData.get("date")),
      });
      if (body.workspace) setWorkspace(body.workspace);
      setSuccess("Adjustment dipost dan stock card diperbarui.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Adjustment gagal dibuat.");
    } finally {
      setPending(false);
    }
  }

  async function createTransfer(formData: FormData) {
    setPending(true);
    setError(null);
    setSuccess(null);

    try {
      const body = await postJson(request, "/api/erp/stock-transfers", {
        itemId: String(formData.get("itemId")),
        fromWarehouseId: String(formData.get("fromWarehouseId")),
        toWarehouseId: String(formData.get("toWarehouseId")),
        quantity: Number(formData.get("quantity")),
        date: String(formData.get("date")),
        memo: String(formData.get("memo")),
      });
      if (body.workspace) setWorkspace(body.workspace);
      setSuccess("Transfer stok dipost dan stock card diperbarui.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Transfer gagal dibuat.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <WorkspaceHeader
        title="Stok"
        description="SKU, gudang, stock card, transfer, adjustment, opname, dan valuasi moving average."
        primaryAction={<ActionButton form="stock-adjustment-form" disabled={pending}><Boxes className="size-4" />Post adjustment</ActionButton>}
      />
      <WorkspaceFeedback error={workspaceError} success={workspaceLoading ? "Memuat data stok production..." : null} />

      <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
        <Panel title="Stock adjustment">
          <form id="stock-adjustment-form" action={createAdjustment} className="grid gap-3 sm:grid-cols-2">
            <SelectField name="itemId" label="SKU">
              {workspace.products.filter((product) => product.trackStock).map((product) => <option key={product.id} value={product.id}>{product.sku} - {product.name}</option>)}
            </SelectField>
            <SelectField name="warehouseId" label="Gudang">
              {workspace.warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
            </SelectField>
            <TextField name="quantity" label="Qty koreksi" type="number" defaultValue={-1} />
            <TextField name="value" label="Nilai koreksi" type="number" defaultValue={20_000} />
            <TextField name="date" label="Tanggal" type="date" defaultValue="2026-06-28" />
            <TextField name="reason" label="Alasan" defaultValue="Stock opname" />
          </form>
          <div className="mt-4">
            <WorkspaceFeedback error={error} success={success} />
          </div>
        </Panel>

        <Panel title="Transfer antar gudang">
          <form action={createTransfer} className="grid gap-3 sm:grid-cols-2">
            <SelectField name="itemId" label="SKU">
              {workspace.products.filter((product) => product.trackStock).map((product) => <option key={product.id} value={product.id}>{product.sku} - {product.name}</option>)}
            </SelectField>
            <TextField name="date" label="Tanggal" type="date" defaultValue="2026-06-28" />
            <SelectField name="fromWarehouseId" label="Dari gudang">
              {workspace.warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
            </SelectField>
            <SelectField name="toWarehouseId" label="Ke gudang">
              {workspace.warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
            </SelectField>
            <TextField name="quantity" label="Qty transfer" type="number" defaultValue={1} />
            <TextField name="memo" label="Memo" defaultValue="Transfer operasional" />
            <div className="sm:col-span-2">
              <ActionButton disabled={pending || workspace.warehouses.length < 2}>Post transfer</ActionButton>
            </div>
          </form>
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
        <Panel title="Stock alerts">
          <div className="grid gap-3 sm:grid-cols-2">
            {workspace.products.filter((product) => product.trackStock).map((product) => {
              const quantity = positions.filter((item) => item.itemId === product.id).reduce((total, item) => total + item.quantity, 0);
              const alert = quantity <= product.reorderPoint;

              return (
                <div key={product.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{product.name}</p>
                      <p className="text-sm text-slate-500">{product.sku}</p>
                    </div>
                    <StatusPill tone={alert ? "red" : "emerald"}>{alert ? "reorder" : "ok"}</StatusPill>
                  </div>
                  <p className="mt-3 text-sm text-slate-600">Qty {quantity} {product.unit} - Min {product.reorderPoint}</p>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      <Panel title="Stock card dan valuasi" description="Posisi dihitung dari stock movement posted.">
        <FilterBar placeholder="Cari SKU/produk/gudang" value={query} onChange={setQuery}>
          <StatusPill tone={workspace.metrics.stockAlertCount ? "red" : "emerald"}>
            {workspace.metrics.stockAlertCount} alert
          </StatusPill>
        </FilterBar>
        <DataTable columns={["SKU", "Produk", "Gudang", "Qty", "Avg cost", "Nilai"]}>
          {filteredPositions.map((position) => (
            <tr key={`${position.itemId}-${position.warehouseId}`}>
              <td className="px-4 py-3 text-slate-500">{workspace.products.find((product) => product.id === position.itemId)?.sku}</td>
              <td className="px-4 py-3 font-medium">{productName(workspace, position.itemId)}</td>
              <td className="px-4 py-3">{warehouseName(workspace, position.warehouseId)}</td>
              <td className="px-4 py-3 text-right">{position.quantity}</td>
              <td className="px-4 py-3 text-right">{money(position.averageCost)}</td>
              <td className="px-4 py-3 text-right">{money(position.value)}</td>
            </tr>
          ))}
        </DataTable>
      </Panel>
    </>
  );
}

export function AccountingWorkspace({ initialWorkspace }: { initialWorkspace: ErpWorkspace }) {
  const { workspace, setWorkspace, request, loading: workspaceLoading, error: workspaceError } = useErpWorkspace(initialWorkspace);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const filteredJournals = workspace.journals.filter((entry) => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return true;

    return (
      entry.description.toLowerCase().includes(normalized) ||
      entry.source.toLowerCase().includes(normalized) ||
      entry.date.includes(normalized)
    );
  });

  async function updatePeriodLock(formData: FormData) {
    setPending(true);
    setError(null);
    setSuccess(null);

    try {
      const body = await postObject(request, "/api/erp/period-lock", {
        label: String(formData.get("label")),
        startDate: String(formData.get("startDate")),
        endDate: String(formData.get("endDate")),
        locked: String(formData.get("locked")) === "true",
      });
      if (body.workspace) setWorkspace(body.workspace);
      setSuccess("Status periode diperbarui.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Period lock gagal diproses.");
    } finally {
      setPending(false);
    }
  }

  async function voidDocument(formData: FormData) {
    setPending(true);
    setError(null);
    setSuccess(null);

    try {
      const body = await postObject(request, "/api/erp/documents/void", {
        documentType: String(formData.get("documentType")),
        documentId: String(formData.get("documentId")),
        reason: String(formData.get("reason")),
        date: String(formData.get("date")),
      });
      if (body.workspace) setWorkspace(body.workspace);
      setSuccess("Dokumen divoid dan audit activity dicatat.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Void dokumen gagal.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <WorkspaceHeader
        title="Akuntansi"
        description="Jurnal otomatis dari dokumen bisnis, manual journal terbatas, period lock, reversal, dan audit trail."
        primaryAction={<a href="#period-control" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800"><BookOpenCheck className="size-4" />Period control</a>}
      />
      <WorkspaceFeedback error={workspaceError ?? error} success={workspaceLoading ? "Memuat data akuntansi production..." : success} />
      <div className="grid gap-5 xl:grid-cols-4">
        <MetricCard label="Jurnal Dicatat" value={String(workspace.journals.length)} meta="Dari penjualan, pembelian, gaji, pembayaran" icon={BookOpenCheck} />
        <MetricCard label="Period" value={workspace.period.label} meta={workspace.period.locked ? "Locked" : "Open"} icon={CalendarCheck} tone={workspace.period.locked ? "red" : "emerald"} />
        <MetricCard label="Piutang" value={money(workspace.metrics.accountsReceivable)} meta="Piutang usaha" icon={ReceiptText} tone="amber" />
        <MetricCard label="Hutang" value={money(workspace.metrics.accountsPayable)} meta="Utang usaha" icon={ShoppingCart} tone="cyan" />
      </div>
      <div id="period-control" className="grid gap-5 xl:grid-cols-2">
        <Panel title="Penguncian Periode" description="Periode yang dikunci tidak bisa menambahkan transaksi baru pada tanggal tersebut.">
          <form action={updatePeriodLock} className="grid gap-3 sm:grid-cols-2">
            <TextField name="label" label="Label" defaultValue={workspace.period.label} />
            <TextField name="startDate" label="Tanggal mulai" type="date" defaultValue={workspace.period.startDate} />
            <TextField name="endDate" label="Tanggal akhir" type="date" defaultValue={workspace.period.endDate} />
            <SelectField name="locked" label="Status">
              <option value="false">Terbuka</option>
              <option value="true">Dikunci</option>
            </SelectField>
            <div className="sm:col-span-2">
              <ActionButton disabled={pending}>Simpan status periode</ActionButton>
            </div>
          </form>
        </Panel>
        <Panel title="Batalkan Dokumen" description="Gunakan untuk membatalkan/mengoreksi dokumen yang sudah dicatat.">
          <form action={voidDocument} className="grid gap-3 sm:grid-cols-2">
            <SelectField name="documentType" label="Jenis dokumen">
              <option value="sales_invoice">Sales invoice</option>
              <option value="purchase_bill">Purchase bill</option>
              <option value="payment">Payment</option>
              <option value="stock_adjustment">Stock adjustment</option>
              <option value="stock_transfer">Stock transfer</option>
            </SelectField>
            <SelectField name="documentId" label="Dokumen">
              {[...workspace.salesInvoices, ...workspace.purchaseBills, ...workspace.payments, ...workspace.stockAdjustments, ...workspace.stockTransfers].map((document) => (
                <option key={document.id} value={document.id}>
                  {"invoiceNo" in document ? document.invoiceNo : "billNo" in document ? document.billNo : "reference" in document ? document.reference : "adjustmentNo" in document ? document.adjustmentNo : document.transferNo}
                </option>
              ))}
            </SelectField>
            <TextField name="date" label="Tanggal koreksi" type="date" defaultValue="2026-06-28" />
            <TextField name="reason" label="Alasan" defaultValue="Koreksi dokumen" />
            <div className="sm:col-span-2">
              <ActionButton variant="danger" disabled={pending}>Batalkan Dokumen</ActionButton>
            </div>
          </form>
        </Panel>
      </div>
      <Panel title="Jurnal posted" description="Setiap row berasal dari dokumen operasional atau payroll.">
        <FilterBar placeholder="Cari jurnal/sumber/tanggal" value={query} onChange={setQuery}>
          <StatusPill tone={workspace.period.locked ? "red" : "emerald"}>
            {workspace.period.locked ? "Terkunci" : "Terbuka"}
          </StatusPill>
        </FilterBar>
        <DataTable columns={["Tanggal", "Deskripsi", "Sumber", "Status", "Debit total"]}>
          {filteredJournals.map((entry) => (
            <tr key={entry.id}>
              <td className="px-4 py-3 text-slate-500">{entry.date}</td>
              <td className="px-4 py-3 font-medium">{entry.description}</td>
              <td className="px-4 py-3">{entry.source}</td>
              <td className="px-4 py-3"><StatusPill tone="emerald">{entry.status}</StatusPill></td>
              <td className="px-4 py-3 text-right">{money(entry.lines.reduce((total, line) => total + line.debit, 0))}</td>
            </tr>
          ))}
        </DataTable>
      </Panel>
    </>
  );
}

export function ReportsWorkspaceV2({ initialWorkspace }: { initialWorkspace: ErpWorkspace }) {
  const { workspace, setWorkspace, request, activeBusinessId, loading: workspaceLoading, error: workspaceError } = useErpWorkspace(initialWorkspace);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [csvPreview, setCsvPreview] = useState<{
    totalRows: number;
    validRows: number;
    duplicateRows: number;
    errorRows: number;
    rows: Array<{ rowNumber: number; status: string; error?: string }>;
  } | null>(null);
  const [reconciliation, setReconciliation] = useState<Array<{
    summaryId: string;
    date: string;
    locationId: string;
    source: string;
    rawTotal: number;
    summaryTotal: number;
    settlementTotal: number;
    journalTotal: number;
    rawMatchesSummary: boolean;
    settlementMatchesSummary: boolean;
    journalMatchesSummary: boolean;
  }> | null>(null);

  async function previewRawCsv(formData: FormData) {
    setPending(true);
    setError(null);
    setSuccess(null);
    setCsvPreview(null);

    const locationId = String(formData.get("locationId"));
    const source = String(formData.get("source"));
    const csvText = String(formData.get("csvText"));

    try {
      const body = await postObject(request, "/api/erp/imports/preview", {
        locationId,
        source,
        csvText,
      });
      setCsvPreview(body.preview as typeof csvPreview);
      setSuccess("Preview CSV selesai. Commit hanya akan mengambil row valid.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Preview CSV gagal.");
    } finally {
      setPending(false);
    }
  }

  async function commitRawCsv(formData: FormData) {
    setPending(true);
    setError(null);
    setSuccess(null);

    try {
      const body = await postObject(request, "/api/erp/imports/commit", {
        locationId: String(formData.get("locationId")),
        source: String(formData.get("source")),
        csvText: String(formData.get("csvText")),
      });
      if (body.workspace) setWorkspace(body.workspace);
      setCsvPreview(body.preview as typeof csvPreview);
      setSuccess("CSV valid berhasil dicommit ke raw import batch.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Commit CSV gagal.");
    } finally {
      setPending(false);
    }
  }

  async function runBatchAction(endpoint: string, batchId: string, message: string) {
    setPending(true);
    setError(null);
    setSuccess(null);

    try {
      const body = await postObject(request, endpoint, { batchId });
      if (body.workspace) setWorkspace(body.workspace);
      setSuccess(message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Aksi batch gagal.");
    } finally {
      setPending(false);
    }
  }

  async function runSummaryAction(endpoint: string, summaryId: string, message: string) {
    setPending(true);
    setError(null);
    setSuccess(null);

    try {
      const body = await postObject(request, endpoint, { summaryId });
      if (body.workspace) setWorkspace(body.workspace);
      setSuccess(message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Aksi summary gagal.");
    } finally {
      setPending(false);
    }
  }

  async function loadReconciliation(formData: FormData) {
    setPending(true);
    setError(null);
    setSuccess(null);

    try {
      const params = new URLSearchParams({
        locationId: String(formData.get("locationId")),
        source: String(formData.get("source")),
        dateFrom: String(formData.get("dateFrom")),
        dateTo: String(formData.get("dateTo")),
      });
      const body = await request<{ reconciliation: NonNullable<typeof reconciliation> }>(`/api/erp/reconciliation?${params.toString()}`);
      setReconciliation(body.reconciliation);
      setSuccess("Rekonsiliasi raw-summary-settlement-journal dimuat.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Rekonsiliasi gagal dimuat.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <WorkspaceHeader
        title="Laporan"
        description="Laporan rekonsiliasi dari dokumen posted dan jurnal sumber. Export tetap tersedia PDF/XLSX."
        primaryAction={
          <button type="button" onClick={() => erpApiDownload("/api/exports/financials?format=xlsx", activeBusinessId)} className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white">
            <FileSpreadsheet className="size-4" />Export XLSX
          </button>
        }
        secondaryAction={
          <button type="button" onClick={() => erpApiDownload("/api/exports/financials?format=pdf", activeBusinessId)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800">
            <Download className="size-4" />Export PDF
          </button>
        }
      />
      <WorkspaceFeedback error={workspaceError ?? error} success={workspaceLoading ? "Memuat laporan production..." : success} />
      <div className="grid gap-5 xl:grid-cols-3">
        <Panel title="Laba rugi operasional">
          <div className="grid gap-3">
            <StatTile label="Pendapatan" value={money(workspace.metrics.revenue)} />
            <StatTile label="Gross margin" value={money(workspace.metrics.grossMargin)} />
            <StatTile label="Payroll cost" value={money(workspace.metrics.payrollCost)} />
          </div>
        </Panel>
        <Panel title="Posisi keuangan ringkas">
          <div className="grid gap-3">
            <StatTile label="Kas" value={money(workspace.metrics.cash)} />
            <StatTile label="Piutang" value={money(workspace.metrics.accountsReceivable)} />
            <StatTile label="Utang" value={money(workspace.metrics.accountsPayable)} />
          </div>
        </Panel>
        <Panel title="Laporan operasional">
          <div className="grid gap-3">
            <StatTile label="AR aging" value={money(workspace.metrics.overdueReceivables)} />
            <StatTile label="AP aging" value={money(workspace.metrics.overduePayables)} />
            <StatTile label="Nilai stok" value={money(workspace.metrics.inventoryValue)} />
          </div>
        </Panel>
      </div>
      <Panel title="Aging piutang">
        <DataTable columns={["Invoice", "Customer", "Due date", "Outstanding", "Status"]}>
          {workspace.salesInvoices.map((invoice) => (
            <tr key={invoice.id}>
              <td className="px-4 py-3 font-medium">{invoice.invoiceNo}</td>
              <td className="px-4 py-3">{customerName(workspace, invoice.customerId)}</td>
              <td className="px-4 py-3">{invoice.dueDate}</td>
              <td className="px-4 py-3 text-right">{money(outstandingSales(invoice))}</td>
              <td className="px-4 py-3"><StatusPill tone={statusTone(invoice.status)}>{invoice.status}</StatusPill></td>
            </tr>
          ))}
        </DataTable>
      </Panel>
      <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <Panel title="CSV raw transaction" description="Preview dan commit CSV POS/marketplace/bank ke raw layer sebelum validate, summarize, dan post jurnal harian.">
          <form className="grid gap-3">
            <SelectField name="locationId" label="Lokasi">
              {workspace.locations.map((location) => (
                <option key={location.id} value={location.id}>{location.name}</option>
              ))}
            </SelectField>
            <SelectField name="source" label="Source">
              <option value="pos_csv">POS CSV</option>
              <option value="marketplace_csv">Marketplace CSV</option>
              <option value="bank_csv">Bank CSV</option>
            </SelectField>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">CSV</span>
              <textarea
                name="csvText"
                rows={8}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                defaultValue={`date,external_id,gross_amount,discount_amount,tax_amount,net_amount,payment_method,customer_name,description\n${workspace.period.endDate},POS-001,75000,0,0,75000,qris,Walk-in,Penjualan harian\n${workspace.period.endDate},POS-002,50000,0,0,50000,cash,Walk-in,Penjualan harian`}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <ActionButton formAction={previewRawCsv} disabled={pending || workspace.locations.length === 0} variant="secondary">
                Preview CSV
              </ActionButton>
              <ActionButton formAction={commitRawCsv} disabled={pending || workspace.locations.length === 0}>
                Commit row valid
              </ActionButton>
            </div>
            {csvPreview ? (
              <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                <p className="font-medium">Preview: {csvPreview.validRows}/{csvPreview.totalRows} valid, {csvPreview.duplicateRows} duplicate, {csvPreview.errorRows} error.</p>
                {csvPreview.rows.filter((row) => row.status !== "valid").slice(0, 4).map((row) => (
                  <p key={row.rowNumber} className="mt-1 text-xs text-red-700">Row {row.rowNumber}: {row.error ?? row.status}</p>
                ))}
              </div>
            ) : null}
          </form>
        </Panel>
        <Panel title="Raw import batches">
          <DataTable columns={["Source", "Lokasi", "Status", "Rows", "Issue", "Aksi"]}>
            {workspace.rawImportBatches.map((batch) => (
              <tr key={batch.id}>
                <td className="px-4 py-3 font-medium">{batch.source}</td>
                <td className="px-4 py-3">{batch.locationId ? locationName(workspace, batch.locationId) : "-"}</td>
                <td className="px-4 py-3"><StatusPill tone={batch.status === "posted" ? "emerald" : batch.status === "failed" ? "red" : "amber"}>{batch.status}</StatusPill></td>
                <td className="px-4 py-3">{batch.validRows}/{batch.totalRows}</td>
                <td className="px-4 py-3">{batch.duplicateRows + batch.errorRows}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="text-sm font-medium text-cyan-700" onClick={() => runBatchAction("/api/erp/imports/validate", batch.id, "Batch divalidasi.")} disabled={pending}>Validate</button>
                    <button type="button" className="text-sm font-medium text-emerald-700" onClick={() => runBatchAction("/api/erp/imports/summarize", batch.id, "Batch diringkas harian.")} disabled={pending}>Summarize</button>
                  </div>
                </td>
              </tr>
            ))}
          </DataTable>
        </Panel>
      </div>
      <Panel title="Daily transaction summaries" description="Ringkasan inilah yang diposting ke jurnal, bukan setiap struk kecil.">
        <DataTable columns={["Tanggal", "Lokasi", "Source", "Status", "Transaksi", "Net", "Aksi"]}>
          {workspace.dailyTransactionSummaries.map((summary) => (
            <tr key={summary.id}>
              <td className="px-4 py-3">{summary.date}</td>
              <td className="px-4 py-3">{locationName(workspace, summary.locationId)}</td>
              <td className="px-4 py-3">{summary.source}</td>
              <td className="px-4 py-3"><StatusPill tone={summary.status === "posted" ? "emerald" : summary.status === "rolled_back" ? "red" : "amber"}>{summary.status}</StatusPill></td>
              <td className="px-4 py-3 text-right">{summary.transactionCount}</td>
              <td className="px-4 py-3 text-right">{money(summary.netAmount)}</td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="text-sm font-medium text-emerald-700" onClick={() => runSummaryAction("/api/erp/summaries/post", summary.id, "Summary diposting ke jurnal.")} disabled={pending || summary.status === "posted"}>Post</button>
                  <button type="button" className="text-sm font-medium text-red-700" onClick={() => runSummaryAction("/api/erp/summaries/rollback", summary.id, "Summary di-rollback.")} disabled={pending || summary.status === "rolled_back"}>Rollback</button>
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
      </Panel>
      <Panel title="Rekonsiliasi high-volume" description="Cek raw total = summary total = settlement total = journal total untuk periode/lokasi/source yang sama.">
        <form action={loadReconciliation} className="mb-4 grid gap-3 sm:grid-cols-5">
          <SelectField name="locationId" label="Lokasi">
            {workspace.locations.map((location) => (
              <option key={location.id} value={location.id}>{location.name}</option>
            ))}
          </SelectField>
          <SelectField name="source" label="Source">
            <option value="pos_csv">POS CSV</option>
            <option value="marketplace_csv">Marketplace CSV</option>
            <option value="bank_csv">Bank CSV</option>
            <option value="manual">Manual</option>
          </SelectField>
          <TextField name="dateFrom" label="Dari" type="date" defaultValue={workspace.period.startDate} />
          <TextField name="dateTo" label="Sampai" type="date" defaultValue={workspace.period.endDate} />
          <div className="flex items-end">
            <ActionButton disabled={pending || workspace.locations.length === 0}>Cek rekonsiliasi</ActionButton>
          </div>
        </form>
        <DataTable columns={["Tanggal", "Lokasi", "Source", "Raw", "Summary", "Settlement", "Journal", "Status"]}>
          {(reconciliation ?? []).map((row) => (
            <tr key={row.summaryId}>
              <td className="px-4 py-3">{row.date}</td>
              <td className="px-4 py-3">{locationName(workspace, row.locationId)}</td>
              <td className="px-4 py-3">{row.source}</td>
              <td className="px-4 py-3 text-right">{money(row.rawTotal)}</td>
              <td className="px-4 py-3 text-right">{money(row.summaryTotal)}</td>
              <td className="px-4 py-3 text-right">{money(row.settlementTotal)}</td>
              <td className="px-4 py-3 text-right">{money(row.journalTotal)}</td>
              <td className="px-4 py-3">
                <StatusPill tone={row.rawMatchesSummary && row.settlementMatchesSummary && row.journalMatchesSummary ? "emerald" : "red"}>
                  {row.rawMatchesSummary && row.settlementMatchesSummary && row.journalMatchesSummary ? "match" : "exception"}
                </StatusPill>
              </td>
            </tr>
          ))}
        </DataTable>
        {reconciliation?.length === 0 ? <EmptyState title="Tidak ada summary" description="Tidak ada daily summary untuk filter ini." /> : null}
      </Panel>
    </>
  );
}

export function HrWorkspaceV2({ initialWorkspace }: { initialWorkspace: ErpWorkspace }) {
  const { workspace, setWorkspace, request, loading: workspaceLoading, error: workspaceError } = useErpWorkspace(initialWorkspace);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function runPayroll(formData: FormData) {
    setPending(true);
    setError(null);
    setSuccess(null);

    try {
      const body = await postJson(request, "/api/erp/payroll-runs", {
        employeeId: String(formData.get("employeeId")),
        grossPay: Number(formData.get("grossPay")),
        netCashPaid: Number(formData.get("netCashPaid")),
        taxWithheld: Number(formData.get("taxWithheld")),
        date: String(formData.get("date")),
      });
      if (body.workspace) setWorkspace(body.workspace);
      setSuccess("Payroll run dipost dan jurnal gaji dibuat.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Payroll gagal dipost.");
    } finally {
      setPending(false);
    }
  }

  async function saveEmployee(formData: FormData) {
    setPending(true);
    setError(null);
    setSuccess(null);

    try {
      const body = await postObject(request, "/api/erp/master-data", {
        resource: "employee",
        values: {
          employeeNo: String(formData.get("employeeNo")),
          name: String(formData.get("name")),
          role: String(formData.get("role")),
          contractType: String(formData.get("contractType")),
          status: String(formData.get("status")),
          baseSalary: Number(formData.get("baseSalary")),
          dailyRate: Number(formData.get("dailyRate")),
          joinedAt: String(formData.get("joinedAt")),
        },
      });
      if (body.workspace) setWorkspace(body.workspace);
      setSuccess("Data karyawan disimpan.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Karyawan gagal disimpan.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <WorkspaceHeader
        title="HR & Payroll"
        description="Employee CRUD, attendance summary, leave request, payroll run, payslip, dan jurnal biaya gaji."
        primaryAction={<ActionButton form="payroll-form" disabled={pending}><UsersRound className="size-4" />Run payroll</ActionButton>}
      />
      <WorkspaceFeedback error={workspaceError ?? error} success={workspaceLoading ? "Memuat data HR production..." : success} />
      <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
        <Panel title="Run payroll">
          <form id="payroll-form" action={runPayroll} className="grid gap-3 sm:grid-cols-2">
            <SelectField name="employeeId" label="Karyawan">
              {workspace.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
            </SelectField>
            <TextField name="date" label="Tanggal payroll" type="date" defaultValue="2026-06-28" />
            <TextField name="grossPay" label="Gross pay" type="number" defaultValue={5_200_000} />
            <TextField name="netCashPaid" label="Net cash paid" type="number" defaultValue={4_800_000} />
            <TextField name="taxWithheld" label="PPh dipotong" type="number" defaultValue={200_000} />
          </form>
        </Panel>
        <Panel title="Attendance summary">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile label="Present" value={String(workspace.attendance.filter((item) => item.status === "present").length)} />
            <StatTile label="Leave" value={String(workspace.attendance.filter((item) => item.status === "leave").length)} />
            <StatTile label="Sick/absent" value={String(workspace.attendance.filter((item) => item.status === "sick" || item.status === "absent").length)} />
          </div>
        </Panel>
      </div>
      <Panel title="Tambah karyawan">
        <form action={saveEmployee} className="grid gap-3 sm:grid-cols-3">
          <TextField name="employeeNo" label="No karyawan" defaultValue={`EMP-${String(workspace.employees.length + 1).padStart(3, "0")}`} />
          <TextField name="name" label="Nama" defaultValue="Karyawan Baru" />
          <TextField name="role" label="Jabatan" defaultValue="Staff operasional" />
          <SelectField name="contractType" label="Kontrak">
            <option value="permanent">Permanent</option>
            <option value="contract">Contract</option>
            <option value="daily">Daily</option>
          </SelectField>
          <SelectField name="status" label="Status">
            <option value="active">Active</option>
            <option value="contract">Contract</option>
            <option value="inactive">Inactive</option>
          </SelectField>
          <TextField name="joinedAt" label="Tanggal masuk" type="date" defaultValue="2026-06-01" />
          <TextField name="baseSalary" label="Base salary" type="number" defaultValue={3_500_000} />
          <TextField name="dailyRate" label="Daily rate" type="number" defaultValue={150_000} />
          <div className="flex items-end">
            <ActionButton disabled={pending}>Simpan karyawan</ActionButton>
          </div>
        </form>
      </Panel>
      <Panel title="Karyawan">
        <DataTable columns={["No", "Nama", "Jabatan", "Kontrak", "Status", "Base salary"]}>
          {workspace.employees.map((employee) => (
            <tr key={employee.id}>
              <td className="px-4 py-3 text-slate-500">{employee.employeeNo}</td>
              <td className="px-4 py-3 font-medium">{employee.name}</td>
              <td className="px-4 py-3">{employee.role}</td>
              <td className="px-4 py-3">{employee.contractType}</td>
              <td className="px-4 py-3"><StatusPill tone="emerald">{employee.status}</StatusPill></td>
              <td className="px-4 py-3 text-right">{money(employee.baseSalary || employee.dailyRate || 0)}</td>
            </tr>
          ))}
        </DataTable>
      </Panel>
      <Panel title="Payroll runs" description="Run payroll yang sudah dipost dan terhubung ke jurnal gaji.">
        <DataTable columns={["Periode", "Karyawan", "Gross", "Net paid", "Pajak", "Journal"]}>
          {workspace.payrollRuns.map((payroll) => (
            <tr key={payroll.id}>
              <td className="px-4 py-3 text-slate-500">{payroll.period}</td>
              <td className="px-4 py-3 font-medium">{workspace.employees.find((employee) => employee.id === payroll.employeeId)?.name ?? "Karyawan"}</td>
              <td className="px-4 py-3 text-right">{money(payroll.grossPay)}</td>
              <td className="px-4 py-3 text-right">{money(payroll.netPay)}</td>
              <td className="px-4 py-3 text-right">{money(payroll.taxWithheld)}</td>
              <td className="px-4 py-3"><StatusPill tone={payroll.journalEntryId ? "emerald" : "amber"}>{payroll.journalEntryId ? "posted" : "pending"}</StatusPill></td>
            </tr>
          ))}
        </DataTable>
      </Panel>
    </>
  );
}

export function TaxWorkspaceV2({ initialWorkspace }: { initialWorkspace: ErpWorkspace }) {
  const { workspace, setWorkspace, request, loading: workspaceLoading, error: workspaceError } = useErpWorkspace(initialWorkspace);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const jsonHref = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify({
    business: workspace.business.displayName,
    period: workspace.period.label,
    revenue: workspace.metrics.revenue,
    estimatedFinalTax: workspace.metrics.taxEstimate,
    coretaxStatus: workspace.taxProfile.coretaxStatus,
  }, null, 2))}`;

  async function saveAttachment(formData: FormData) {
    setPending(true);
    setError(null);
    setSuccess(null);

    try {
      const ownerId = workspace.salesInvoices[0]?.id ?? workspace.purchaseBills[0]?.id ?? workspace.payments[0]?.id;
      const ownerType = workspace.salesInvoices[0] ? "sales_invoice" : workspace.purchaseBills[0] ? "purchase_bill" : "payment";
      const file = formData.get("file");

      if (!ownerId) {
        throw new Error("Buat dokumen sales, purchase, atau payment terlebih dahulu sebelum upload attachment.");
      }

      if (!(file instanceof File) || file.size === 0) {
        throw new Error("Pilih file attachment yang akan diupload.");
      }

      const mimeType = file.type || "application/octet-stream";
      const signedUpload = await postObject(request, "/api/erp/attachments/signed-upload", {
        ownerType,
        ownerId,
        fileName: file.name,
        mimeType,
        sizeBytes: file.size,
      });
      const storagePath = String(signedUpload.storagePath);
      const uploadToken = String(signedUpload.uploadToken ?? signedUpload.token ?? "");
      const bucket = String(signedUpload.bucket ?? "erp-attachments");

      if (!String(signedUpload.signedUrl ?? "").startsWith("/demo-upload/")) {
        const supabase = createBrowserSupabaseClient();
        const { error: uploadError } = await supabase.storage.from(bucket).uploadToSignedUrl(storagePath, uploadToken, file);
        if (uploadError) throw uploadError;
      }

      const body = await postObject(request, "/api/erp/attachments", {
        ownerType,
        ownerId,
        fileName: file.name,
        storagePath,
        mimeType,
        sizeBytes: file.size,
      });
      if (body.workspace) setWorkspace(body.workspace);
      setSuccess("Attachment diupload dan metadata dicatat.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Attachment gagal dicatat.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <WorkspaceHeader
        title="Pajak"
        description="Estimasi PPh final UMKM, checklist Coretax, dan paket data untuk input manual atau partner resmi."
        primaryAction={<a href={jsonHref} download="coretax-prep.json" className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white"><Landmark className="size-4" />Export Coretax prep</a>}
      />
      <WorkspaceFeedback error={workspaceError ?? error} success={workspaceLoading ? "Memuat data pajak production..." : success} />
      <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <Panel title="Estimasi PPh final">
          <div className="rounded-lg bg-emerald-50 p-5">
            <p className="text-sm text-emerald-800">Omzet posted x tarif {(workspace.taxProfile.finalUmkmRate * 100).toFixed(1)}%</p>
            <p className="mt-2 text-3xl font-semibold text-emerald-950">{money(workspace.metrics.taxEstimate)}</p>
          </div>
        </Panel>
        <Panel title="Checklist Coretax">
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ["Akun Coretax", workspace.taxProfile.coretaxStatus !== "not_started"],
              ["Rekonsiliasi omzet", workspace.metrics.revenue > 0],
              ["Lampiran transaksi", workspace.attachments.length > 0],
              ["Review advisor", false],
            ].map(([label, done]) => (
              <div key={String(label)} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
                {done ? <CheckCircle2 className="size-5 text-emerald-700" /> : <Clock3 className="size-5 text-amber-700" />}
                <p className="font-medium">{label}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <Panel title="Attachment Coretax" description="Upload file ke Supabase Storage tenant-isolated, lalu catat metadata attachment pada dokumen sumber.">
        <form action={saveAttachment} className="grid gap-3">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">File lampiran</span>
            <input
              name="file"
              type="file"
              required
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
            />
          </label>
          <div>
            <ActionButton disabled={pending}>Upload attachment</ActionButton>
          </div>
        </form>
      </Panel>
    </>
  );
}

export function SettingsWorkspace({ initialWorkspace }: { initialWorkspace: ErpWorkspace }) {
  const { workspace, setWorkspace, request, businesses, activeBusinessId, setActiveBusinessId, loading, error: workspaceError, demoMode } = useErpWorkspace(initialWorkspace);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function saveMaster(resource: string, values: Record<string, unknown>, id?: string) {
    setPending(true);
    setError(null);
    setSuccess(null);

    try {
      const body = await postObject(request, "/api/erp/master-data", { resource, id, values });
      if (body.workspace) setWorkspace(body.workspace);
      setSuccess(`${resource} disimpan.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `${resource} gagal disimpan.`);
    } finally {
      setPending(false);
    }
  }

  async function archiveMaster(resource: string, id: string) {
    setPending(true);
    setError(null);
    setSuccess(null);

    try {
      const body = await postObject(request, "/api/erp/master-data", { resource, id }, "DELETE");
      if (body.workspace) setWorkspace(body.workspace);
      setSuccess(`${resource} dinonaktifkan.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `${resource} gagal dinonaktifkan.`);
    } finally {
      setPending(false);
    }
  }

  function saveBusiness(formData: FormData) {
    return saveMaster("business", {
      displayName: String(formData.get("displayName")),
      legalName: String(formData.get("legalName")),
      ownerName: String(formData.get("ownerName")),
      industry: String(formData.get("industry")),
      taxId: String(formData.get("taxId")),
      periodStartMonth: Number(formData.get("periodStartMonth")),
    });
  }

  function saveTax(formData: FormData) {
    return saveMaster("tax_profile", {
      taxpayerType: String(formData.get("taxpayerType")),
      usesFinalUmkmRate: String(formData.get("usesFinalUmkmRate")) === "true",
      finalUmkmRate: Number(formData.get("finalUmkmRate")),
      coretaxStatus: String(formData.get("coretaxStatus")),
    });
  }

  function saveCustomer(formData: FormData) {
    return saveMaster("customer", {
      code: String(formData.get("code")),
      name: String(formData.get("name")),
      phone: String(formData.get("phone")),
      email: String(formData.get("email")),
      address: String(formData.get("address")),
      creditLimit: Number(formData.get("creditLimit")),
      isActive: true,
    });
  }

  function saveSupplier(formData: FormData) {
    return saveMaster("supplier", {
      code: String(formData.get("code")),
      name: String(formData.get("name")),
      phone: String(formData.get("phone")),
      email: String(formData.get("email")),
      address: String(formData.get("address")),
      isActive: true,
    });
  }

  function saveProduct(formData: FormData) {
    const productType = String(formData.get("productType"));
    return saveMaster("product", {
      sku: String(formData.get("sku")),
      name: String(formData.get("name")),
      productType,
      category: String(formData.get("category")),
      unit: String(formData.get("unit")),
      trackStock: productType === "stock_item" ? true : productType === "service" ? false : String(formData.get("trackStock")) === "true",
      defaultWarehouseId: String(formData.get("defaultWarehouseId")),
      sellingPrice: Number(formData.get("sellingPrice")),
      purchasePrice: Number(formData.get("purchasePrice")),
      reorderPoint: Number(formData.get("reorderPoint")),
      isSellable: true,
      isPurchasable: true,
      isActive: true,
    });
  }

  async function applyTemplate(formData: FormData) {
    setPending(true);
    setError(null);
    setSuccess(null);

    try {
      const body = await postObject(request, "/api/erp/templates/apply", {
        templateId: String(formData.get("templateId")),
      });
      if (body.workspace) setWorkspace(body.workspace);
      setSuccess("Template industri diterapkan.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Template gagal diterapkan.");
    } finally {
      setPending(false);
    }
  }

  async function saveLocation(formData: FormData) {
    setPending(true);
    setError(null);
    setSuccess(null);

    try {
      const body = await postObject(request, "/api/erp/locations", {
        code: String(formData.get("code")),
        name: String(formData.get("name")),
        type: String(formData.get("type")),
        warehouseId: String(formData.get("warehouseId")),
        isActive: true,
      });
      if (body.workspace) setWorkspace(body.workspace);
      setSuccess("Lokasi disimpan.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Lokasi gagal disimpan.");
    } finally {
      setPending(false);
    }
  }

  function saveWarehouse(formData: FormData) {
    return saveMaster("warehouse", {
      code: String(formData.get("code")),
      name: String(formData.get("name")),
      location: String(formData.get("location")),
      isActive: true,
    });
  }

  async function saveMember(formData: FormData) {
    setPending(true);
    setError(null);
    setSuccess(null);

    try {
      const body = await postObject(request, "/api/erp/members", {
        email: String(formData.get("email") || "") || undefined,
        authUserId: String(formData.get("authUserId") || "") || undefined,
        role: String(formData.get("role")),
      });
      if (body.workspace) setWorkspace(body.workspace);
      setSuccess(body.invite ? "Invite email dibuat dan menunggu diterima." : "Member bisnis disimpan.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Member gagal disimpan.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <WorkspaceHeader
        title="Settings"
        description="Admin workspace untuk profil bisnis, pajak, role aktif, master data, periode, produk, gudang, dan kesiapan integrasi."
      />
      <WorkspaceFeedback error={workspaceError ?? error} success={loading ? "Memuat settings production..." : success ?? (demoMode ? "Demo fallback aktif. Data tersimpan di demo store selama sesi berjalan." : null)} />
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Profil bisnis">
          <form action={saveBusiness} className="grid gap-3 sm:grid-cols-2">
            <TextField name="displayName" label="Nama display" defaultValue={workspace.business.displayName} />
            <TextField name="legalName" label="Nama legal" defaultValue={workspace.business.legalName} />
            <TextField name="ownerName" label="Pemilik" defaultValue={workspace.business.ownerName} />
            <TextField name="taxId" label="NPWP" defaultValue={workspace.business.taxId ?? ""} />
            <SelectField name="industry" label="Industri" defaultValue={workspace.business.industry}>
              <option value="retail">Retail</option>
              <option value="food_beverage">F&B</option>
              <option value="service">Jasa</option>
              <option value="online_seller">Online seller</option>
              <option value="manufacturing">Manufacturing</option>
              <option value="general">General</option>
            </SelectField>
            <TextField name="periodStartMonth" label="Bulan awal periode" type="number" defaultValue={workspace.business.periodStartMonth} />
            <div className="sm:col-span-2">
              <ActionButton disabled={pending}>Simpan profil bisnis</ActionButton>
            </div>
          </form>
        </Panel>
        <Panel title="User, role, dan bisnis aktif">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
              <div>
                <p className="font-medium">{workspace.user.name}</p>
                <p className="text-sm text-slate-500">{workspace.user.email || workspace.user.id}</p>
              </div>
              <StatusPill tone="gray">{workspace.user.role}</StatusPill>
            </div>
            <SelectField label="Business switcher" value={activeBusinessId} onChange={(event) => setActiveBusinessId(event.target.value)}>
              {businesses.map((business) => (
                <option key={business.id} value={business.id}>
                  {business.displayName} - {business.role}
                </option>
              ))}
            </SelectField>
            <form action={saveMember} className="grid gap-3 rounded-lg border border-slate-200 p-3">
              <TextField name="email" label="Email invite" type="email" placeholder="finance@usaha.co.id" />
              <TextField name="authUserId" label="Supabase auth user id opsional" placeholder="Isi hanya jika user sudah terdaftar" />
              <SelectField name="role" label="Role">
                <option value="staff">Staff</option>
                <option value="finance_admin">Finance/Admin</option>
                <option value="hr">HR</option>
                <option value="external_advisor">External advisor</option>
                <option value="owner">Owner</option>
              </SelectField>
              <ActionButton disabled={pending}>Invite/update member</ActionButton>
            </form>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-sm font-medium text-slate-900">Pending invites</p>
              <div className="mt-3 space-y-2">
                {workspace.memberInvites.filter((invite) => invite.status === "pending").map((invite) => (
                  <div key={invite.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate">{invite.email}</span>
                    <StatusPill tone="amber">{invite.role}</StatusPill>
                  </div>
                ))}
                {workspace.memberInvites.filter((invite) => invite.status === "pending").length === 0 ? (
                  <p className="text-sm text-slate-500">Belum ada invite pending.</p>
                ) : null}
              </div>
            </div>
          </div>
        </Panel>
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        <Panel title="Periode aktif">
          <StatTile label="Periode aktif" value={workspace.period.label} helper={workspace.period.locked ? "Locked" : "Open"} />
        </Panel>
        <Panel title="Profil pajak">
          <form action={saveTax} className="grid gap-3">
            <SelectField name="taxpayerType" label="Tipe wajib pajak" defaultValue={workspace.taxProfile.taxpayerType}>
              <option value="individual_umkm">Orang pribadi UMKM</option>
              <option value="corporate_umkm">Badan UMKM</option>
            </SelectField>
            <SelectField name="usesFinalUmkmRate" label="PPh final UMKM" defaultValue={String(workspace.taxProfile.usesFinalUmkmRate)}>
              <option value="true">Aktif</option>
              <option value="false">Nonaktif</option>
            </SelectField>
            <TextField name="finalUmkmRate" label="Tarif" type="number" step="0.001" defaultValue={workspace.taxProfile.finalUmkmRate} />
            <SelectField name="coretaxStatus" label="Coretax status" defaultValue={workspace.taxProfile.coretaxStatus}>
              <option value="not_started">Not started</option>
              <option value="account_ready">Account ready</option>
              <option value="certificate_ready">Certificate ready</option>
            </SelectField>
            <ActionButton disabled={pending}>Simpan pajak</ActionButton>
          </form>
        </Panel>
        <Panel title="Supabase">
          <EmptyState title={demoMode ? "Demo fallback" : "Production persistence aktif"} description={demoMode ? "Isi env Supabase dan apply migration 001-006 agar data production aktif." : "Workspace membaca/menulis data melalui Supabase API dan RLS."} />
        </Panel>
      </div>
      <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <Panel title="Template dan modul bisnis" description="Template mengaktifkan modul sesuai jenis UMKM: jasa, retail, F&B, online seller, distributor, atau general.">
          <form action={applyTemplate} className="grid gap-3">
            <SelectField name="templateId" label="Template industri" defaultValue={workspace.business.industry}>
              {workspace.industryTemplates.map((template) => (
                <option key={template.id} value={template.id}>{template.name}</option>
              ))}
            </SelectField>
            <ActionButton disabled={pending}>Apply template</ActionButton>
          </form>
        </Panel>
        <Panel title="Modul aktif">
          <div className="flex flex-wrap gap-2">
            {workspace.featureFlags.map((flag) => (
              <StatusPill key={flag.id} tone={flag.enabled ? "emerald" : "gray"}>{flag.module}</StatusPill>
            ))}
          </div>
        </Panel>
      </div>
      <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <Panel title="Tambah lokasi/cabang">
          <form action={saveLocation} className="grid gap-3 sm:grid-cols-2">
            <TextField name="code" label="Kode" defaultValue={`LOC-${String(workspace.locations.length + 1).padStart(3, "0")}`} />
            <TextField name="name" label="Nama lokasi" defaultValue="Outlet Baru" />
            <SelectField name="type" label="Tipe">
              <option value="branch">Branch</option>
              <option value="outlet">Outlet</option>
              <option value="store">Store</option>
              <option value="warehouse">Warehouse</option>
              <option value="workshop">Workshop</option>
              <option value="office">Office</option>
            </SelectField>
            <SelectField name="warehouseId" label="Gudang terkait">
              {workspace.warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
            </SelectField>
            <div className="sm:col-span-2"><ActionButton disabled={pending}>Simpan lokasi</ActionButton></div>
          </form>
        </Panel>
        <Panel title="Lokasi aktif">
          <DataTable columns={["Kode", "Nama", "Tipe", "Gudang", "Status"]}>
            {workspace.locations.map((location) => (
              <tr key={location.id}>
                <td className="px-4 py-3 font-medium">{location.code}</td>
                <td className="px-4 py-3">{location.name}</td>
                <td className="px-4 py-3">{location.type}</td>
                <td className="px-4 py-3">{location.warehouseId ? warehouseName(workspace, location.warehouseId) : "-"}</td>
                <td className="px-4 py-3"><StatusPill tone={location.isActive ? "emerald" : "gray"}>{location.isActive ? "active" : "inactive"}</StatusPill></td>
              </tr>
            ))}
          </DataTable>
        </Panel>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Tambah customer">
          <form action={saveCustomer} className="grid gap-3 sm:grid-cols-2">
            <TextField name="code" label="Kode" defaultValue={`CUST-${String(workspace.customers.length + 1).padStart(3, "0")}`} />
            <TextField name="name" label="Nama" defaultValue="Customer Baru" />
            <TextField name="phone" label="Telepon" />
            <TextField name="email" label="Email" type="email" />
            <TextField name="address" label="Alamat" />
            <TextField name="creditLimit" label="Credit limit" type="number" defaultValue={5_000_000} />
            <div className="sm:col-span-2"><ActionButton disabled={pending}>Simpan customer</ActionButton></div>
          </form>
        </Panel>
        <Panel title="Tambah supplier">
          <form action={saveSupplier} className="grid gap-3 sm:grid-cols-2">
            <TextField name="code" label="Kode" defaultValue={`SUP-${String(workspace.suppliers.length + 1).padStart(3, "0")}`} />
            <TextField name="name" label="Nama" defaultValue="Supplier Baru" />
            <TextField name="phone" label="Telepon" />
            <TextField name="email" label="Email" type="email" />
            <TextField name="address" label="Alamat" />
            <div className="sm:col-span-2"><ActionButton disabled={pending}>Simpan supplier</ActionButton></div>
          </form>
        </Panel>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Tambah produk">
          <form action={saveProduct} className="grid gap-3 sm:grid-cols-2">
            <TextField name="sku" label="SKU" defaultValue={`SKU-${String(workspace.products.length + 1).padStart(3, "0")}`} />
            <TextField name="name" label="Nama" defaultValue="Produk Baru" />
            <SelectField name="productType" label="Tipe produk">
              <option value="stock_item">Stock item</option>
              <option value="non_stock_item">Non-stock item</option>
              <option value="service">Service</option>
              <option value="bundle">Bundle</option>
            </SelectField>
            <TextField name="category" label="Kategori" defaultValue="Umum" />
            <TextField name="unit" label="Satuan" defaultValue="pcs" />
            <SelectField name="trackStock" label="Track stock">
              <option value="true">Ya</option>
              <option value="false">Tidak</option>
            </SelectField>
            <SelectField name="defaultWarehouseId" label="Gudang default">
              {workspace.warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
            </SelectField>
            <TextField name="sellingPrice" label="Harga jual" type="number" defaultValue={50_000} />
            <TextField name="purchasePrice" label="Harga beli" type="number" defaultValue={25_000} />
            <TextField name="reorderPoint" label="Reorder point" type="number" defaultValue={5} />
            <div className="sm:col-span-2"><ActionButton disabled={pending}>Simpan produk</ActionButton></div>
          </form>
        </Panel>
        <Panel title="Tambah gudang">
          <form action={saveWarehouse} className="grid gap-3 sm:grid-cols-2">
            <TextField name="code" label="Kode" defaultValue={`WH-${String(workspace.warehouses.length + 1).padStart(3, "0")}`} />
            <TextField name="name" label="Nama" defaultValue="Gudang Baru" />
            <TextField name="location" label="Lokasi" defaultValue="Outlet utama" />
            <div className="flex items-end"><ActionButton disabled={pending}>Simpan gudang</ActionButton></div>
          </form>
        </Panel>
      </div>
      <Panel title="Master data aktif">
        <DataTable columns={["Jenis", "Kode", "Nama", "Status", "Aksi"]}>
          {[
            ...workspace.customers.map((item) => ({ resource: "customer", id: item.id, code: item.code, name: item.name, active: item.isActive })),
            ...workspace.suppliers.map((item) => ({ resource: "supplier", id: item.id, code: item.code, name: item.name, active: item.isActive })),
            ...workspace.products.map((item) => ({ resource: "product", id: item.id, code: item.sku, name: item.name, active: item.isActive !== false })),
            ...workspace.warehouses.map((item) => ({ resource: "warehouse", id: item.id, code: item.code, name: item.name, active: item.isActive })),
          ].map((item) => (
            <tr key={`${item.resource}-${item.id}`}>
              <td className="px-4 py-3 text-slate-500">{item.resource}</td>
              <td className="px-4 py-3 font-medium">{item.code}</td>
              <td className="px-4 py-3">{item.name}</td>
              <td className="px-4 py-3"><StatusPill tone={item.active ? "emerald" : "gray"}>{item.active ? "active" : "inactive"}</StatusPill></td>
              <td className="px-4 py-3">
                {item.active ? (
                  <button type="button" className="text-sm font-medium text-red-700" onClick={() => archiveMaster(item.resource, item.id)} disabled={pending}>
                    Nonaktifkan
                  </button>
                ) : "-"}
              </td>
            </tr>
          ))}
        </DataTable>
      </Panel>
    </>
  );
}

export function OnboardingWorkspaceV2({ initialWorkspace }: { initialWorkspace: ErpWorkspace }) {
  const { refreshWorkspace, request, demoMode, setActiveBusinessId } = useErpWorkspace(initialWorkspace);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function createBusiness(formData: FormData) {
    setPending(true);
    setError(null);
    setSuccess(null);

    try {
      const body = await request<{ businessId: string }>("/api/erp/businesses", {
        method: "POST",
        businessId: null,
        body: JSON.stringify({
          legalName: String(formData.get("legalName")),
          displayName: String(formData.get("displayName")),
          industry: String(formData.get("industry")),
          ownerName: String(formData.get("ownerName")),
          taxId: String(formData.get("taxId")),
        }),
      });

      if (body.businessId) {
        setActiveBusinessId(body.businessId);
        await syncServerSession(body.businessId);
      }

      await refreshWorkspace();
      setSuccess(demoMode ? "Demo mode aktif; bisnis demo digunakan." : "Bisnis dibuat, template diterapkan, dan bootstrap awal dijalankan.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Onboarding bisnis gagal.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <WorkspaceHeader
        title="Onboarding bisnis"
        description="Buat tenant produksi dengan role owner, template industri, modul aktif, COA, periode awal, pajak, gudang, lokasi default, dan sequence dokumen."
      />
      <WorkspaceFeedback error={error} success={success} />
      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Panel title="Buat bisnis baru">
          <form action={createBusiness} className="grid gap-3 sm:grid-cols-2">
            <TextField name="displayName" label="Nama display" defaultValue="Rasa Rapi" required />
            <TextField name="legalName" label="Nama legal" defaultValue="CV Rasa Rapi" required />
            <TextField name="ownerName" label="Nama owner" defaultValue="Ayu Lestari" required />
            <TextField name="taxId" label="NPWP" />
            <SelectField name="industry" label="Template industri">
              <option value="food_beverage">F&B ringan</option>
              <option value="retail">Retail</option>
              <option value="service">Jasa</option>
              <option value="online_seller">Online seller</option>
              <option value="general">General</option>
            </SelectField>
            <div className="flex items-end">
              <ActionButton disabled={pending}>Buat bisnis</ActionButton>
            </div>
          </form>
        </Panel>
        <Panel title="Setup yang otomatis dibuat">
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ["Chart of accounts", "Akun kas, AR, AP, inventory, revenue, COGS, payroll, pajak."],
              ["Periode awal", "Periode bulan berjalan dibuat open untuk posting awal."],
              ["Pajak UMKM", "Default PPh final UMKM 0.5% dan status Coretax not started."],
              ["Gudang default", "Gudang UTAMA dibuat untuk SKU pertama dan stok."],
              ["Lokasi dan modul", "Template industri mengaktifkan modul dan lokasi awal untuk cabang/outlet."],
              ["Raw transaction layer", "POS/marketplace/bank CSV masuk raw layer sebelum summary posting."],
            ].map(([title, description]) => (
              <div key={title} className="rounded-lg border border-slate-200 p-3">
                <p className="font-medium text-slate-950">{title}</p>
                <p className="mt-1 text-sm text-slate-500">{description}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}

export function LoginWorkspace() {
  const router = useRouter();
  const captchaRef = useRef<HCaptchaInstance | null>(null);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const demoFallback = shouldUseDemoFallbackBrowser();
  const supabaseEnabled = !demoFallback;
  const [checkingSession, setCheckingSession] = useState(supabaseEnabled);
  const hcaptchaSiteKey = process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY;
  const captchaEnabled = supabaseEnabled && Boolean(hcaptchaSiteKey);

  useEffect(() => {
    if (!supabaseEnabled) return;

    let cancelled = false;

    async function redirectActiveSession() {
      try {
        const reason =
          typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("reason");

        if (reason === "session-expired" || reason === "session-revoked") {
          await createBrowserSupabaseClient().auth.signOut().catch(() => undefined);
          await clearServerSession();

          if (!cancelled) {
            setError(
              reason === "session-revoked"
                ? "Sesi perangkat ini sudah dikeluarkan dari menu Security."
                : "Sesi berakhir karena tidak aktif. Silakan login kembali.",
            );
            setCheckingSession(false);
          }
          return;
        }

        const supabase = createBrowserSupabaseClient();
        const { data } = await supabase.auth.getSession();

        if (!data.session) {
          if (!cancelled) setCheckingSession(false);
          return;
        }

        setPending(true);
        const session = await Promise.race([
          syncServerSession(null, {
            accessToken: data.session.access_token,
            refreshToken: data.session.refresh_token,
            userId: data.session.user.id,
          }),
          new Promise<null>((resolve) => {
            window.setTimeout(() => resolve(null), 8_000);
          }),
        ]);

        if (cancelled) return;

        if (session) {
          router.replace(destinationAfterLogin(currentLoginNextPath(), session.hasBusiness));
          return;
        }

        await supabase.auth.signOut().catch(() => undefined);
        await clearServerSession();
        setPending(false);
        setError("Sesi lama tidak bisa dipulihkan. Silakan login ulang.");
        setCheckingSession(false);
      } catch {
        if (!cancelled) {
          await createBrowserSupabaseClient().auth.signOut().catch(() => undefined);
          await clearServerSession();
          setPending(false);
          setError("Sesi lama tidak bisa dipulihkan. Silakan login ulang.");
          setCheckingSession(false);
        }
      }
    }

    void redirectActiveSession();

    return () => {
      cancelled = true;
    };
  }, [router, supabaseEnabled]);

  function switchAuthMode(nextMode: "login" | "register") {
    setMode(nextMode);
    setCaptchaToken(null);
    captchaRef.current?.resetCaptcha();
  }

  async function submitAuth(formData: FormData) {
    setPending(true);
    setError(null);
    setSuccess(null);

    const email = String(formData.get("email"));
    const password = String(formData.get("password"));
    const rememberMe = formData.get("rememberMe") === "on";

    if (demoFallback) {
      setSuccess("Demo mode aktif. Supabase env belum dikonfigurasi.");
      setPending(false);
      router.replace(sanitizeLoginNextPath(currentLoginNextPath()));
      return;
    }

    try {
      if (captchaEnabled && !captchaToken) {
        setError("Selesaikan verifikasi hCaptcha terlebih dahulu.");
        setPending(false);
        return;
      }

      const supabase = createBrowserSupabaseClient();
      const verificationUrl =
        typeof window === "undefined" ? undefined : new URL("/login", window.location.origin);
      const nextParam =
        typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("next");

      if (verificationUrl && nextParam) {
        verificationUrl.searchParams.set("next", nextParam);
      }

      const captchaOptions = captchaToken ? { captchaToken } : {};
      const result =
        mode === "login"
          ? await supabase.auth.signInWithPassword({ email, password, options: captchaOptions })
          : await supabase.auth.signUp({
              email,
              password,
              options: {
                ...captchaOptions,
                ...(verificationUrl ? { emailRedirectTo: verificationUrl.toString() } : {}),
              },
            });

      if (result.error) {
        throw result.error;
      }

      if (!result.data.session) {
        setSuccess("Registrasi berhasil. Cek email untuk konfirmasi sebelum login.");
        return;
      }

      const signedInTokens = {
        accessToken: result.data.session.access_token,
        refreshToken: result.data.session.refresh_token,
        userId: result.data.session.user.id,
      };
      const session = await syncServerSession(null, signedInTokens, { rememberMe, freshLogin: true });
      const requestedNext = currentLoginNextPath();

      if (!session) {
        throw new Error("Login berhasil, tapi sesi server belum tersimpan. Coba klik Masuk sekali lagi.");
      }

      const bootstrap = await tryBootstrapDemoAccount();

      if (bootstrap?.demoAccount && bootstrap.businessId) {
        const syncedDemoSession = await syncServerSession(bootstrap.businessId, signedInTokens, { rememberMe });
        setSuccess("Login demo berhasil. Sandbox demo siap dipakai.");
        router.replace(destinationAfterLogin(requestedNext, Boolean(syncedDemoSession?.hasBusiness ?? true)));
        return;
      }

      if (session.hasBusiness) {
        setSuccess(mode === "login" ? "Login berhasil." : "Registrasi berhasil.");
        router.replace(destinationAfterLogin(requestedNext, true));
        return;
      }

      setSuccess("Login berhasil. Lanjutkan setup bisnis pertama.");
      router.replace(destinationAfterLogin(requestedNext, false));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Auth gagal diproses.");
    } finally {
      if (captchaEnabled) {
        setCaptchaToken(null);
        captchaRef.current?.resetCaptcha();
      }
      setPending(false);
    }
  }

  if (checkingSession) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md items-center overflow-x-clip px-4 py-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <div className="w-full rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <div className="mx-auto mb-4 size-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-950" aria-hidden />
          <p className="text-sm font-semibold text-slate-950">Memulihkan sesi...</p>
          <p className="mt-1 text-sm text-slate-500">Anda akan diarahkan otomatis jika sesi login masih aktif.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md items-center overflow-x-clip px-4 py-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
      <div className="w-full">
        <a
          href={MARKETING_SITE_URL}
          className="mb-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-950"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Kembali ke website
        </a>
        <Panel title="Masuk ke Valuintcorp ERP" description="Gunakan akun terdaftar atau buat akun baru untuk mulai menyiapkan bisnis pertama.">
          <div className="mb-4 grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => switchAuthMode("login")}
              className={mode === "login" ? "rounded-md bg-white px-3 py-2 text-sm font-medium shadow-sm" : "px-3 py-2 text-sm text-slate-600"}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => switchAuthMode("register")}
              className={mode === "register" ? "rounded-md bg-white px-3 py-2 text-sm font-medium shadow-sm" : "px-3 py-2 text-sm text-slate-600"}
            >
              Register
            </button>
          </div>
          <form action={submitAuth} className="space-y-3">
            <TextField name="email" label="Email" type="email" autoComplete="email" required />
            <TextField name="password" label="Password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required />
            <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-600">
              <input
                type="checkbox"
                name="rememberMe"
                className="mt-0.5 size-4 rounded border-slate-300"
                aria-label="Tetap login di perangkat ini"
              />
              <span>
                <span className="block font-medium text-slate-800">Tetap login di perangkat ini</span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  Jika tidak dicentang, sesi otomatis berakhir setelah tidak aktif.
                </span>
              </span>
            </label>
            {captchaEnabled ? (
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white p-2">
                <HCaptcha
                  ref={captchaRef}
                  sitekey={hcaptchaSiteKey!}
                  onVerify={(token) => {
                    setCaptchaToken(token);
                    setError(null);
                  }}
                  onExpire={() => setCaptchaToken(null)}
                  onChalExpired={() => setCaptchaToken(null)}
                  onError={() => {
                    setCaptchaToken(null);
                    setError("Verifikasi hCaptcha gagal. Coba ulangi.");
                  }}
                />
              </div>
            ) : null}
            <WorkspaceFeedback error={error} success={success} />
            <ActionButton className="w-full" disabled={pending}>
              {supabaseEnabled ? (mode === "login" ? "Masuk" : "Daftar") : "Masuk demo fallback"}
            </ActionButton>
          </form>
        </Panel>
      </div>
    </div>
  );
}
