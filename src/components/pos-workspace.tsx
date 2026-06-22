"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Banknote,
  ClipboardList,
  Minus,
  PackageSearch,
  Plus,
  QrCode,
  ReceiptText,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingBag,
  Store,
  Trash2,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useErpWorkspace } from "@/components/erp-context";
import { cn, MetricCard, PageHeader, Panel } from "@/components/ui";
import { money } from "@/lib/format";
import { notify } from "@/lib/notify";
import type { ErpWorkspace } from "@/lib/erp/types";

type Product = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  sellingPrice: number;
  trackStock: boolean;
  availableQuantity: number | null;
};
type Sale = { id: string; invoiceNo: string; date: string; total: number; cogs: number };
type Expense = { id: string; date: string; amount: number; category: string; memo?: string };
type Snapshot = {
  location: { id: string; code: string; name: string; warehouseId?: string };
  date: string;
  products: Product[];
  recap: {
    revenue: number;
    cogs: number;
    miscExpenses: number;
    openingStock: number;
    closingStock: number;
    sales: Sale[];
    expenses: Expense[];
  };
};
type PaymentMethod = "cash" | "qris";

const paymentOptions: Array<{
  value: PaymentMethod;
  label: string;
  helper: string;
  icon: LucideIcon;
}> = [
  {
    value: "cash",
    label: "Tunai",
    helper: "Uang diterima langsung oleh kasir.",
    icon: Banknote,
  },
  {
    value: "qris",
    label: "QRIS manual",
    helper: "Pilih setelah bukti pembayaran terlihat. Rekonsiliasi mutasi dilakukan manual.",
    icon: QrCode,
  },
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function BranchModeNotice({ cashierOnly }: { cashierOnly: boolean }) {
  return (
    <Panel className={cashierOnly ? "border-emerald-200 bg-emerald-50" : "border-cyan-200 bg-cyan-50"}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <span
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-xl",
            cashierOnly ? "bg-emerald-100 text-emerald-700" : "bg-cyan-100 text-cyan-700",
          )}
        >
          {cashierOnly ? <Store className="size-5" aria-hidden /> : <ShieldCheck className="size-5" aria-hidden />}
        </span>
        <div>
          <p className={cn("text-sm font-semibold", cashierOnly ? "text-emerald-950" : "text-cyan-950")}>
            {cashierOnly ? "Mode kasir cabang" : "Mode supervisor cabang"}
          </p>
          <p className={cn("mt-1 text-sm leading-6", cashierOnly ? "text-emerald-800" : "text-cyan-800")}>
            {cashierOnly
              ? "Tampilan difokuskan untuk input penjualan cepat. Rekap akuntansi dan biaya cabang tidak ditampilkan untuk role kasir."
              : "Anda dapat input penjualan, melihat rekap harian, dan mencatat biaya cabang sesuai akses yang diberikan owner."}
          </p>
        </div>
      </div>
    </Panel>
  );
}

function ManualPaymentNotice() {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
      <p className="font-semibold text-amber-950">Payment gateway belum diaktifkan.</p>
      <p className="mt-1">
        POS saat ini hanya mencatat Tunai dan QRIS manual. Untuk QRIS, pastikan bukti pembayaran sudah terlihat; mutasi QRIS tetap direkonsiliasi manual dari menu kas/bank.
      </p>
    </div>
  );
}

export function PosWorkspace({ initialWorkspace }: { initialWorkspace: ErpWorkspace }) {
  const { workspace, request } = useErpWorkspace(initialWorkspace);
  const canSell = workspace.permissions.includes("pos:sell");
  const canExpense = workspace.permissions.includes("pos:expenses");
  const cashierOnly = canSell && !canExpense;
  const showBackOfficeSections = canExpense || !canSell;
  const fullBranchAccess = workspace.user.role === "owner" || workspace.user.role === "system_admin";
  const assignedLocations = useMemo(() => new Set(workspace.assignedLocationIds ?? []), [workspace.assignedLocationIds]);
  const branches = useMemo(
    () =>
      workspace.locations.filter((location) => {
        const isPosLocation = ["branch", "outlet", "store"].includes(location.type) && location.warehouseId;
        if (!isPosLocation) return false;
        return fullBranchAccess || assignedLocations.size === 0 || assignedLocations.has(location.id);
      }),
    [assignedLocations, fullBranchAccess, workspace.locations],
  );
  const [locationId, setLocationId] = useState(() => branches[0]?.id ?? "");
  const [date, setDate] = useState(today);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [productQuery, setProductQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const selectedLocationId = branches.some((branch) => branch.id === locationId) ? locationId : branches[0]?.id ?? "";

  const loadSnapshot = useCallback(async () => {
    if (!selectedLocationId) return;
    setLoading(true);
    try {
      const data = await request<Snapshot>(`/api/erp/pos?locationId=${encodeURIComponent(selectedLocationId)}&date=${encodeURIComponent(date)}`);
      setSnapshot(data);
    } catch (caught) {
      notify.error("POS gagal dimuat", { description: caught instanceof Error ? caught.message : "Coba lagi." });
    } finally {
      setLoading(false);
    }
  }, [date, selectedLocationId, request]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadSnapshot();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadSnapshot]);

  const filteredProducts = useMemo(() => {
    const query = productQuery.trim().toLowerCase();
    const products = snapshot?.products ?? [];
    if (!query) return products;
    return products.filter((product) => `${product.sku} ${product.name}`.toLowerCase().includes(query));
  }, [productQuery, snapshot]);
  const cartItems = useMemo(
    () =>
      (snapshot?.products ?? []).flatMap((product) =>
        cart[product.id] ? [{ product, quantity: cart[product.id] }] : [],
      ),
    [cart, snapshot],
  );
  const cartTotal = cartItems.reduce((total, item) => total + item.product.sellingPrice * item.quantity, 0);
  const cartQuantity = cartItems.reduce((total, item) => total + item.quantity, 0);

  const changeQuantity = (product: Product, delta: number) =>
    setCart((current) => {
      const next = Math.max(0, (current[product.id] ?? 0) + delta);
      if (product.availableQuantity !== null && next > product.availableQuantity) {
        notify.warning("Stok cabang tidak mencukupi", {
          description: `${product.name}: tersedia ${product.availableQuantity} ${product.unit}.`,
        });
        return current;
      }
      const copy = { ...current };
      if (next === 0) delete copy[product.id];
      else copy[product.id] = next;
      return copy;
    });

  async function submitSale() {
    if (!selectedLocationId || cartItems.length === 0) return;
    setLoading(true);
    try {
      const result = await request<{ saleId: string }>("/api/erp/pos", {
        method: "POST",
        body: JSON.stringify({
          locationId: selectedLocationId,
          date,
          paymentMethod,
          items: cartItems.map(({ product, quantity }) => ({
            productId: product.id,
            quantity,
            unitPrice: product.sellingPrice,
          })),
        }),
      });
      notify.success("Penjualan POS diposting", {
        description:
          paymentMethod === "qris"
            ? `Transaksi ${result.saleId} dicatat sebagai QRIS manual. Rekonsiliasi mutasi dilakukan terpisah.`
            : `Transaksi ${result.saleId} dicatat sebagai tunai.`,
      });
      setCart({});
      await loadSnapshot();
    } catch (caught) {
      notify.error("Penjualan POS gagal", { description: caught instanceof Error ? caught.message : "Coba lagi." });
    } finally {
      setLoading(false);
    }
  }

  async function submitExpense(formData: FormData) {
    if (!selectedLocationId) return;
    const category = String(formData.get("category") ?? "");
    const amount = Number(formData.get("amount") ?? 0);
    if (!category || amount <= 0) return;
    setLoading(true);
    try {
      await request("/api/erp/branch-expenses", {
        method: "POST",
        body: JSON.stringify({
          locationId: selectedLocationId,
          date,
          category,
          amount,
          memo: String(formData.get("memo") ?? ""),
          paymentMethod: "cash",
        }),
      });
      notify.success("Biaya cabang dicatat", { description: category });
      (document.getElementById("branch-expense-form") as HTMLFormElement | null)?.reset();
      await loadSnapshot();
    } catch (caught) {
      notify.error("Biaya cabang gagal", { description: caught instanceof Error ? caught.message : "Coba lagi." });
    } finally {
      setLoading(false);
    }
  }

  if (branches.length === 0) {
    return (
      <div className="space-y-5">
        <PageHeader
          eyebrow="POS cabang"
          title="Kasir & rekap cabang"
          description="Owner perlu menyiapkan cabang aktif dengan gudang sebelum POS digunakan."
        />
        <Panel title="Belum ada cabang POS">
          <p className="text-sm text-slate-600">
            Tambahkan lokasi bertipe cabang, outlet, atau toko, lalu hubungkan ke gudang di Pengaturan.
          </p>
        </Panel>
      </div>
    );
  }

  const recap = snapshot?.recap;
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="POS cabang"
        title={cashierOnly ? "Kasir POS cabang" : "Kasir & rekap harian"}
        description={
          cashierOnly
            ? "Input penjualan cabang dibuat sederhana untuk kasir: pilih produk, pilih Tunai atau QRIS manual, lalu posting."
            : "Operasional cabang untuk penjualan kasir, rekap harian, dan biaya cabang tanpa integrasi payment gateway."
        }
        action={
          <button
            type="button"
            onClick={() => void loadSnapshot()}
            disabled={loading}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 disabled:opacity-60"
          >
            <RefreshCw className={cn("size-4", loading && "animate-spin")} aria-hidden />
            Muat ulang
          </button>
        }
      />

      <BranchModeNotice cashierOnly={cashierOnly} />

      <Panel>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            Cabang
            <select
              value={selectedLocationId}
              onChange={(event) => {
                setLocationId(event.target.value);
                setCart({});
              }}
              className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3"
            >
              <option value="">Pilih cabang</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Tanggal rekap
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3"
            />
          </label>
        </div>
      </Panel>

      {showBackOfficeSections ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard label="Omzet" value={money(recap?.revenue ?? 0)} meta="Penjualan POS hari ini" icon={ReceiptText} />
          <MetricCard label="COGS" value={money(recap?.cogs ?? 0)} meta="HPP dari produk terjual" icon={ShoppingBag} tone="amber" />
          <MetricCard label="Biaya lain" value={money(recap?.miscExpenses ?? 0)} meta="Pengeluaran cabang" icon={Wallet} tone="red" />
          <MetricCard label="Stok awal" value={money(recap?.openingStock ?? 0)} meta="Nilai sebelum transaksi hari ini" icon={ShoppingBag} tone="cyan" />
          <MetricCard label="Stok akhir" value={money(recap?.closingStock ?? 0)} meta="Nilai setelah transaksi hari ini" icon={ShoppingBag} tone="gray" />
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <Panel
          title="Produk cabang"
          description="Pilih produk lalu atur kuantitas pada keranjang."
          action={
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <input
                value={productQuery}
                onChange={(event) => setProductQuery(event.target.value)}
                placeholder="Cari produk"
                className="min-h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-slate-400"
              />
            </div>
          }
        >
          {filteredProducts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
              <PackageSearch className="mx-auto mb-2 size-8 text-slate-300" aria-hidden />
              Produk tidak ditemukan.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {filteredProducts.map((product) => {
                const quantity = cart[product.id] ?? 0;
                const soldOut = product.availableQuantity !== null && product.availableQuantity <= 0;
                return (
                  <article
                    key={product.id}
                    className={cn(
                      "rounded-2xl border bg-white p-3 transition-shadow",
                      quantity ? "border-emerald-300 shadow-sm shadow-emerald-100" : "border-slate-200",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs text-slate-500">{product.sku}</p>
                        <h3 className="mt-1 line-clamp-2 font-semibold text-slate-950">{product.name}</h3>
                      </div>
                      {soldOut ? (
                        <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">Habis</span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-base font-semibold text-emerald-700">{money(product.sellingPrice)}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {product.availableQuantity === null ? "Non-stok" : `Stok ${product.availableQuantity} ${product.unit}`}
                    </p>
                    <div className="mt-4 flex min-h-12 items-center justify-between gap-2 rounded-xl bg-slate-50 p-1">
                      <button
                        type="button"
                        aria-label={`Kurangi ${product.name}`}
                        onClick={() => changeQuantity(product, -1)}
                        disabled={!quantity || !canSell}
                        className="rounded-lg border border-slate-200 bg-white p-2 disabled:opacity-40"
                      >
                        <Minus className="size-4" aria-hidden />
                      </button>
                      <span className="min-w-8 text-center text-lg font-semibold">{quantity}</span>
                      <button
                        type="button"
                        aria-label={`Tambah ${product.name}`}
                        onClick={() => changeQuantity(product, 1)}
                        disabled={soldOut || !canSell}
                        className="rounded-lg bg-slate-900 p-2 text-white disabled:opacity-40"
                      >
                        <Plus className="size-4" aria-hidden />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel
          title="Keranjang POS"
          description="Pembayaran penuh dicatat manual tanpa payment gateway."
          className="xl:sticky xl:top-24 xl:self-start"
        >
          <div className="space-y-3">
            {cartItems.length === 0 ? (
              <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Belum ada produk di keranjang.</p>
            ) : (
              cartItems.map(({ product, quantity }) => (
                <div key={product.id} className="flex justify-between gap-3 rounded-xl border border-slate-100 p-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{product.name}</p>
                    <p className="text-slate-500">
                      {quantity} x {money(product.sellingPrice)}
                    </p>
                  </div>
                  <div className="text-right">
                    <strong>{money(quantity * product.sellingPrice)}</strong>
                    <button
                      type="button"
                      onClick={() => setCart((current) => {
                        const copy = { ...current };
                        delete copy[product.id];
                        return copy;
                      })}
                      className="ml-auto mt-2 flex text-xs font-medium text-red-600"
                    >
                      <Trash2 className="mr-1 size-3" aria-hidden />
                      Hapus
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-5 border-t border-slate-200 pt-4">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-sm text-slate-500">{cartQuantity} item</p>
                <p className="text-base font-semibold text-slate-950">Total</p>
              </div>
              <span className="text-2xl font-semibold text-slate-950">{money(cartTotal)}</span>
            </div>

            <div className="mt-4 grid gap-2">
              {paymentOptions.map((option) => {
                const Icon = option.icon;
                const selected = paymentMethod === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setPaymentMethod(option.value)}
                    className={cn(
                      "flex min-h-16 items-start gap-3 rounded-xl border p-3 text-left transition-colors",
                      selected ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                    )}
                  >
                    <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
                    <span>
                      <span className="block text-sm font-semibold">{option.label}</span>
                      <span className={cn("mt-1 block text-xs leading-5", selected ? "text-white/70" : "text-slate-500")}>
                        {option.helper}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              disabled={!canSell || !cartItems.length || loading}
              onClick={() => void submitSale()}
              className="mt-4 min-h-12 w-full rounded-xl bg-emerald-600 px-4 font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {canSell ? "Post penjualan" : "Akses input POS tidak tersedia"}
            </button>

            <div className="mt-4">
              <ManualPaymentNotice />
            </div>
          </div>
        </Panel>
      </div>

      {showBackOfficeSections ? (
        <div className="grid gap-5 xl:grid-cols-2">
          <Panel title="Biaya lain-lain cabang" description="Khusus supervisor cabang. Biaya dicatat sebagai beban dan mengurangi kas pusat.">
            {canExpense ? (
              <form id="branch-expense-form" action={submitExpense} className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-medium text-slate-700">
                  Kategori
                  <input
                    name="category"
                    required
                    className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3"
                    placeholder="Transport / konsumsi"
                  />
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Nominal
                  <input
                    name="amount"
                    required
                    min="1"
                    type="number"
                    className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3"
                  />
                </label>
                <label className="text-sm font-medium text-slate-700 sm:col-span-2">
                  Catatan
                  <input
                    name="memo"
                    className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3"
                    placeholder="Opsional"
                  />
                </label>
                <button disabled={loading} className="min-h-11 rounded-xl border border-slate-300 px-4 text-sm font-semibold sm:w-fit">
                  Simpan biaya
                </button>
              </form>
            ) : (
              <p className="text-sm text-slate-500">Akses mencatat biaya cabang belum diberikan.</p>
            )}
            <div className="mt-5 space-y-2">
              {(recap?.expenses ?? []).map((expense) => (
                <div key={expense.id} className="flex justify-between rounded-lg bg-slate-50 p-3 text-sm">
                  <span>
                    {expense.category}
                    {expense.memo ? ` - ${expense.memo}` : ""}
                  </span>
                  <strong>{money(expense.amount)}</strong>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Penjualan hari ini" description="Rekap cabang terpilih untuk monitoring supervisor.">
            <div className="space-y-2">
              {(recap?.sales ?? []).length === 0 ? (
                <p className="text-sm text-slate-500">Belum ada transaksi POS pada tanggal ini.</p>
              ) : (
                recap?.sales.map((sale) => (
                  <div key={sale.id} className="flex justify-between rounded-lg bg-slate-50 p-3 text-sm">
                    <div>
                      <p className="font-medium">{sale.invoiceNo}</p>
                      <p className="text-slate-500">COGS {money(sale.cogs)}</p>
                    </div>
                    <strong>{money(sale.total)}</strong>
                  </div>
                ))
              )}
            </div>
          </Panel>
        </div>
      ) : (
        <Panel className="border-slate-200 bg-white">
          <div className="flex items-start gap-3">
            <ClipboardList className="mt-1 size-5 shrink-0 text-slate-400" aria-hidden />
            <div>
              <p className="text-sm font-semibold text-slate-950">Rekap dan biaya cabang disembunyikan untuk role kasir.</p>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Owner dapat memberikan akses Biaya cabang jika pengguna ini perlu memantau rekap dan mencatat pengeluaran operasional cabang.
              </p>
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}
