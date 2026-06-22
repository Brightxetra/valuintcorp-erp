"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Minus, Plus, ReceiptText, RefreshCw, ShoppingBag, Wallet } from "lucide-react";
import { useErpWorkspace } from "@/components/erp-context";
import { MetricCard, PageHeader, Panel } from "@/components/ui";
import { money } from "@/lib/format";
import { notify } from "@/lib/notify";
import type { ErpWorkspace } from "@/lib/erp/types";

type Product = { id: string; sku: string; name: string; unit: string; sellingPrice: number; trackStock: boolean; availableQuantity: number | null };
type Sale = { id: string; invoiceNo: string; date: string; total: number; cogs: number };
type Expense = { id: string; date: string; amount: number; category: string; memo?: string };
type Snapshot = { location: { id: string; code: string; name: string; warehouseId?: string }; date: string; products: Product[]; recap: { revenue: number; cogs: number; miscExpenses: number; openingStock: number; closingStock: number; sales: Sale[]; expenses: Expense[] } };

function today() { return new Date().toISOString().slice(0, 10); }

export function PosWorkspace({ initialWorkspace }: { initialWorkspace: ErpWorkspace }) {
  const { workspace, request } = useErpWorkspace(initialWorkspace);
  const branches = workspace.locations.filter((location) => ["branch", "outlet", "store"].includes(location.type) && location.warehouseId);
  const canSell = workspace.permissions.includes("pos:sell");
  const canExpense = workspace.permissions.includes("pos:expenses");
  const canRecordExpense = canExpense;
  const [locationId, setLocationId] = useState(() => branches[0]?.id ?? "");
  const [date, setDate] = useState(today);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [loading, setLoading] = useState(false);

  const loadSnapshot = useCallback(async () => {
    if (!locationId) return;
    setLoading(true);
    try {
      const data = await request<Snapshot>(`/api/erp/pos?locationId=${encodeURIComponent(locationId)}&date=${encodeURIComponent(date)}`);
      setSnapshot(data);
    } catch (caught) {
      notify.error("POS gagal dimuat", { description: caught instanceof Error ? caught.message : "Coba lagi." });
    } finally { setLoading(false); }
  }, [date, locationId, request]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadSnapshot(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadSnapshot]);

  const cartItems = useMemo(() => (snapshot?.products ?? []).flatMap((product) => cart[product.id] ? [{ product, quantity: cart[product.id] }] : []), [cart, snapshot]);
  const cartTotal = cartItems.reduce((total, item) => total + item.product.sellingPrice * item.quantity, 0);
  const changeQuantity = (product: Product, delta: number) => setCart((current) => {
    const next = Math.max(0, (current[product.id] ?? 0) + delta);
    if (product.availableQuantity !== null && next > product.availableQuantity) {
      notify.warning("Stok cabang tidak mencukupi", { description: `${product.name}: tersedia ${product.availableQuantity} ${product.unit}.` });
      return current;
    }
    const copy = { ...current };
    if (next === 0) delete copy[product.id]; else copy[product.id] = next;
    return copy;
  });
  async function submitSale() {
    if (!locationId || cartItems.length === 0) return;
    setLoading(true);
    try {
      const result = await request<{ saleId: string }>("/api/erp/pos", { method: "POST", body: JSON.stringify({ locationId, date, paymentMethod, items: cartItems.map(({ product, quantity }) => ({ productId: product.id, quantity, unitPrice: product.sellingPrice })) }) });
      notify.success("Penjualan POS diposting", { description: `Dokumen ${result.saleId} sudah masuk ke akuntansi dan stok pusat.` });
      setCart({});
      await loadSnapshot();
    } catch (caught) {
      notify.error("Penjualan POS gagal", { description: caught instanceof Error ? caught.message : "Coba lagi." });
    } finally { setLoading(false); }
  }

  async function submitExpense(formData: FormData) {
    if (!locationId) return;
    const category = String(formData.get("category") ?? "");
    const amount = Number(formData.get("amount") ?? 0);
    if (!category || amount <= 0) return;
    setLoading(true);
    try {
      await request("/api/erp/branch-expenses", { method: "POST", body: JSON.stringify({ locationId, date, category, amount, memo: String(formData.get("memo") ?? ""), paymentMethod: "cash" }) });
      notify.success("Biaya cabang dicatat", { description: category });
      (document.getElementById("branch-expense-form") as HTMLFormElement | null)?.reset();
      await loadSnapshot();
    } catch (caught) {
      notify.error("Biaya cabang gagal", { description: caught instanceof Error ? caught.message : "Coba lagi." });
    } finally { setLoading(false); }
  }

  if (branches.length === 0) {
    return <div className="space-y-5"><PageHeader eyebrow="POS cabang" title="Kasir & rekap cabang" description="Owner perlu menyiapkan cabang aktif dengan gudang sebelum POS digunakan." /><Panel title="Belum ada cabang POS"><p className="text-sm text-slate-600">Tambahkan lokasi bertipe cabang, outlet, atau toko, lalu hubungkan ke gudang di Pengaturan.</p></Panel></div>;
  }

  const recap = snapshot?.recap;
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="POS cabang" title="Kasir & rekap harian" description="Setiap transaksi langsung menyesuaikan stok, COGS, kas, dan jurnal konsolidasi perusahaan." action={<button type="button" onClick={() => void loadSnapshot()} disabled={loading} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700"><RefreshCw className="size-4" />Muat ulang</button>} />
      <Panel>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">Cabang<select value={locationId} onChange={(event) => { setLocationId(event.target.value); setCart({}); }} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3"><option value="">Pilih cabang</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
          <label className="text-sm font-medium text-slate-700">Tanggal rekap<input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3" /></label>
        </div>
      </Panel>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Omzet" value={money(recap?.revenue ?? 0)} meta="Penjualan POS hari ini" icon={ReceiptText} />
        <MetricCard label="COGS" value={money(recap?.cogs ?? 0)} meta="HPP dari produk terjual" icon={ShoppingBag} tone="amber" />
        <MetricCard label="Biaya lain" value={money(recap?.miscExpenses ?? 0)} meta="Pengeluaran cabang" icon={Wallet} tone="red" />
        <MetricCard label="Stok awal" value={money(recap?.openingStock ?? 0)} meta="Nilai sebelum transaksi hari ini" icon={ShoppingBag} tone="cyan" />
        <MetricCard label="Stok akhir" value={money(recap?.closingStock ?? 0)} meta="Nilai setelah transaksi hari ini" icon={ShoppingBag} tone="gray" />
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Panel title="Produk cabang" description="Pilih produk lalu atur kuantitas pada keranjang.">
          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {(snapshot?.products ?? []).map((product) => {
              const quantity = cart[product.id] ?? 0;
              const soldOut = product.availableQuantity !== null && product.availableQuantity <= 0;
              return <article key={product.id} className="rounded-xl border border-slate-200 p-3"><p className="text-xs text-slate-500">{product.sku}</p><h3 className="mt-1 font-semibold text-slate-950">{product.name}</h3><p className="mt-1 text-sm font-medium text-emerald-700">{money(product.sellingPrice)}</p><p className="mt-1 text-xs text-slate-500">{product.availableQuantity === null ? "Non-stok" : `Stok ${product.availableQuantity} ${product.unit}`}</p><div className="mt-3 flex min-h-11 items-center justify-between gap-2"><button type="button" aria-label={`Kurangi ${product.name}`} onClick={() => changeQuantity(product, -1)} disabled={!quantity || !canSell} className="rounded-lg border border-slate-200 p-2 disabled:opacity-40"><Minus className="size-4" /></button><span className="font-semibold">{quantity}</span><button type="button" aria-label={`Tambah ${product.name}`} onClick={() => changeQuantity(product, 1)} disabled={soldOut || !canSell} className="rounded-lg bg-slate-900 p-2 text-white disabled:opacity-40"><Plus className="size-4" /></button></div></article>;
            })}
          </div>
        </Panel>
        <Panel title="Keranjang POS" description="Pembayaran penuh akan langsung diposting.">
          <div className="space-y-3">{cartItems.length === 0 ? <p className="text-sm text-slate-500">Belum ada produk di keranjang.</p> : cartItems.map(({ product, quantity }) => <div key={product.id} className="flex justify-between gap-3 text-sm"><div><p className="font-medium text-slate-900">{product.name}</p><p className="text-slate-500">{quantity} x {money(product.sellingPrice)}</p></div><strong>{money(quantity * product.sellingPrice)}</strong></div>)}</div>
          <div className="mt-5 border-t border-slate-200 pt-4"><div className="flex justify-between text-base font-semibold"><span>Total</span><span>{money(cartTotal)}</span></div><label className="mt-3 block text-sm font-medium text-slate-700">Metode pembayaran<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3"><option value="cash">Tunai</option><option value="qris">QRIS</option><option value="bank_transfer">Transfer bank</option><option value="other">Lainnya</option></select></label><button type="button" disabled={!canSell || !cartItems.length || loading} onClick={() => void submitSale()} className="mt-4 min-h-11 w-full rounded-xl bg-slate-900 px-4 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45">{canSell ? "Post penjualan" : "Akses input POS tidak tersedia"}</button></div>
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Biaya lain-lain cabang" description="Dicatat sebagai beban dan mengurangi kas pada buku besar pusat.">
          {canRecordExpense ? <form id="branch-expense-form" action={submitExpense} className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium text-slate-700">Kategori<input name="category" required className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3" placeholder="Transport / konsumsi" /></label><label className="text-sm font-medium text-slate-700">Nominal<input name="amount" required min="1" type="number" className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3" /></label><label className="text-sm font-medium text-slate-700 sm:col-span-2">Catatan<input name="memo" className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3" placeholder="Opsional" /></label><button disabled={loading} className="min-h-11 rounded-xl border border-slate-300 px-4 text-sm font-semibold sm:w-fit">Simpan biaya</button></form> : <p className="text-sm text-slate-500">Akses mencatat biaya cabang belum diberikan.</p>}
          <div className="mt-5 space-y-2">{(recap?.expenses ?? []).map((expense) => <div key={expense.id} className="flex justify-between rounded-lg bg-slate-50 p-3 text-sm"><span>{expense.category}{expense.memo ? ` - ${expense.memo}` : ""}</span><strong>{money(expense.amount)}</strong></div>)}</div>
        </Panel>
        <Panel title="Penjualan hari ini" description="Rekap ini hanya untuk cabang terpilih; owner melihat dampaknya pada laporan konsolidasi.">
          <div className="space-y-2">{(recap?.sales ?? []).length === 0 ? <p className="text-sm text-slate-500">Belum ada transaksi POS pada tanggal ini.</p> : recap?.sales.map((sale) => <div key={sale.id} className="flex justify-between rounded-lg bg-slate-50 p-3 text-sm"><div><p className="font-medium">{sale.invoiceNo}</p><p className="text-slate-500">COGS {money(sale.cogs)}</p></div><strong>{money(sale.total)}</strong></div>)}</div>
        </Panel>
      </div>
    </div>
  );
}
