"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRightLeft } from "lucide-react";
import { MobileDialog } from "@/components/mobile-dialog";
import { ActionButton, SelectField } from "@/components/ui";
import { erpApiFetch, storeBusinessNotice, type BusinessOption } from "@/lib/erp/client-api";
import type { ErpWorkspace } from "@/lib/erp/types";
import { notify } from "@/lib/notify";

type Transfer = {
  id: string;
  business_id: string;
  requested_by: string;
  recipient_id: string;
  expires_at: string;
};

export function OwnershipTransferButton({ workspace }: { workspace: ErpWorkspace }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const candidates = (workspace.members ?? []).filter((member) => member.role !== "owner" && member.role !== "system_admin" && member.authUserId !== workspace.user.id);

  async function request(form: FormData) {
    setPending(true);
    setError("");
    try {
      await erpApiFetch("/api/erp/ownership", {
        method: "POST",
        body: JSON.stringify({ action: "request", businessId: workspace.business.id, recipientId: form.get("recipientId") }),
      });
      setOpen(false);
      notify.success("Permintaan transfer dikirim", { description: "Calon pemilik dapat menanggapinya di Perusahaan Saya." });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Permintaan transfer gagal dikirim.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <ActionButton type="button" variant="secondary" onClick={() => { setError(""); setOpen(true); }}><ArrowRightLeft className="size-4" aria-hidden /> Transfer kepemilikan</ActionButton>
      <MobileDialog isOpen={open} title="Transfer kepemilikan" onClose={() => { if (!pending) setOpen(false); }}>
        <form action={request} className="space-y-4">
          <p className="text-sm text-slate-600">Anggota yang dipilih harus menerima permintaan dalam 7 hari. Setelah diterima, akun Anda menjadi anggota dengan izin kosong sampai pemilik baru memberikan akses.</p>
          {candidates.length ? <SelectField name="recipientId" label="Calon pemilik" required defaultValue="">
            <option value="" disabled>Pilih anggota</option>
            {candidates.map((member) => <option key={member.id} value={member.authUserId}>{member.email || member.authUserId}</option>)}
          </SelectField> : <p className="text-sm text-slate-600">Undang anggota dan tunggu sampai emailnya terverifikasi.</p>}
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <Link href="/perusahaan" className="inline-flex items-center px-3 py-2 text-sm font-medium text-slate-700">Lihat permintaan</Link>
            <ActionButton disabled={pending || !candidates.length}>{pending ? "Mengirim…" : "Kirim permintaan"}</ActionButton>
          </div>
        </form>
      </MobileDialog>
    </>
  );
}

export function OwnershipRequests({ userId, businesses }: { userId: string; businesses: BusinessOption[] }) {
  const [requests, setRequests] = useState<Transfer[]>([]);
  const [selection, setSelection] = useState<{ transfer: Transfer; action: "accept" | "decline" | "cancel" }>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void erpApiFetch<{ transfers: Transfer[] }>("/api/erp/ownership", { signal: controller.signal, businessId: null })
      .then(({ transfers }) => setRequests(transfers))
      .catch(() => { if (!controller.signal.aborted) setError("Permintaan kepemilikan gagal dimuat."); });
    return () => controller.abort();
  }, []);

  async function respond() {
    if (!selection || pending) return;
    const { transfer, action } = selection;
    setPending(true);
    setError("");
    try {
      await erpApiFetch("/api/erp/ownership", {
        method: "POST",
        businessId: null,
        body: JSON.stringify({ action, businessId: transfer.business_id, transferId: transfer.id }),
      });
      if (action === "accept") {
        storeBusinessNotice("Transfer kepemilikan diterima");
        window.location.reload();
        return;
      }
      setRequests((current) => current.filter((item) => item.id !== transfer.id));
      setSelection(undefined);
      notify.success(action === "decline" ? "Permintaan transfer ditolak" : "Permintaan transfer dibatalkan");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Permintaan gagal diproses.");
    } finally {
      setPending(false);
    }
  }

  const visible = requests.flatMap((transfer) => {
    const business = businesses.find((item) => item.id === transfer.business_id);
    return business ? [{ transfer, business }] : [];
  });
  if (!visible.length && !error) return null;
  const title = selection?.action === "accept" ? "Terima kepemilikan" : selection?.action === "decline" ? "Tolak transfer" : "Batalkan transfer";

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-base font-semibold">Permintaan transfer kepemilikan</h2>
      {!selection && error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {visible.map(({ transfer, business }) => (
        <div key={transfer.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <div><p className="font-medium">{business.displayName}</p><p className="text-sm text-slate-600">{transfer.recipient_id === userId ? "Anda dipilih sebagai pemilik baru." : "Menunggu persetujuan calon pemilik."} Berlaku hingga {new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" }).format(new Date(transfer.expires_at))}.</p></div>
          <div className="flex flex-wrap gap-2">
            {transfer.recipient_id === userId ? <>
              <ActionButton type="button" variant="secondary" onClick={() => setSelection({ transfer, action: "decline" })}>Tolak</ActionButton>
              <ActionButton type="button" onClick={() => setSelection({ transfer, action: "accept" })}>Terima kepemilikan</ActionButton>
            </> : <ActionButton type="button" variant="secondary" onClick={() => setSelection({ transfer, action: "cancel" })}>Batalkan permintaan</ActionButton>}
          </div>
        </div>
      ))}
      <MobileDialog isOpen={Boolean(selection)} title={title} onClose={() => { if (!pending) { setSelection(undefined); setError(""); } }}>
        <p className="text-sm text-slate-600">{selection?.action === "accept" ? "Setelah diterima, akun Anda memperoleh seluruh akses pemilik perusahaan." : "Permintaan ini akan ditutup."}</p>
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
        <div className="mt-4 flex justify-end"><ActionButton type="button" disabled={pending} onClick={() => void respond()}>{pending ? "Memproses…" : title}</ActionButton></div>
      </MobileDialog>
    </section>
  );
}
