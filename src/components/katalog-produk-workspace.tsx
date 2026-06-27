"use client";

import { useState } from "react";
import { Boxes, ClipboardList, Factory, Layers3, Plus, RefreshCcw, Utensils } from "lucide-react";
import { useErpWorkspace } from "@/components/erp-context";
import { PageHeader, cn } from "@/components/ui";
import type { ErpWorkspace, Product } from "@/lib/erp/types";
import { calculateProductUnitCost, productIndustryDefaults } from "@/lib/erp/industry-workflows";
import { notify } from "@/lib/notify";

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
      eyebrow: "Katalog F&B",
      title: "Menu, bahan baku, resep, dan HPP",
      description: "Input bahan makanan/minuman, susun resep per menu, lalu biarkan HPP dan kebutuhan bahan dihitung dari struktur resep.",
      structureLabel: "Resep",
      primaryIcon: Utensils,
    };
  }

  if (industry === "manufacturing") {
    return {
      eyebrow: "Katalog manufaktur",
      title: "Produk, BOM, dan MRP",
      description: "Kelola bahan baku, barang setengah jadi, finished goods, BOM, serta rekomendasi beli/produksi dari demand.",
      structureLabel: "BOM",
      primaryIcon: Factory,
    };
  }

  if (industry === "service") {
    return {
      eyebrow: "Katalog jasa",
      title: "Paket jasa, biaya langsung, dan resource",
      description: "Kelola jasa yang dijual, komponen biaya langsung, dan katalog pendukung tanpa memaksa workflow stok retail.",
      structureLabel: "Komponen biaya",
      primaryIcon: ClipboardList,
    };
  }

  return {
    eyebrow: "Katalog produk",
    title: "Produk, harga, stok, dan struktur biaya",
    description: "Satu tempat untuk membuat SKU, jasa, paket, bahan, dan struktur biaya yang dipakai transaksi.",
    structureLabel: "Struktur",
    primaryIcon: Boxes,
  };
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
    <label className="grid gap-1 text-sm font-medium text-slate-700">
      <span>{label}</span>
      {children}
    </label>
  );
}

function inputClass() {
  return "min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200";
}

export function KatalogProdukWorkspace({ initialWorkspace }: { initialWorkspace: ErpWorkspace }) {
  const { workspace, setWorkspace, request } = useErpWorkspace(initialWorkspace);
  const [pending, setPending] = useState<string | null>(null);
  const [defaultSku] = useState(() => `SKU-${Date.now().toString().slice(-5)}`);
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

  const productRows = activeProducts
    .map((product) => ({
      product,
      unitCost: calculateProductUnitCost(product, workspace.products, workspace.productStructures),
      structure: workspace.productStructures.find((structure) => structure.parentProductId === product.id && structure.isActive),
    }))
    .sort((a, b) => a.product.sku.localeCompare(b.product.sku));

  async function saveProduct(formData: FormData) {
    const preset = itemPreset(String(formData.get("industryItemType")) as Product["industryItemType"], workspace.business.industry);
    setPending("product");
    try {
      const body = await request<{ workspace: ErpWorkspace }>("/api/erp/master-data", {
        method: "POST",
        body: JSON.stringify({
          resource: "product",
          values: {
            sku: String(formData.get("sku")),
            name: String(formData.get("name")),
            industryItemType: String(formData.get("industryItemType")),
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
    <div className="space-y-6">
      <PageHeader
        eyebrow={copy.eyebrow}
        title={copy.title}
        description={copy.description}
        action={
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
            Industri aktif: <span className="font-semibold text-slate-950">{workspace.business.industry.replace("_", " ")}</span>
          </div>
        }
      />

      <section className="grid gap-3 md:grid-cols-4">
        {[
          { label: "Item aktif", value: activeProducts.length, icon: Boxes },
          { label: copy.structureLabel, value: workspace.productStructures.filter((item) => item.isActive).length, icon: Layers3 },
          { label: "Forecast", value: workspace.demandForecasts.length, icon: ClipboardList },
          { label: "Rekomendasi MRP", value: workspace.mrpRecommendations.filter((item) => item.status === "planned").length, icon: RefreshCcw },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">{item.label}</p>
                <Icon className="h-5 w-5 text-slate-400" />
              </div>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{item.value}</p>
            </div>
          );
        })}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <form action={(formData) => void saveProduct(formData)} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-start gap-3">
            <div className="rounded-2xl bg-slate-950 p-3 text-white"><PrimaryIcon className="h-5 w-5" /></div>
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Tambah item katalog</h2>
              <p className="text-sm text-slate-500">Pilih jenis item; sistem akan set stok, sellable/purchasable, dan metode fulfilment otomatis.</p>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Jenis item">
              <select name="industryItemType" className={inputClass()} value={itemType} onChange={(event) => setItemType(event.target.value as Product["industryItemType"])}>
                <option value="menu_item">Menu jual</option>
                <option value="raw_material">Bahan baku</option>
                <option value="finished_good">Finished good</option>
                <option value="semi_finished">Setengah jadi</option>
                <option value="retail_sku">SKU retail</option>
                <option value="service_item">Jasa</option>
                <option value="package">Paket/bundle</option>
              </select>
            </Field>
            <Field label="SKU"><input name="sku" className={inputClass()} defaultValue={defaultSku} required /></Field>
            <Field label="Nama"><input name="name" className={inputClass()} placeholder="Contoh: Nasi Ayam / Tepung / Produk A" required /></Field>
            <Field label="Kategori"><input name="category" className={inputClass()} defaultValue={itemType === "raw_material" ? "Bahan baku" : "Umum"} /></Field>
            <Field label="Satuan"><input name="unit" className={inputClass()} defaultValue={productIndustryDefaults(workspace.business.industry).unit} /></Field>
            <Field label="Gudang default">
              <select name="defaultWarehouseId" className={inputClass()} defaultValue={defaultWarehouseId}>
                {workspace.warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
              </select>
            </Field>
            <Field label="Harga jual"><input name="sellingPrice" type="number" className={inputClass()} defaultValue={currentPreset.isSellable ? 0 : 0} /></Field>
            <Field label="Biaya / harga beli"><input name="purchasePrice" type="number" className={inputClass()} defaultValue={0} /></Field>
            <Field label="Reorder point"><input name="reorderPoint" type="number" className={inputClass()} defaultValue={0} /></Field>
            <Field label="Safety stock"><input name="safetyStock" type="number" className={inputClass()} defaultValue={0} /></Field>
            <Field label="Minimum order"><input name="minimumOrderQty" type="number" className={inputClass()} defaultValue={0} /></Field>
            <Field label="Lead time beli"><input name="leadTimeDays" type="number" className={inputClass()} defaultValue={0} /></Field>
            <Field label="Lead time produksi"><input name="productionLeadTimeDays" type="number" className={inputClass()} defaultValue={0} /></Field>
          </div>
          <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
            <span>Mode: {currentPreset.fulfillmentMethod.replaceAll("_", " ")} · {currentPreset.makeOrBuy}</span>
            <button disabled={pending === "product"} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 font-semibold text-white disabled:opacity-60">
              <Plus className="h-4 w-4" /> Simpan item
            </button>
          </div>
        </form>

        <form action={(formData) => void saveStructure(formData)} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-start gap-3">
            <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700"><Layers3 className="h-5 w-5" /></div>
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Susun {copy.structureLabel}</h2>
              <p className="text-sm text-slate-500">Hubungkan menu/produk dengan bahan atau komponen biaya.</p>
            </div>
          </div>
          <div className="grid gap-3">
            <Field label="Produk utama">
              <select name="parentProductId" className={inputClass()} required>
                {sellableProducts.map((product) => <option key={product.id} value={product.id}>{product.sku} — {product.name}</option>)}
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
            <div className="rounded-2xl border border-slate-200">
              <div className="grid grid-cols-[1fr_90px_90px] gap-2 border-b border-slate-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <span>Komponen</span><span>Qty</span><span>Waste %</span>
              </div>
              {[0, 1, 2, 3, 4].map((index) => (
                <div key={index} className="grid grid-cols-[1fr_90px_90px] gap-2 border-b border-slate-100 p-2 last:border-b-0">
                  <select name={`component-${index}`} className={inputClass()}>
                    <option value="">Pilih</option>
                    {componentProducts.map((product) => <option key={product.id} value={product.id}>{product.sku} — {product.name}</option>)}
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
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <form action={(formData) => void runMrp(formData)} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-start gap-3">
            <div className="rounded-2xl bg-blue-50 p-3 text-blue-700"><RefreshCcw className="h-5 w-5" /></div>
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Run MRP</h2>
              <p className="text-sm text-slate-500">Masukkan demand, sistem memberi rekomendasi beli/produksi berdasarkan stok, safety stock, dan lead time.</p>
            </div>
          </div>
          <div className="grid gap-3">
            <Field label="Nama run"><input name="name" className={inputClass()} defaultValue={defaultMrpName} /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Mulai"><input name="periodStart" type="date" className={inputClass()} defaultValue={defaultPeriodStart} required /></Field>
              <Field label="Selesai"><input name="periodEnd" type="date" className={inputClass()} defaultValue={defaultPeriodEnd} required /></Field>
            </div>
            <Field label="Forecast produk">
              <select name="forecastProductId" className={inputClass()}>
                <option value="">Gunakan forecast yang sudah ada</option>
                {sellableProducts.map((product) => <option key={product.id} value={product.id}>{product.sku} — {product.name}</option>)}
              </select>
            </Field>
            <Field label="Qty forecast"><input name="forecastQuantity" type="number" step="0.01" className={inputClass()} placeholder="Opsional" /></Field>
            <button disabled={pending === "mrp"} className="min-h-11 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
              Jalankan MRP
            </button>
          </div>
        </form>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Rekomendasi terakhir</h2>
          <div className="mt-4 space-y-3">
            {workspace.mrpRecommendations.slice(0, 6).map((recommendation) => {
              const product = workspace.products.find((item) => item.id === recommendation.productId);
              return (
                <div key={recommendation.id} className="flex flex-col gap-2 rounded-2xl border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold text-slate-950">{product?.name ?? "Produk"}</p>
                    <p className="text-sm text-slate-500">{recommendation.type === "production" ? "Produksi" : "Beli"} · due {recommendation.dueDate}</p>
                  </div>
                  <span className={cn("rounded-full px-3 py-1 text-sm font-semibold", recommendation.type === "production" ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700")}>
                    {formatQty(recommendation.quantity)} {product?.unit}
                  </span>
                </div>
              );
            })}
            {workspace.mrpRecommendations.length === 0 ? <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Belum ada rekomendasi. Jalankan MRP setelah produk dan demand siap.</p> : null}
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-950">Katalog aktif</h2>
          <p className="text-sm text-slate-500">HPP dihitung dari resep/BOM jika tersedia; jika tidak, memakai harga beli.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[900px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">SKU</th>
                <th className="px-5 py-3">Nama</th>
                <th className="px-5 py-3">Jenis</th>
                <th className="px-5 py-3">Fulfillment</th>
                <th className="px-5 py-3 text-right">Harga jual</th>
                <th className="px-5 py-3 text-right">HPP/unit</th>
                <th className="px-5 py-3">Struktur</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {productRows.map(({ product, unitCost, structure }) => (
                <tr key={product.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-mono text-xs text-slate-500">{product.sku}</td>
                  <td className="px-5 py-3 font-semibold text-slate-950">{product.name}</td>
                  <td className="px-5 py-3">{product.industryItemType.replaceAll("_", " ")}</td>
                  <td className="px-5 py-3">{product.fulfillmentMethod.replaceAll("_", " ")}</td>
                  <td className="px-5 py-3 text-right">{formatCurrency(product.sellingPrice)}</td>
                  <td className="px-5 py-3 text-right">{formatCurrency(unitCost)}</td>
                  <td className="px-5 py-3">
                    {structure ? <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">{structure.type}</span> : <span className="text-slate-400">-</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
