"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Check, FileText, X, AlertCircle } from "lucide-react";
import { useErpWorkspace } from "@/components/erp-context";
import { ActionButton, PageHeader, Panel, StatTile, StatusPill } from "@/components/ui";
import { money } from "@/lib/format";
import type { ErpWorkspace, PaymentMethod } from "@/lib/erp/types";

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

function statusTone(status: string): "emerald" | "amber" | "gray" | "red" | "cyan" {
  if (status === "paid") return "emerald";
  if (status === "partially_paid") return "cyan";
  if (status === "void") return "red";
  return "amber";
}

function statusLabel(status: string) {
  return {
    paid: "Lunas",
    partially_paid: "Dibayar Sebagian",
    posted: "Belum Bayar",
    draft: "Draft",
    void: "Batal",
  }[status] ?? status;
}

function Modal({
  isOpen,
  title,
  onClose,
  children,
}: {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-950">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
            <X className="size-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function DocumentDetailWorkspace({
  initialWorkspace,
  documentType,
  documentId,
}: {
  initialWorkspace: ErpWorkspace;
  documentType: "sales_invoice" | "purchase_bill";
  documentId: string;
}) {
  const { workspace, setWorkspace, request } = useErpWorkspace(initialWorkspace);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    amount: 0,
    method: documentType === "sales_invoice" ? "cash" : "bank_transfer",
    date: new Date().toISOString().slice(0, 10),
  });
  const [voidReason, setVoidReason] = useState("");

  const salesDocument = documentType === "sales_invoice"
    ? workspace.salesInvoices.find((invoice) => invoice.id === documentId)
    : undefined;
  const purchaseDocument = documentType === "purchase_bill"
    ? workspace.purchaseBills.find((bill) => bill.id === documentId)
    : undefined;
  const document = salesDocument ?? purchaseDocument;
  const counterparty = salesDocument
    ? workspace.customers.find((customer) => customer.id === salesDocument.customerId)
    : purchaseDocument
      ? workspace.suppliers.find((supplier) => supplier.id === purchaseDocument.supplierId)
      : undefined;
  const lines = document?.lines ?? [];
  const outstanding = document ? Math.max(document.total - document.paidAmount, 0) : 0;
  const payments = workspace.payments.filter(
    (payment) => payment.documentType === documentType && payment.documentId === documentId,
  );
  const allocations = workspace.paymentAllocations.filter(
    (allocation) => allocation.documentType === documentType && allocation.documentId === documentId,
  );
  const journal = document?.journalEntryId
    ? workspace.journals.find((entry) => entry.id === document.journalEntryId)
    : undefined;
  const attachments = workspace.attachments.filter(
    (attachment) => attachment.ownerType === documentType && attachment.ownerId === documentId,
  );
  const title = documentType === "sales_invoice" ? "Detail Invoice" : "Detail Tagihan Supplier";
  const backHref = documentType === "sales_invoice" ? "/transaksi/invoice" : "/transaksi/tagihan";
  const docNo = document && ("invoiceNo" in document ? document.invoiceNo : document.billNo);

  const lineRows = lines.map((line) => {
    const product = workspace.products.find((item) => item.id === line.productId);
    const warehouse = line.warehouseId ? workspace.warehouses.find((item) => item.id === line.warehouseId) : undefined;
    const unitAmount = "unitPrice" in line ? line.unitPrice : line.unitCost;

    return {
      id: line.id,
      productName: product?.name ?? line.description,
      sku: product?.sku ?? "-",
      warehouseName: warehouse?.name ?? "-",
      quantity: line.quantity,
      unitAmount,
      total: line.quantity * unitAmount,
    };
  });

  async function postPayment() {
    if (!document) return;
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const data = await request<{ workspace: ErpWorkspace }>("/api/erp/payments", {
        method: "POST",
        body: JSON.stringify({
          direction: documentType === "sales_invoice" ? "inbound" : "outbound",
          documentType,
          documentId,
          amount: paymentForm.amount,
          method: paymentForm.method as PaymentMethod,
          date: paymentForm.date,
        }),
      });
      setWorkspace(data.workspace);
      setPaymentOpen(false);
      setMessage("Pembayaran berhasil dicatat.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Pembayaran gagal diproses.");
    } finally {
      setLoading(false);
    }
  }

  async function voidDocument() {
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const data = await request<{ workspace: ErpWorkspace }>("/api/erp/documents/void", {
        method: "POST",
        body: JSON.stringify({
          documentType,
          documentId,
          reason: voidReason,
          date: new Date().toISOString().slice(0, 10),
        }),
      });
      setWorkspace(data.workspace);
      setVoidOpen(false);
      setMessage("Dokumen berhasil dibatalkan dengan reversal.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Void dokumen gagal diproses.");
    } finally {
      setLoading(false);
    }
  }

  if (!document) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={title}
          description="Dokumen tidak ditemukan di workspace aktif."
          action={
            <Link href={backHref} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <ArrowLeft className="size-4" />
              Kembali
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={documentType === "sales_invoice" ? "Penjualan" : "Pembelian"}
        title={`${title} ${docNo}`}
        description={`${counterparty?.name ?? "-"} - ${formatDate(document.date)} s/d jatuh tempo ${formatDate(document.dueDate)}`}
        action={
          <>
            <Link href={backHref} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <ArrowLeft className="size-4" />
              Kembali
            </Link>
            {document.status !== "paid" && document.status !== "void" ? (
              <ActionButton
                onClick={() => {
                  setPaymentForm((current) => ({ ...current, amount: outstanding }));
                  setPaymentOpen(true);
                }}
              >
                <Check className="size-4" />
                Bayar
              </ActionButton>
            ) : null}
            {document.status !== "void" ? (
              <ActionButton variant="danger" onClick={() => setVoidOpen(true)}>
                Batalkan
              </ActionButton>
            ) : null}
          </>
        }
      />

      {message ? (
        <div className="flex items-center gap-3 rounded-lg bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
          <Check className="size-5" />
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="flex items-center gap-3 rounded-lg bg-red-50 p-4 text-sm font-medium text-red-800">
          <AlertCircle className="size-5" />
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <StatTile label="Status" value={statusLabel(document.status)} />
        <StatTile label="Total" value={money(document.total)} />
        <StatTile label="Terbayar" value={money(document.paidAmount)} />
        <StatTile label="Sisa" value={money(outstanding)} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Panel title="Item Dokumen" description="Detail produk/jasa yang menjadi dasar posting dokumen.">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="py-3">Item</th>
                  <th className="py-3">Gudang</th>
                  <th className="py-3 text-right">Qty</th>
                  <th className="py-3 text-right">Harga</th>
                  <th className="py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lineRows.map((line) => (
                  <tr key={line.id}>
                    <td className="py-3">
                      <p className="font-medium text-slate-950">{line.productName}</p>
                      <p className="text-xs text-slate-500">{line.sku}</p>
                    </td>
                    <td className="py-3 text-slate-600">{line.warehouseName}</td>
                    <td className="py-3 text-right text-slate-600">{line.quantity}</td>
                    <td className="py-3 text-right text-slate-600">{money(line.unitAmount)}</td>
                    <td className="py-3 text-right font-semibold text-slate-950">{money(line.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Ringkasan Dokumen">
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Nomor</span>
              <span className="font-medium text-slate-950">{docNo}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">{documentType === "sales_invoice" ? "Customer" : "Supplier"}</span>
              <span className="font-medium text-slate-950">{counterparty?.name ?? "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Status</span>
              <StatusPill tone={statusTone(document.status)}>{statusLabel(document.status)}</StatusPill>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Journal ID</span>
              <span className="max-w-44 truncate font-mono text-xs text-slate-700">{document.journalEntryId ?? "-"}</span>
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Pembayaran" description="Payment allocation yang terkait dengan dokumen ini.">
          {payments.length === 0 ? (
            <p className="text-sm text-slate-500">Belum ada pembayaran.</p>
          ) : (
            <div className="space-y-3">
              {payments.map((payment) => (
                <div key={payment.id} className="flex items-center justify-between rounded-lg bg-slate-50 p-3 text-sm">
                  <div>
                    <p className="font-medium text-slate-950">{payment.reference}</p>
                    <p className="text-slate-500">{formatDate(payment.date)} - {payment.method}</p>
                  </div>
                  <p className="font-semibold text-slate-950">{money(payment.amount)}</p>
                </div>
              ))}
            </div>
          )}
          {allocations.length > 0 ? (
            <p className="mt-3 text-xs text-slate-500">{allocations.length} allocation record tersimpan.</p>
          ) : null}
        </Panel>

        <Panel title="Jurnal & Lampiran" description="Audit trail dokumen ke jurnal dan file pendukung.">
          <div className="space-y-4">
            {journal ? (
              <div>
                <p className="mb-2 text-sm font-medium text-slate-950">{journal.description}</p>
                <div className="space-y-2">
                  {journal.lines.map((line) => (
                    <div key={line.id} className="flex items-center justify-between rounded-lg bg-slate-50 p-2 text-xs">
                      <span>{line.accountCode} - {line.accountName}</span>
                      <span>{line.debit > 0 ? `Dr ${money(line.debit)}` : `Cr ${money(line.credit)}`}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Jurnal belum tersedia.</p>
            )}
            <div>
              <p className="mb-2 text-sm font-medium text-slate-950">Lampiran</p>
              {attachments.length === 0 ? (
                <p className="text-sm text-slate-500">Belum ada lampiran.</p>
              ) : (
                attachments.map((attachment) => (
                  <div key={attachment.id} className="flex items-center gap-2 rounded-lg bg-slate-50 p-2 text-sm">
                    <FileText className="size-4 text-slate-500" />
                    <span>{attachment.fileName}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </Panel>
      </div>

      <Modal isOpen={paymentOpen} onClose={() => setPaymentOpen(false)} title="Catat Pembayaran">
        <div className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Jumlah</span>
            <input
              type="number"
              value={paymentForm.amount}
              onChange={(event) => setPaymentForm((current) => ({ ...current, amount: Number(event.target.value) }))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Metode</span>
            <select
              value={paymentForm.method}
              onChange={(event) => setPaymentForm((current) => ({ ...current, method: event.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="cash">Tunai</option>
              <option value="bank_transfer">Transfer Bank</option>
              <option value="qris">QRIS</option>
              <option value="marketplace">Marketplace</option>
              <option value="other">Lainnya</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Tanggal</span>
            <input
              type="date"
              value={paymentForm.date}
              onChange={(event) => setPaymentForm((current) => ({ ...current, date: event.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <ActionButton onClick={postPayment} disabled={loading || paymentForm.amount <= 0}>
            Simpan Pembayaran
          </ActionButton>
        </div>
      </Modal>

      <Modal isOpen={voidOpen} onClose={() => setVoidOpen(false)} title="Batalkan Dokumen">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Void akan membuat reversal journal sesuai workflow akuntansi.</p>
          <textarea
            value={voidReason}
            onChange={(event) => setVoidReason(event.target.value)}
            rows={3}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="Alasan pembatalan"
          />
          <ActionButton variant="danger" onClick={voidDocument} disabled={loading || voidReason.length < 3}>
            Batalkan Dokumen
          </ActionButton>
        </div>
      </Modal>
    </div>
  );
}
