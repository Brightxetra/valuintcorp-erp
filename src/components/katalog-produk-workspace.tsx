"use client";

import { useState } from "react";
import {
  Boxes,
  ChevronDown,
  ClipboardList,
  Factory,
  Layers3,
  PackagePlus,
  Plus,
  RefreshCcw,
  Search,
  SlidersHorizontal,
  Utensils,
} from "lucide-react";
import { useErpWorkspace } from "@/components/erp-context";
import { MobileDialog } from "@/components/mobile-dialog";
import { PageHeader, cn } from "@/components/ui";
import type { ErpWorkspace, Product } from "@/lib/erp/types";
import { calculateProductUnitCost, productIndustryDefaults } from "@/lib/erp/industry-workflows";
import { notify } from "@/lib/notify";

type ProductTypeFilter = "all" | "sellable" | "purchasable" | "stock";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount);
}

function formatQty(value: number) {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(value);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function nextMonthEnd() {
  const value = new Date();
  value.setMonth(value.getMonth() + 1);
  value.setDate(0);
  return value.toISOString().slice(0, 10);
}

function industryCopy(industry: string) {
  if (industry === "food_beverage") {
    return {
      description: "Kelola menu, bahan baku, harga, dan struktur biaya tanpa memenuhi layar utama.",
      structureLabel: "Resep",
      primaryIcon: Utensils,
    };
  }

  if (industry === "manufacturing") {
    return {
      description: "Kelola produk, bahan, harga, dan struktur produksi dalam tampilan yang lebih ringkas.",
      structureLabel: "BOM",
      primaryIcon: Factory,
    };
  }

  if (industry === "service") {
    return {
      description: "Kelola paket jasa, harga, dan komponen biaya dari satu daftar yang mudah dicari.",
      structureLabel: "Komponen biaya",
      primaryIcon: ClipboardList,
    };
  }

  return {
    description: "Kelola produk, harga, dan bahan pendukung dalam tampilan yang mudah dipakai.",
    structureLabel: "Struktur",
    primaryIcon: Boxes,
  };
}

function readableItemType(value: Product["industryItemType"]) {
  const labels: Record<Product["industryItemType"], string> = {
    raw_material: "Bahan",
    semi_finished: "Setengah jadi",
    finished_good: "Produk jadi",
    menu_item: "Menu",
    retail_sku: "SKU retail",
    service_item: "Jasa",
    package: "Paket",
    other: "Lainnya",
  };

  return labels[value] ?? "Produk";
}

function itemPreset(industryItemType: Product["industryItemType"], industry: string) {
  if (industryItemType === "raw_material") {
    return { productType: "stock_item", fulfillmentMethod: "buy_stock", makeOrBuy: "buy", isSellable: false, isPurchasable: true, trackStock: true };
  }
  if (industryItemType === "menu_item") {
    return { productType: "stock_item", fulfillmentMethod: "recipe_on_sale", makeOrBuy: "make", isSellable: true, isPurchasable: false, trackStock: true };
  }
  if (industryItemType === "finished_good" || industryItemType === "semi_finished") {
    return { productType: "stock_item", fulfillmentMethod: "make_to_stock", makeOrBuy: "make", isSellable: industryItemType === "finished_good", isPurchasable: false, trackStock: true };
  }
  if (industryItemType === "service_item") {
    return { productType: "service", fulfillmentMethod: "non_stock", makeOrBuy: "buy", isSellable: true, isPurchasable: false, trackStock: false };
  }
  if (industryItemType === "package") {
    return { productType: "bundle", fulfillmentMethod: industry === "food_beverage" ? "recipe_on_sale" : "non_stock", makeOrBuy: "make", isSellable: true, isPurchasable: false, trackStock: industry === "food_beverage" };
  }
  return { productType: "stock_item", fulfillmentMethod: "buy_stock", makeOrBuy: "buy", isSellable: true, isPurchasable: true, trackStock: true };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-slate-700">
      <span>{label}</span>
      {children}
    </label>
  );
}

function inputClass() {
  return "min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-100";
}

function ProductStatus({ product }: { product: Product }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {product.isSellable ? <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">Dijual</span> : null}
      {product.isPurchasable ? <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">Dibeli</span> : null}
      {product.trackStock ? <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">Stok</span> : null}
    </div>
  );
}

export function KatalogProdukWorkspace({ initialWorkspace }: { initialWorkspace: ErpWorkspace }) {
  const { workspace, setWorkspace, request } = useErpWorkspace(initialWorkspace);
  const [pending, setPending] = useState<string | null>(null);
  const [showProductDialog, setShowProductDialog] = useState(false);
  const [showStockSettings, setShowStockSettings] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState<ProductTypeFilter>("all");
  const [defaultSku, setDefaultSku] = useState(() => `SKU-${Date.now().toString().slice(-5)}`);
  const [defaultPeriodStart] = useState(() => today());
  const [defaultPeriodEnd] = useState(() => nextMonthEnd());
  const [defaultMrpName] = useState(() => `MRP ${new Date().toISOString().slice(0, 7)}`);
  const [itemType, setItemType] = useState<Product["industryItemType"]>(
    productIndustryDefaults(workspace.business.industry).industryItemType,
  );

  const copy = industryCopy(workspace.business.industry);
  const PrimaryIcon = copy.primaryIcon;
  const activeProducts = workspace.products.filter((product) => product.isActive !== false);
  const sellableProducts = activeProducts.filter((product) => product.isSellable);
  const componentProducts = activeProducts.filter((product) => product.isPurchasable || product.trackStock);
  const defaultWarehouseId = workspace.warehouses[0]?.id ?? "";
  const currentPreset = itemPreset(itemType, workspace.business.industry);

  const categories = Array.from(new Set(activeProducts.map((product) => product.category).filter(Boolean))).sort();
  const query = searchQuery.trim().toLowerCase();
  const productRows = activeProducts
    .filter((product) => {
      const matchesSearch =
        !query ||
        product.name.toLowerCase().includes(query) ||
        product.sku.toLowerCase().includes(query);
      const matchesCategory = categoryFilter === "all" || product.category === categoryFilter;
      const matchesType =
        typeFilter === "all" ||
        (typeFilter === "sellable" && product.isSellable) ||
        (typeFilter === "purchasable" && product.isPurchasable) ||
        (typeFilter === "stock" && product.trackStock);

      return matchesSearch && matchesCategory && matchesType;
    })
    .map((product) => ({
      product,
      unitCost: calculateProductUnitCost(product, workspace.products, workspace.productStructures),
      structure: workspace.productStructures.find((structure) => structure.parentProductId === product.id && structure.isActive),
    }))
    .sort((a, b) => a.product.sku.localeCompare(b.product.sku));

  const hasActiveFilters = searchQuery.trim() || categoryFilter !== "all" || typeFilter !== "all";

  async function saveProduct(formData: FormData) {
    const selectedType = String(formData.get("industryItemType")) as Product["industryItemType"];
    const preset = itemPreset(selectedType, workspace.business.industry);
    setPending("product");

    try {
      const body = await request<{ workspace: ErpWorkspace }>("/api/erp/master-data", {
        method: "POST",
        body: JSON.stringify({
          resource: "product",
          values: {
            sku: String(formData.get("sku")),
            name: String(formData.get("name")),
            industryItemType: selectedType,
            productType: preset.productType,
            fulfillmentMethod: preset.fulfillmentMethod,
            makeOrBuy: preset.makeOrBuy,
            category: String(formData.get("category") || "Umum"),
            unit: String(formData.get("unit") || "unit"),
            trackStock: preset.trackStock,
            defaultWarehouseId: String(formData.get("defaultWarehouseId") ?? ""),
            sellingPrice: Number(formData.get("sellingPrice") ?? 0),
            purchasePrice: Number(formData.get("purchasePrice") ?? 0),
            reorderPoint: Number(formData.get("reorderPoint") ?? 0),
            safetyStock: Number(formData.get("safetyStock") ?? 0),
            minimumOrderQty: Number(formData.get("minimumOrderQty") ?? 0),
            leadTimeDays: Number(formData.get("leadTimeDays") ?? 0),
            productionLeadTimeDays: Number(formData.get("productionLeadTimeDays") ?? 0),
            isSellable: preset.isSellable,
            isPurchasable: preset.isPurchasable,
            isActive: true,
          },
        }),
      });

      setWorkspace(body.workspace);
      setShowProductDialog(false);
      setShowStockSettings(false);
      setDefaultSku(`SKU-${Date.now().toString().slice(-5)}`);
      notify.success("Produk disimpan", { description: String(formData.get("name")) });
    } catch (error) {
      notify.error("Produk gagal disimpan", { description: error instanceof Error ? error.message : "Coba lagi." });
    } finally {
      setPending(null);
    }
  }

  async function saveStructure(formData: FormData) {
    const parentProductId = String(formData.get("parentProductId"));
    const lines = [0, 1, 2, 3, 4]
      .map((index) => ({
        componentProductId: String(formData.get(`component-${index}`) ?? ""),
        quantity: Number(formData.get(`quantity-${index}`) ?? 0),
        wastePercent: Number(formData.get(`waste-${index}`) ?? 0),
      }))
      .filter((line) => line.componentProductId && line.quantity > 0);

    if (lines.length === 0) {
      notify.warning("Komponen belum diisi", { description: `Minimal satu baris ${copy.structureLabel.toLowerCase()} diperlukan.` });
      return;
    }

    setPending("structure");
    try {
      const body = await request<{ workspace: ErpWorkspace }>("/api/erp/product-structures", {
        method: "POST",
        body: JSON.stringify({
          parentProductId,
          type: String(formData.get("structureType")),
          outputQuantity: Number(formData.get("outputQuantity") ?? 1),
          yieldPercent: Number(formData.get("yieldPercent") ?? 100),
          isActive: true,
          notes: String(formData.get("notes") ?? ""),
          lines,
        }),
      });
      setWorkspace(body.workspace);
      notify.success(`${copy.structureLabel} disimpan`, {
        description: activeProducts.find((product) => product.id === parentProductId)?.name,
      });
    } catch (error) {
      notify.error(`${copy.structureLabel} gagal disimpan`, { description: error instanceof Error ? error.message : "Coba lagi." });
    } finally {
      setPending(null);
    }
  }

  async function runMrp(formData: FormData) {
    const productId = String(formData.get("forecastProductId") ?? "");
    const quantity = Number(formData.get("forecastQuantity") ?? 0);
    setPending("mrp");
    try {
      const body = await request<{ workspace: ErpWorkspace }>("/api/erp/mrp/run", {
        method: "POST",
        body: JSON.stringify({
          name: String(formData.get("name") || "MRP"),
          periodStart: String(formData.get("periodStart")),
          periodEnd: String(formData.get("periodEnd")),
          forecasts: productId && quantity > 0
            ? [{
                productId,
                periodStart: String(formData.get("periodStart")),
                periodEnd: String(formData.get("periodEnd")),
                quantity,
                source: "manual",
              }]
            : [],
        }),
      });
      setWorkspace(body.workspace);
      notify.success("MRP selesai", { description: "Rekomendasi beli/produksi diperbarui." });
    } catch (error) {
      notify.error("MRP gagal dijalankan", { description: error instanceof Error ? error.message : "Coba lagi." });
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Katalog Produk"
        description={copy.description}
        action={
          <button
            type="button"
            onClick={() => setShowProductDialog(true)}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
          >
            <Plus className="size-4" aria-hidden />
            Tambah Produk
          </button>
        }
      />

      <section className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Produk aktif", value: activeProducts.length, icon: Boxes },
          { label: "Dijual", value: sellableProducts.length, icon: PackagePlus },
          { label: "Bahan/komponen", value: componentProducts.length, icon: Layers3 },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-slate-500">{item.label}</p>
                <Icon className="size-5 text-slate-400" aria-hidden />
              </div>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{item.value}</p>
            </div>
          );
        })}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-950">Daftar produk</h2>
              <p className="mt-1 text-sm text-slate-500">Cari produk, cek harga, dan lihat status stok dari satu tempat.</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_160px_150px] lg:w-[660px]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Cari produk atau SKU..."
                  className="min-h-11 w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                />
              </div>
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                className={inputClass()}
                aria-label="Filter kategori"
              >
                <option value="all">Semua kategori</option>
                {categories.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
              <select
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value as ProductTypeFilter)}
                className={inputClass()}
                aria-label="Filter tipe"
              >
                <option value="all">Semua tipe</option>
                <option value="sellable">Dijual</option>
                <option value="purchasable">Dibeli</option>
                <option value="stock">Stok</option>
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-hidden">
          {productRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-14 text-center">
              <div className="rounded-xl bg-slate-100 p-3">
                <Boxes className="size-7 text-slate-400" aria-hidden />
              </div>
              <p className="mt-4 text-sm font-semibold text-slate-950">
                {hasActiveFilters ? "Produk tidak ditemukan" : "Belum ada produk"}
              </p>
              <p className="mt-1 max-w-sm text-sm text-slate-500">
                {hasActiveFilters ? "Coba ubah kata kunci atau filter." : "Tambahkan produk pertama agar bisa dipakai di transaksi."}
              </p>
              {!hasActiveFilters ? (
                <button
                  type="button"
                  onClick={() => setShowProductDialog(true)}
                  className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
                >
                  <Plus className="size-4" aria-hidden />
                  Tambah Produk
                </button>
              ) : null}
            </div>
          ) : (
            <table className="mobile-card-table w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Produk</th>
                  <th className="px-4 py-3">Tipe</th>
                  <th className="px-4 py-3 text-right">Harga Jual</th>
                  <th className="px-4 py-3 text-right">Biaya/HPP</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Struktur</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {productRows.map(({ product, unitCost, structure }) => (
                  <tr key={product.id} className="transition hover:bg-slate-50">
                    <td data-mobile-label="Produk" className="px-4 py-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-950">{product.name}</p>
                        <p className="mt-0.5 font-mono text-xs text-slate-500">{product.sku} - {product.unit}</p>
                      </div>
                    </td>
                    <td data-mobile-label="Tipe" className="px-4 py-3 text-slate-700">
                      {readableItemType(product.industryItemType)}
                    </td>
                    <td data-mobile-label="Harga jual" className="px-4 py-3 text-right font-semibold text-slate-950">
                      {formatCurrency(product.sellingPrice)}
                    </td>
                    <td data-mobile-label="Biaya/HPP" className="px-4 py-3 text-right text-slate-700">
                      {formatCurrency(unitCost)}
                    </td>
                    <td data-mobile-label="Status" className="px-4 py-3">
                      <ProductStatus product={product} />
                    </td>
                    <td data-mobile-label="Struktur" className="px-4 py-3 text-right">
                      {structure ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                          {structure.type === "recipe" ? "Resep" : structure.type.toUpperCase()}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setShowAdvanced((value) => !value)}
          className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left sm:px-5"
          aria-expanded={showAdvanced}
        >
          <div>
            <h2 className="text-base font-semibold text-slate-950">Lanjutan</h2>
            <p className="mt-1 text-sm text-slate-500">Resep, BOM, dan perencanaan kebutuhan disimpan di sini.</p>
          </div>
          <ChevronDown className={cn("size-5 shrink-0 text-slate-500 transition", showAdvanced && "rotate-180")} aria-hidden />
        </button>

        {showAdvanced ? (
          <div className="grid gap-4 border-t border-slate-100 p-4 sm:p-5 xl:grid-cols-[1fr_0.9fr]">
            <form action={(formData) => void saveStructure(formData)} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
              <div className="mb-4 flex items-start gap-3">
                <div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700"><Layers3 className="size-5" aria-hidden /></div>
                <div>
                  <h3 className="font-semibold text-slate-950">Susun {copy.structureLabel}</h3>
                  <p className="mt-1 text-sm text-slate-500">Hubungkan produk utama dengan bahan atau komponen biaya.</p>
                </div>
              </div>
              <div className="grid gap-3">
                <Field label="Produk utama">
                  <select name="parentProductId" className={inputClass()} required>
                    {sellableProducts.map((product) => <option key={product.id} value={product.id}>{product.sku} - {product.name}</option>)}
                  </select>
                </Field>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Tipe">
                    <select name="structureType" className={inputClass()} defaultValue={workspace.business.industry === "manufacturing" ? "bom" : "recipe"}>
                      <option value="recipe">Resep</option>
                      <option value="bom">BOM</option>
                      <option value="bundle">Bundle</option>
                    </select>
                  </Field>
                  <Field label="Output qty"><input name="outputQuantity" type="number" step="0.01" className={inputClass()} defaultValue={1} /></Field>
                  <Field label="Yield %"><input name="yieldPercent" type="number" step="0.01" className={inputClass()} defaultValue={100} /></Field>
                </div>
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <div className="grid grid-cols-[minmax(0,1fr)_80px_80px] gap-2 border-b border-slate-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <span>Komponen</span><span>Qty</span><span>Waste %</span>
                  </div>
                  {[0, 1, 2, 3, 4].map((index) => (
                    <div key={index} className="grid grid-cols-[minmax(0,1fr)_80px_80px] gap-2 border-b border-slate-100 p-2 last:border-b-0">
                      <select name={`component-${index}`} className={inputClass()}>
                        <option value="">Pilih</option>
                        {componentProducts.map((product) => <option key={product.id} value={product.id}>{product.sku} - {product.name}</option>)}
                      </select>
                      <input name={`quantity-${index}`} type="number" step="0.001" className={inputClass()} placeholder="0" />
                      <input name={`waste-${index}`} type="number" step="0.01" className={inputClass()} defaultValue={0} />
                    </div>
                  ))}
                </div>
                <Field label="Catatan"><input name="notes" className={inputClass()} placeholder="Opsional" /></Field>
                <button disabled={pending === "structure"} className="min-h-11 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                  Simpan {copy.structureLabel}
                </button>
              </div>
            </form>

            <div className="grid gap-4">
              <form action={(formData) => void runMrp(formData)} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                <div className="mb-4 flex items-start gap-3">
                  <div className="rounded-xl bg-blue-50 p-2.5 text-blue-700"><RefreshCcw className="size-5" aria-hidden /></div>
                  <div>
                    <h3 className="font-semibold text-slate-950">Rencana kebutuhan</h3>
                    <p className="mt-1 text-sm text-slate-500">Hitung kebutuhan beli atau produksi berdasarkan rencana permintaan.</p>
                  </div>
                </div>
                <div className="grid gap-3">
                  <Field label="Nama rencana"><input name="name" className={inputClass()} defaultValue={defaultMrpName} /></Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Mulai"><input name="periodStart" type="date" className={inputClass()} defaultValue={defaultPeriodStart} required /></Field>
                    <Field label="Selesai"><input name="periodEnd" type="date" className={inputClass()} defaultValue={defaultPeriodEnd} required /></Field>
                  </div>
                  <Field label="Produk">
                    <select name="forecastProductId" className={inputClass()}>
                      <option value="">Pakai rencana yang sudah ada</option>
                      {sellableProducts.map((product) => <option key={product.id} value={product.id}>{product.sku} - {product.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Jumlah rencana"><input name="forecastQuantity" type="number" step="0.01" className={inputClass()} placeholder="Opsional" /></Field>
                  <button disabled={pending === "mrp"} className="min-h-11 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                    Hitung kebutuhan
                  </button>
                </div>
              </form>

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="font-semibold text-slate-950">Rekomendasi terakhir</h3>
                <div className="mt-3 space-y-2">
                  {workspace.mrpRecommendations.slice(0, 4).map((recommendation) => {
                    const product = workspace.products.find((item) => item.id === recommendation.productId);
                    return (
                      <div key={recommendation.id} className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-medium text-slate-950">{product?.name ?? "Produk"}</p>
                          <p className="text-sm text-slate-500">{recommendation.type === "production" ? "Produksi" : "Beli"} - jatuh tempo {recommendation.dueDate}</p>
                        </div>
                        <span className={cn("rounded-full px-3 py-1 text-sm font-semibold", recommendation.type === "production" ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700")}>
                          {formatQty(recommendation.quantity)} {product?.unit}
                        </span>
                      </div>
                    );
                  })}
                  {workspace.mrpRecommendations.length === 0 ? <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">Belum ada rekomendasi.</p> : null}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <MobileDialog
        isOpen={showProductDialog}
        onClose={() => setShowProductDialog(false)}
        title="Tambah Produk"
        maxWidth="max-w-3xl"
      >
        <form action={(formData) => void saveProduct(formData)} className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-4">
            <div className="rounded-xl bg-white p-2.5 text-slate-700 shadow-sm"><PrimaryIcon className="size-5" aria-hidden /></div>
            <div>
              <p className="font-semibold text-slate-950">Data utama produk</p>
              <p className="mt-1 text-sm text-slate-500">Isi data yang paling sering dipakai. Pengaturan stok ada di bagian bawah.</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Jenis produk">
              <select name="industryItemType" className={inputClass()} value={itemType} onChange={(event) => setItemType(event.target.value as Product["industryItemType"])}>
                <option value="menu_item">Menu jual</option>
                <option value="raw_material">Bahan baku</option>
                <option value="finished_good">Produk jadi</option>
                <option value="semi_finished">Setengah jadi</option>
                <option value="retail_sku">SKU retail</option>
                <option value="service_item">Jasa</option>
                <option value="package">Paket/bundle</option>
              </select>
            </Field>
            <Field label="SKU"><input name="sku" className={inputClass()} defaultValue={defaultSku} required /></Field>
            <Field label="Nama"><input name="name" className={inputClass()} placeholder="Contoh: Nasi Ayam" required /></Field>
            <Field label="Kategori"><input name="category" className={inputClass()} defaultValue={itemType === "raw_material" ? "Bahan baku" : "Umum"} /></Field>
            <Field label="Satuan"><input name="unit" className={inputClass()} defaultValue={productIndustryDefaults(workspace.business.industry).unit} /></Field>
            <Field label="Gudang">
              <select name="defaultWarehouseId" className={inputClass()} defaultValue={defaultWarehouseId}>
                {workspace.warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
              </select>
            </Field>
            <Field label="Harga jual"><input name="sellingPrice" type="number" className={inputClass()} defaultValue={currentPreset.isSellable ? 0 : 0} /></Field>
            <Field label="Biaya / harga beli"><input name="purchasePrice" type="number" className={inputClass()} defaultValue={0} /></Field>
          </div>

          <div className="rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setShowStockSettings((value) => !value)}
              className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 text-left"
              aria-expanded={showStockSettings}
            >
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-950">
                <SlidersHorizontal className="size-4 text-slate-500" aria-hidden />
                Pengaturan stok
              </span>
              <ChevronDown className={cn("size-4 text-slate-500 transition", showStockSettings && "rotate-180")} aria-hidden />
            </button>
            {showStockSettings ? (
              <div className="grid gap-3 border-t border-slate-100 p-4 sm:grid-cols-2">
                <Field label="Reorder point"><input name="reorderPoint" type="number" className={inputClass()} defaultValue={0} /></Field>
                <Field label="Safety stock"><input name="safetyStock" type="number" className={inputClass()} defaultValue={0} /></Field>
                <Field label="Minimum order"><input name="minimumOrderQty" type="number" className={inputClass()} defaultValue={0} /></Field>
                <Field label="Lead time beli"><input name="leadTimeDays" type="number" className={inputClass()} defaultValue={0} /></Field>
                <Field label="Lead time produksi"><input name="productionLeadTimeDays" type="number" className={inputClass()} defaultValue={0} /></Field>
              </div>
            ) : (
              <div className="hidden">
                <input name="reorderPoint" type="hidden" value={0} />
                <input name="safetyStock" type="hidden" value={0} />
                <input name="minimumOrderQty" type="hidden" value={0} />
                <input name="leadTimeDays" type="hidden" value={0} />
                <input name="productionLeadTimeDays" type="hidden" value={0} />
              </div>
            )}
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setShowProductDialog(false)}
              className="min-h-11 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              disabled={pending === "product"}
              className="min-h-11 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {pending === "product" ? "Menyimpan..." : "Simpan Produk"}
            </button>
          </div>
        </form>
      </MobileDialog>
    </div>
  );
}
