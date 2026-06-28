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
  ShoppingBag,
  Store,
  Trash2,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useErpWorkspace } from "@/components/erp-context";
import { cn } from "@/components/ui";
import { money } from "@/lib/format";
import { notify } from "@/lib/notify";
import type { ErpWorkspace } from "@/lib/erp/types";
import { getAccessiblePosBranches } from "@/lib/pos/branches";
import { posLocationStorageKey, readStoredPosLocationId } from "@/lib/pos/preferences";
import type { PosProduct as Product, PosSnapshot as Snapshot } from "@/lib/pos/types";

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
    helper: "Kas diterima di outlet.",
    icon: Banknote,
  },
  {
    value: "qris",
    label: "QRIS",
    helper: "Catat setelah bukti pembayaran terlihat.",
    icon: QrCode,
  },
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function productInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function roundUp(value: number, step: number) {
  if (value <= 0) return 0;
  return Math.ceil(value / step) * step;
}

function quickTenderOptions(total: number) {
  if (total <= 0) return [];
  return Array.from(new Set([total, roundUp(total, 50_000), roundUp(total, 100_000)])).filter((value) => value > 0);
}

function PosMetric({
  label,
  value,
  icon: Icon,
  tone = "slate",
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: "emerald" | "amber" | "red" | "cyan" | "slate";
}) {
  const toneClass = {
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-800",
    red: "bg-red-50 text-red-700",
    cyan: "bg-cyan-50 text-cyan-700",
    slate: "bg-slate-100 text-slate-700",
  }[tone];

  return (
    <div className="flex items-center gap-3 rounded-xl bg-white px-3 py-3 ring-1 ring-slate-200">
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", toneClass)}>
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-0.5 truncate text-base font-semibold text-slate-950">{value}</p>
      </div>
    </div>
  );
}

export function PosWorkspace({ initialWorkspace }: { initialWorkspace: ErpWorkspace }) {
  const { workspace, request } = useErpWorkspace(initialWorkspace);
  const canSell = workspace.permissions.includes("pos:sell");
  const canExpense = workspace.permissions.includes("pos:expenses");
  const showBackOfficeSections = canExpense || !canSell;
  const branches = useMemo(() => getAccessiblePosBranches(workspace), [workspace]);
  const [locationId, setLocationId] = useState(() => {
    const storedId = readStoredPosLocationId();
    return branches.some((branch) => branch.id === storedId) ? storedId : branches[0]?.id ?? "";
  });
  const date = today();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [productQuery, setProductQuery] = useState("");
  const [receivedAmount, setReceivedAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const selectedLocationId = branches.some((branch) => branch.id === locationId) ? locationId : branches[0]?.id ?? "";

  useEffect(() => {
    function setPreferredLocation(nextId: string | null | undefined) {
      const resolvedId = branches.some((branch) => branch.id === nextId) ? nextId ?? "" : branches[0]?.id ?? "";
      setLocationId(resolvedId);
      setCart({});
      setReceivedAmount("");
    }

    function handleStorage(event: StorageEvent) {
      if (event.key === posLocationStorageKey) setPreferredLocation(event.newValue);
    }

    function handleCustomChange(event: Event) {
      const detail = (event as CustomEvent<{ locationId?: string }>).detail;
      setPreferredLocation(detail?.locationId);
    }

    window.addEventListener("storage", handleStorage);
    window.addEventListener("valuintcorp:pos-location-change", handleCustomChange);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("valuintcorp:pos-location-change", handleCustomChange);
    };
  }, [branches]);

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
  const receivedValue = Number(receivedAmount || 0);
  const changeDue = paymentMethod === "cash" && receivedValue > cartTotal ? receivedValue - cartTotal : 0;
  const tenderOptions = useMemo(() => quickTenderOptions(cartTotal), [cartTotal]);

  const changeQuantity = (product: Product, delta: number) => {
    const next = Math.max(0, (cart[product.id] ?? 0) + delta);
    if (product.availableQuantity !== null && next > product.availableQuantity) {
      notify.warning("Stok cabang tidak mencukupi", {
        description: `${product.name}: tersedia ${product.availableQuantity} ${product.unit}.`,
      });
      return;
    }

    setCart((current) => {
      const copy = { ...current };
      if (next === 0) delete copy[product.id];
      else copy[product.id] = next;
      return copy;
    });
  };

  const removeFromCart = (productId: string) =>
    setCart((current) => {
      const copy = { ...current };
      delete copy[productId];
      return copy;
    });

  const clearCart = () => {
    setCart({});
    setReceivedAmount("");
  };

  async function submitSale() {
    if (!selectedLocationId || cartItems.length === 0) return;
    const saleDate = today();
    setLoading(true);
    try {
      const result = await request<{ saleId: string }>("/api/erp/pos", {
        method: "POST",
        body: JSON.stringify({
          locationId: selectedLocationId,
          date: saleDate,
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
            ? `Transaksi ${result.saleId} dicatat sebagai QRIS manual.`
            : `Transaksi ${result.saleId} dicatat sebagai tunai.`,
      });
      clearCart();
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
    const expenseDate = today();
    setLoading(true);
    try {
      await request("/api/erp/branch-expenses", {
        method: "POST",
        body: JSON.stringify({
          locationId: selectedLocationId,
          date: expenseDate,
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
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
            <Store className="size-6" aria-hidden />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-950">Cabang POS belum tersedia</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Tambahkan lokasi bertipe cabang, outlet, atau toko, lalu hubungkan ke gudang di Pengaturan.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const recap = snapshot?.recap;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-xl font-semibold tracking-tight text-slate-950">Penjualan kasir</h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadSnapshot()}
              disabled={loading}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              <RefreshCw className={cn("size-4", loading && "animate-spin")} aria-hidden />
              Muat ulang
            </button>
          </div>
        </div>

        {showBackOfficeSections ? (
          <div className="grid gap-3 border-t border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-2 xl:grid-cols-5">
            <PosMetric label="Omzet" value={money(recap?.revenue ?? 0)} icon={ReceiptText} tone="emerald" />
            <PosMetric label="COGS" value={money(recap?.cogs ?? 0)} icon={ShoppingBag} tone="amber" />
            <PosMetric label="Biaya lain" value={money(recap?.miscExpenses ?? 0)} icon={Wallet} tone="red" />
            <PosMetric label="Stok awal" value={money(recap?.openingStock ?? 0)} icon={ShoppingBag} tone="cyan" />
            <PosMetric label="Stok akhir" value={money(recap?.closingStock ?? 0)} icon={ShoppingBag} />
          </div>
        ) : null}
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_410px]">
        <section className="flex min-h-[calc(100dvh-13rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-slate-950">Produk</h2>
                <p className="text-sm text-slate-500">
                  {filteredProducts.length} item tersedia
                  {loading ? " - memuat..." : ""}
                </p>
              </div>
              <div className="relative w-full md:max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
                <input
                  value={productQuery}
                  onChange={(event) => setProductQuery(event.target.value)}
                  placeholder="Cari nama atau SKU"
                  aria-label="Cari produk"
                  className="min-h-11 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-slate-500"
                />
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {filteredProducts.length === 0 ? (
              <div className="flex min-h-72 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
                <div>
                  <PackageSearch className="mx-auto mb-3 size-10 text-slate-300" aria-hidden />
                  <p className="font-semibold text-slate-950">Produk tidak ditemukan</p>
                  <p className="mt-1 max-w-sm text-sm leading-6 text-slate-500">
                    Pastikan produk, harga jual, dan stok cabang sudah tersedia untuk cabang ini.
                  </p>
                </div>
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
                        "group rounded-2xl border bg-white p-3 transition hover:border-slate-300 hover:shadow-sm",
                        quantity ? "border-slate-950 shadow-sm" : "border-slate-200",
                      )}
                    >
                      <div className="flex gap-3">
                        <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-sm font-bold text-slate-500">
                          {productInitials(product.name) || "P"}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-xs font-medium text-slate-500">{product.sku}</p>
                              <h3 className="mt-1 line-clamp-2 min-h-10 font-semibold leading-5 text-slate-950">{product.name}</h3>
                            </div>
                            {soldOut ? (
                              <span className="shrink-0 rounded-full bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">Habis</span>
                            ) : null}
                          </div>
                          <div className="mt-3 flex items-end justify-between gap-3">
                            <div>
                              <p className="text-lg font-semibold tracking-tight text-slate-950">{money(product.sellingPrice)}</p>
                              <p className="text-xs text-slate-500">
                                {product.availableQuantity === null ? "Non-stok" : `${product.availableQuantity} ${product.unit}`}
                              </p>
                            </div>
                            {quantity ? (
                              <div className="flex items-center overflow-hidden rounded-xl border border-slate-200 bg-white">
                                <button
                                  type="button"
                                  aria-label={`Kurangi ${product.name}`}
                                  onClick={() => changeQuantity(product, -1)}
                                  disabled={!canSell}
                                  className="flex size-10 items-center justify-center text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                                >
                                  <Minus className="size-4" aria-hidden />
                                </button>
                                <span className="min-w-9 text-center text-sm font-semibold text-slate-950">{quantity}</span>
                                <button
                                  type="button"
                                  aria-label={`Tambah ${product.name}`}
                                  onClick={() => changeQuantity(product, 1)}
                                  disabled={soldOut || !canSell}
                                  className="flex size-10 items-center justify-center bg-slate-950 text-white disabled:opacity-40"
                                >
                                  <Plus className="size-4" aria-hidden />
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                aria-label={`Tambah ${product.name}`}
                                onClick={() => changeQuantity(product, 1)}
                                disabled={soldOut || !canSell}
                                className="inline-flex min-h-10 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                Tambah
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <aside className="flex max-h-none flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm xl:sticky xl:top-[5.25rem] xl:max-h-[calc(100dvh-5.75rem)]">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-slate-950">Order</h2>
              <p className="text-sm text-slate-500">{cartQuantity} item</p>
            </div>
            {cartItems.length ? (
              <button type="button" onClick={clearCart} className="text-sm font-semibold text-red-600 hover:text-red-700">
                Kosongkan
              </button>
            ) : null}
          </div>

          <div className="min-h-24 flex-1 overflow-y-auto p-4">
            {cartItems.length === 0 ? (
              <div className="flex min-h-32 items-center justify-center rounded-2xl bg-slate-50 p-4 text-center">
                <div>
                  <ShoppingBag className="mx-auto mb-2 size-8 text-slate-300" aria-hidden />
                  <p className="font-semibold text-slate-950">Order masih kosong</p>
                  <p className="mt-1 text-sm text-slate-500">Pilih produk untuk mulai transaksi.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {cartItems.map(({ product, quantity }) => (
                  <div key={product.id} className="rounded-2xl border border-slate-200 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="line-clamp-2 font-semibold leading-5 text-slate-950">{product.name}</p>
                        <p className="mt-1 text-sm text-slate-500">{money(product.sellingPrice)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFromCart(product.id)}
                        className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        aria-label={`Hapus ${product.name}`}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="flex items-center overflow-hidden rounded-xl border border-slate-200">
                        <button
                          type="button"
                          aria-label={`Kurangi ${product.name}`}
                          onClick={() => changeQuantity(product, -1)}
                          className="flex size-9 items-center justify-center hover:bg-slate-50"
                        >
                          <Minus className="size-4" aria-hidden />
                        </button>
                        <span className="min-w-10 text-center text-sm font-semibold">{quantity}</span>
                        <button
                          type="button"
                          aria-label={`Tambah ${product.name}`}
                          onClick={() => changeQuantity(product, 1)}
                          className="flex size-9 items-center justify-center bg-slate-950 text-white"
                        >
                          <Plus className="size-4" aria-hidden />
                        </button>
                      </div>
                      <strong className="text-right text-slate-950">{money(quantity * product.sellingPrice)}</strong>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 bg-white p-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm text-slate-500">
                <span>Subtotal</span>
                <span>{money(cartTotal)}</span>
              </div>
              <div className="flex items-end justify-between gap-4">
                <span className="text-base font-semibold text-slate-950">Total</span>
                <span className="text-3xl font-bold tracking-tight text-slate-950">{money(cartTotal)}</span>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              {paymentOptions.map((option) => {
                const Icon = option.icon;
                const selected = paymentMethod === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setPaymentMethod(option.value)}
                    className={cn(
                      "min-h-14 rounded-xl border p-3 text-left transition",
                      selected ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                    )}
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <Icon className="size-4" aria-hidden />
                      {option.label}
                    </span>
                    <span className={cn("mt-0.5 block text-xs leading-4", selected ? "text-white/70" : "text-slate-500")}>{option.helper}</span>
                  </button>
                );
              })}
            </div>

            {paymentMethod === "cash" ? (
              <div className="mt-3 rounded-2xl bg-slate-50 p-3">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Uang diterima
                  <input
                    value={receivedAmount}
                    onChange={(event) => setReceivedAmount(event.target.value)}
                    type="number"
                    min="0"
                    inputMode="numeric"
                    placeholder="0"
                    className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-right text-lg font-semibold outline-none focus:border-slate-500"
                  />
                </label>
                {tenderOptions.length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {tenderOptions.map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setReceivedAmount(String(value))}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        {money(value)}
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-slate-500">Kembalian</span>
                  <strong className="text-slate-950">{money(changeDue)}</strong>
                </div>
              </div>
            ) : null}

            <button
              type="button"
              disabled={!canSell || !cartItems.length || loading}
              onClick={() => void submitSale()}
              className="mt-4 min-h-12 w-full rounded-xl bg-emerald-600 px-4 text-base font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {loading ? "Memproses..." : canSell ? "Bayar & posting" : "Akses input POS tidak tersedia"}
            </button>
          </div>
        </aside>
      </div>

      {showBackOfficeSections ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-slate-950">Biaya cabang</h2>
                <p className="text-sm text-slate-500">Pengeluaran operasional hari ini.</p>
              </div>
              <ClipboardList className="size-5 text-slate-400" aria-hidden />
            </div>
            {canExpense ? (
              <form id="branch-expense-form" action={submitExpense} className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-medium text-slate-700">
                  Kategori
                  <input
                    name="category"
                    required
                    className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 outline-none focus:border-slate-500"
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
                    className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 outline-none focus:border-slate-500"
                  />
                </label>
                <label className="text-sm font-medium text-slate-700 sm:col-span-2">
                  Catatan
                  <input
                    name="memo"
                    className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 outline-none focus:border-slate-500"
                    placeholder="Opsional"
                  />
                </label>
                <button disabled={loading} className="min-h-11 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white disabled:opacity-50 sm:w-fit">
                  Simpan biaya
                </button>
              </form>
            ) : (
              <p className="text-sm text-slate-500">Akses mencatat biaya cabang belum diberikan.</p>
            )}
            <div className="mt-5 space-y-2">
              {(recap?.expenses ?? []).map((expense) => (
                <div key={expense.id} className="flex justify-between gap-4 rounded-xl bg-slate-50 p-3 text-sm">
                  <span className="min-w-0">
                    <span className="font-medium text-slate-950">{expense.category}</span>
                    {expense.memo ? <span className="block truncate text-slate-500">{expense.memo}</span> : null}
                  </span>
                  <strong>{money(expense.amount)}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-slate-950">Penjualan hari ini</h2>
                <p className="text-sm text-slate-500">Transaksi POS cabang terpilih.</p>
              </div>
              <ReceiptText className="size-5 text-slate-400" aria-hidden />
            </div>
            <div className="space-y-2">
              {(recap?.sales ?? []).length === 0 ? (
                <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Belum ada transaksi POS pada tanggal ini.</p>
              ) : (
                recap?.sales.map((sale) => (
                  <div key={sale.id} className="flex justify-between gap-4 rounded-xl bg-slate-50 p-3 text-sm">
                    <div>
                      <p className="font-medium text-slate-950">{sale.invoiceNo}</p>
                      <p className="text-slate-500">COGS {money(sale.cogs)}</p>
                    </div>
                    <strong>{money(sale.total)}</strong>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
