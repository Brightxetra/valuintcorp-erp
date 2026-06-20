"use client";

import { useState } from "react";
import { Building2, CalendarClock, Check, Edit3, Landmark, Plus, Search, Trash2 } from "lucide-react";
import { useErpWorkspace } from "@/components/erp-context";
import { FeedbackToast } from "@/components/feedback-toast";
import { MobileDialog as Modal } from "@/components/mobile-dialog";
import { ActionButton, MetricCard, PageHeader, Panel, StatusPill } from "@/components/ui";
import { money } from "@/lib/format";
import {
  accumulatedDepreciationForAsset,
  bookValueForAsset,
  fixedAssetRegisterTotals,
  monthlyDepreciation,
} from "@/lib/erp/fixed-assets";
import type { ErpWorkspace, FixedAsset } from "@/lib/erp/types";

type AssetForm = {
  id?: string;
  assetNo: string;
  name: string;
  category: string;
  acquisitionDate: string;
  acquisitionCost: number;
  residualValue: number;
  usefulLifeMonths: number;
  acquisitionType: "opening_balance" | "cash" | "credit";
  locationId: string;
  supplierId: string;
  notes: string;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function currentPeriod() {
  return today().slice(0, 7);
}

function emptyAssetForm(): AssetForm {
  return {
    assetNo: "",
    name: "",
    category: "Peralatan",
    acquisitionDate: today(),
    acquisitionCost: 0,
    residualValue: 0,
    usefulLifeMonths: 36,
    acquisitionType: "opening_balance",
    locationId: "",
    supplierId: "",
    notes: "",
  };
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

function statusLabel(status: FixedAsset["status"]) {
  return {
    active: "Aktif",
    fully_depreciated: "Tersusut Penuh",
    disposed: "Dilepas",
  }[status];
}

function statusTone(status: FixedAsset["status"]): "emerald" | "amber" | "gray" | "red" | "cyan" {
  if (status === "active") return "emerald";
  if (status === "fully_depreciated") return "amber";
  return "red";
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

export function AsetTetapWorkspace({ initialWorkspace }: { initialWorkspace: ErpWorkspace }) {
  const { workspace, setWorkspace, request } = useErpWorkspace(initialWorkspace);
  const fixedAssets = workspace.fixedAssets ?? [];
  const depreciationRuns = workspace.fixedAssetDepreciationRuns ?? [];
  const depreciationLines = workspace.fixedAssetDepreciationLines ?? [];
  const disposals = workspace.fixedAssetDisposals ?? [];
  const locations = workspace.locations ?? [];
  const suppliers = workspace.suppliers ?? [];
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [assetForm, setAssetForm] = useState<AssetForm>(emptyAssetForm);
  const [assetModalOpen, setAssetModalOpen] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(fixedAssets[0]?.id ?? null);
  const [depreciationOpen, setDepreciationOpen] = useState(false);
  const [disposalOpen, setDisposalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [depreciationForm, setDepreciationForm] = useState({
    period: currentPeriod(),
    date: today(),
  });
  const [disposalForm, setDisposalForm] = useState({
    assetId: fixedAssets[0]?.id ?? "",
    date: today(),
    proceeds: 0,
    reason: "",
  });
  const postedRunIds = new Set(
    depreciationRuns.filter((run) => run.status === "posted").map((run) => run.id),
  );
  const activeDepreciationLines = depreciationLines.filter((line) => postedRunIds.has(line.runId));
  const totals = fixedAssetRegisterTotals({
    assets: fixedAssets,
    depreciationLines: activeDepreciationLines,
  });
  const filteredAssets = fixedAssets.filter((asset) => {
    const matchesSearch =
      search === "" ||
      asset.assetNo.toLowerCase().includes(search.toLowerCase()) ||
      asset.name.toLowerCase().includes(search.toLowerCase()) ||
      asset.category.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || asset.status === statusFilter;

    return matchesSearch && matchesStatus;
  });
  const selectedAsset = selectedAssetId
    ? fixedAssets.find((asset) => asset.id === selectedAssetId)
    : filteredAssets[0];
  const selectedAssetLines = selectedAsset
    ? activeDepreciationLines.filter((line) => line.assetId === selectedAsset.id)
    : [];
  const selectedAssetDisposals = selectedAsset
    ? disposals.filter((disposal) => disposal.assetId === selectedAsset.id)
    : [];
  const selectedBookValue = selectedAsset ? bookValueForAsset(selectedAsset, activeDepreciationLines) : 0;

  const depreciationPreview = fixedAssets
    .filter((asset) => asset.status === "active" && asset.acquisitionDate <= depreciationForm.date)
    .map((asset) => ({
      asset,
      amount: Math.min(
        monthlyDepreciation(asset),
        Math.max(asset.acquisitionCost - asset.residualValue - accumulatedDepreciationForAsset(asset.id, activeDepreciationLines), 0),
      ),
    }))
    .filter((line) => line.amount > 0);

  function openCreateAsset() {
    setAssetForm(emptyAssetForm());
    setAssetModalOpen(true);
  }

  function openEditAsset(asset: FixedAsset) {
    setAssetForm({
      id: asset.id,
      assetNo: asset.assetNo,
      name: asset.name,
      category: asset.category,
      acquisitionDate: asset.acquisitionDate,
      acquisitionCost: asset.acquisitionCost,
      residualValue: asset.residualValue,
      usefulLifeMonths: asset.usefulLifeMonths,
      acquisitionType: asset.acquisitionType,
      locationId: asset.locationId ?? "",
      supplierId: asset.supplierId ?? "",
      notes: asset.notes ?? "",
    });
    setAssetModalOpen(true);
  }

  async function mutate(endpoint: string, body: unknown, successMessage: string, method = "POST") {
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const data = await request<{ workspace: ErpWorkspace }>(endpoint, {
        method,
        body: JSON.stringify(body),
      });
      setWorkspace(data.workspace);
      setMessage(successMessage);
      return data.workspace;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Aksi gagal diproses.");
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function saveAsset() {
    const body = {
      ...assetForm,
      assetNo: assetForm.assetNo || undefined,
      locationId: assetForm.locationId || undefined,
      supplierId: assetForm.supplierId || undefined,
      notes: assetForm.notes || undefined,
    };
    const workspaceResult = await mutate(
      "/api/erp/fixed-assets",
      body,
      assetForm.id ? "Aset tetap berhasil diperbarui." : "Aset tetap berhasil dibuat.",
      assetForm.id ? "PATCH" : "POST",
    );

    if (workspaceResult) {
      setAssetModalOpen(false);
      setSelectedAssetId(assetForm.id ?? workspaceResult.fixedAssets[0]?.id ?? null);
    }
  }

  async function postDepreciation() {
    const workspaceResult = await mutate(
      "/api/erp/fixed-assets/depreciation-runs",
      depreciationForm,
      "Penyusutan aset berhasil dipost.",
    );

    if (workspaceResult) {
      setDepreciationOpen(false);
    }
  }

  async function disposeAsset() {
    const workspaceResult = await mutate(
      "/api/erp/fixed-assets/disposals",
      disposalForm,
      "Pelepasan aset berhasil dipost.",
    );

    if (workspaceResult) {
      setDisposalOpen(false);
    }
  }

  async function reverse(targetType: "depreciation_run" | "disposal", targetId: string) {
    await mutate(
      "/api/erp/fixed-assets/reverse",
      { targetType, targetId, date: today(), reason: "Koreksi dari halaman aset tetap" },
      "Reversal berhasil dipost.",
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Keuangan"
        title="Aset Tetap"
        description="Kelola register aset tetap, penyusutan bulanan, pelepasan aset, dan jurnal otomatis."
        action={
          <>
            <ActionButton variant="secondary" onClick={() => setDepreciationOpen(true)}>
              <CalendarClock className="size-4" />
              Jalankan Penyusutan
            </ActionButton>
            <ActionButton onClick={openCreateAsset}>
              <Plus className="size-4" />
              Tambah Aset
            </ActionButton>
          </>
        }
      />

      <FeedbackToast error={error} success={message} />

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Aset Aktif" value={String(totals.assetCount)} meta="Tidak termasuk aset disposed" icon={Building2} tone="gray" />
        <MetricCard label="Harga Perolehan" value={money(totals.acquisitionCost)} meta="Total cost aset aktif" icon={Landmark} tone="cyan" />
        <MetricCard label="Akumulasi Penyusutan" value={money(totals.accumulatedDepreciation)} meta="Run posted saja" icon={CalendarClock} tone="amber" />
        <MetricCard label="Nilai Buku" value={money(totals.bookValue)} meta="Cost dikurangi penyusutan" icon={Check} tone="emerald" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.45fr_1fr]">
        <Panel
          title="Register Aset"
          description="Klik baris untuk melihat detail, jadwal penyusutan, dan disposal."
          action={
            <div className="flex flex-wrap gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Cari aset..."
                  className="w-56 rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-emerald-500"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="all">Semua status</option>
                <option value="active">Aktif</option>
                <option value="fully_depreciated">Tersusut penuh</option>
                <option value="disposed">Dilepas</option>
              </select>
            </div>
          }
        >
          <div className="overflow-x-auto">
            <table className="mobile-card-table w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="py-3">Aset</th>
                  <th className="py-3">Kategori</th>
                  <th className="py-3 text-right">Cost</th>
                  <th className="py-3 text-right">Nilai Buku</th>
                  <th className="py-3 text-center">Status</th>
                  <th className="py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAssets.length === 0 ? (
                  <tr>
                    <td colSpan={6} data-mobile-label="" className="py-12 text-center text-slate-500">
                      Belum ada aset tetap.
                    </td>
                  </tr>
                ) : (
                  filteredAssets.map((asset) => {
                    const bookValue = bookValueForAsset(asset, activeDepreciationLines);
                    return (
                      <tr
                        key={asset.id}
                        className={`cursor-pointer hover:bg-slate-50 ${selectedAsset?.id === asset.id ? "bg-emerald-50/50" : ""}`}
                        onClick={() => setSelectedAssetId(asset.id)}
                      >
                        <td data-mobile-label="Aset" className="py-3">
                          <p className="font-semibold text-slate-950">{asset.assetNo}</p>
                          <p className="text-slate-600">{asset.name}</p>
                        </td>
                        <td data-mobile-label="Kategori" className="py-3 text-slate-600">{asset.category}</td>
                        <td data-mobile-label="Cost" className="py-3 text-right font-medium text-slate-950">{money(asset.acquisitionCost)}</td>
                        <td data-mobile-label="Nilai buku" className="py-3 text-right font-medium text-slate-950">{money(bookValue)}</td>
                        <td data-mobile-label="Status" className="py-3 text-center">
                          <StatusPill tone={statusTone(asset.status)}>{statusLabel(asset.status)}</StatusPill>
                        </td>
                        <td data-mobile-label="Aksi" className="py-3 text-right">
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              openEditAsset(asset);
                            }}
                            className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-100"
                          >
                            <Edit3 className="size-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel
          title="Detail Aset"
          description={selectedAsset ? `${selectedAsset.assetNo} - ${selectedAsset.name}` : "Pilih aset dari register."}
          action={
            selectedAsset && selectedAsset.status !== "disposed" ? (
              <ActionButton
                variant="danger"
                onClick={() => {
                  setDisposalForm({
                    assetId: selectedAsset.id,
                    date: today(),
                    proceeds: 0,
                    reason: "",
                  });
                  setDisposalOpen(true);
                }}
              >
                <Trash2 className="size-4" />
                Disposal
              </ActionButton>
            ) : null
          }
        >
          {!selectedAsset ? (
            <p className="text-sm text-slate-500">Belum ada aset terpilih.</p>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Tanggal Perolehan</p>
                  <p className="mt-1 font-semibold text-slate-950">{formatDate(selectedAsset.acquisitionDate)}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Penyusutan Bulanan</p>
                  <p className="mt-1 font-semibold text-slate-950">{money(monthlyDepreciation(selectedAsset))}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Akumulasi</p>
                  <p className="mt-1 font-semibold text-slate-950">{money(accumulatedDepreciationForAsset(selectedAsset.id, activeDepreciationLines))}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Nilai Buku</p>
                  <p className="mt-1 font-semibold text-slate-950">{money(selectedBookValue)}</p>
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-950">Jadwal Penyusutan</h3>
                {selectedAssetLines.length === 0 ? (
                  <p className="text-sm text-slate-500">Belum ada penyusutan posted.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedAssetLines.map((line) => (
                      <div key={line.id} className="flex items-center justify-between rounded-lg bg-slate-50 p-2 text-sm">
                        <span>{line.period}</span>
                        <span className="font-medium">{money(line.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-950">Disposal</h3>
                {selectedAssetDisposals.length === 0 ? (
                  <p className="text-sm text-slate-500">Belum ada disposal.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedAssetDisposals.map((disposal) => (
                      <div key={disposal.id} className="rounded-lg bg-slate-50 p-3 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-medium text-slate-950">{formatDate(disposal.date)}</p>
                            <p className="text-slate-500">{disposal.reason}</p>
                          </div>
                          <StatusPill tone={disposal.status === "posted" ? "red" : "gray"}>{disposal.status}</StatusPill>
                        </div>
                        <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                          <span>Gain/Loss: {money(disposal.gainLoss)}</span>
                          {disposal.status === "posted" ? (
                            <button onClick={() => reverse("disposal", disposal.id)} className="font-medium text-red-600 hover:underline">
                              Reverse
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Run Penyusutan" description="Riwayat run penyusutan bulanan dan reversal.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="py-3">Periode</th>
                <th className="py-3">Tanggal</th>
                <th className="py-3 text-right">Total</th>
                <th className="py-3 text-center">Status</th>
                <th className="py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {depreciationRuns.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">Belum ada run penyusutan.</td>
                </tr>
              ) : (
                depreciationRuns.map((run) => (
                  <tr key={run.id}>
                    <td className="py-3 font-medium text-slate-950">{run.period}</td>
                    <td className="py-3 text-slate-600">{formatDate(run.date)}</td>
                    <td className="py-3 text-right font-semibold text-slate-950">{money(run.totalDepreciation)}</td>
                    <td className="py-3 text-center">
                      <StatusPill tone={run.status === "posted" ? "emerald" : "gray"}>{run.status}</StatusPill>
                    </td>
                    <td className="py-3 text-right">
                      {run.status === "posted" ? (
                        <button onClick={() => reverse("depreciation_run", run.id)} className="text-sm font-medium text-red-600 hover:underline">
                          Reverse
                        </button>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Modal isOpen={assetModalOpen} title={assetForm.id ? "Edit Aset Tetap" : "Tambah Aset Tetap"} onClose={() => setAssetModalOpen(false)} maxWidth="max-w-2xl">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nomor aset">
            <input value={assetForm.assetNo} onChange={(event) => setAssetForm((current) => ({ ...current, assetNo: event.target.value }))} placeholder="Otomatis jika kosong" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Nama aset">
            <input value={assetForm.name} onChange={(event) => setAssetForm((current) => ({ ...current, name: event.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Kategori">
            <input value={assetForm.category} onChange={(event) => setAssetForm((current) => ({ ...current, category: event.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Tanggal perolehan">
            <input type="date" value={assetForm.acquisitionDate} onChange={(event) => setAssetForm((current) => ({ ...current, acquisitionDate: event.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Harga perolehan">
            <input type="number" value={assetForm.acquisitionCost} onChange={(event) => setAssetForm((current) => ({ ...current, acquisitionCost: Number(event.target.value) }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Nilai residu">
            <input type="number" value={assetForm.residualValue} onChange={(event) => setAssetForm((current) => ({ ...current, residualValue: Number(event.target.value) }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Umur manfaat (bulan)">
            <input type="number" value={assetForm.usefulLifeMonths} onChange={(event) => setAssetForm((current) => ({ ...current, usefulLifeMonths: Number(event.target.value) }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Tipe perolehan">
            <select value={assetForm.acquisitionType} onChange={(event) => setAssetForm((current) => ({ ...current, acquisitionType: event.target.value as AssetForm["acquisitionType"] }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="opening_balance">Saldo awal/register saja</option>
              <option value="cash">Pembelian tunai</option>
              <option value="credit">Pembelian kredit</option>
            </select>
          </Field>
          <Field label="Lokasi">
            <select value={assetForm.locationId} onChange={(event) => setAssetForm((current) => ({ ...current, locationId: event.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">Tanpa lokasi</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>{location.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Supplier">
            <select value={assetForm.supplierId} onChange={(event) => setAssetForm((current) => ({ ...current, supplierId: event.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">Tanpa supplier</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
              ))}
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Catatan">
              <textarea value={assetForm.notes} onChange={(event) => setAssetForm((current) => ({ ...current, notes: event.target.value }))} rows={3} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <ActionButton onClick={saveAsset} disabled={loading || !assetForm.name || assetForm.acquisitionCost <= 0}>
              {assetForm.id ? "Simpan Perubahan" : "Simpan Aset"}
            </ActionButton>
          </div>
        </div>
      </Modal>

      <Modal isOpen={depreciationOpen} title="Jalankan Penyusutan" onClose={() => setDepreciationOpen(false)} maxWidth="max-w-2xl">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Periode">
              <input value={depreciationForm.period} onChange={(event) => setDepreciationForm((current) => ({ ...current, period: event.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </Field>
            <Field label="Tanggal posting">
              <input type="date" value={depreciationForm.date} onChange={(event) => setDepreciationForm((current) => ({ ...current, date: event.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </Field>
          </div>
          <div className="rounded-lg bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-950">Preview</p>
            <p className="mt-1 text-sm text-slate-600">
              {depreciationPreview.length} aset akan disusutkan dengan total{" "}
              <span className="font-semibold text-slate-950">
                {money(depreciationPreview.reduce((total, line) => total + line.amount, 0))}
              </span>
              .
            </p>
          </div>
          <ActionButton onClick={postDepreciation} disabled={loading || depreciationPreview.length === 0}>
            Post Penyusutan
          </ActionButton>
        </div>
      </Modal>

      <Modal isOpen={disposalOpen} title="Pelepasan Aset" onClose={() => setDisposalOpen(false)} maxWidth="max-w-2xl">
        <div className="space-y-4">
          <Field label="Aset">
            <select value={disposalForm.assetId} onChange={(event) => setDisposalForm((current) => ({ ...current, assetId: event.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              {fixedAssets.filter((asset) => asset.status !== "disposed").map((asset) => (
                <option key={asset.id} value={asset.id}>{asset.assetNo} - {asset.name}</option>
              ))}
            </select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tanggal disposal">
              <input type="date" value={disposalForm.date} onChange={(event) => setDisposalForm((current) => ({ ...current, date: event.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </Field>
            <Field label="Hasil jual/proceeds">
              <input type="number" value={disposalForm.proceeds} onChange={(event) => setDisposalForm((current) => ({ ...current, proceeds: Number(event.target.value) }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </Field>
          </div>
          <Field label="Alasan">
            <textarea value={disposalForm.reason} onChange={(event) => setDisposalForm((current) => ({ ...current, reason: event.target.value }))} rows={3} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </Field>
          <ActionButton variant="danger" onClick={disposeAsset} disabled={loading || !disposalForm.assetId || disposalForm.reason.length < 3}>
            Post Disposal
          </ActionButton>
        </div>
      </Modal>
    </div>
  );
}
