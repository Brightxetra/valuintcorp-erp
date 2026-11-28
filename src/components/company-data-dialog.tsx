"use client";

import HCaptcha from "@hcaptcha/react-hcaptcha";
import type { HCaptcha as HCaptchaInstance } from "@hcaptcha/react-hcaptcha";
import { useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { MobileDialog } from "@/components/mobile-dialog";
import { ActionButton, TextField } from "@/components/ui";
import { erpApiFetch } from "@/lib/erp/client-api";

export function CompanyDataDialog({ company, action, onClose, onComplete }: {
  company: { id: string; displayName: string };
  action: "reset" | "delete";
  onClose: () => void;
  onComplete: () => void | Promise<void>;
}) {
  const deleting = action === "delete";
  const operation = useRef<string>(null);
  const busy = useRef(false);
  const captcha = useRef<HCaptchaInstance | null>(null);
  const [pending, setPending] = useState(false);
  const [storagePending, setStoragePending] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [error, setError] = useState("");
  const siteKey = process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY;

  async function submit(form: FormData) {
    if (busy.current) return;
    busy.current = true;
    operation.current ??= crypto.randomUUID();
    setPending(true);
    setError("");
    try {
      const result = await erpApiFetch<{ storagePending: boolean }>("/api/erp/company-data", {
        method: "POST",
        businessId: null,
        body: JSON.stringify({ action, businessId: company.id, operationId: operation.current, password: form.get("password"), ...(captchaToken ? { captchaToken } : {}) }),
      });
      if (result.storagePending) {
        setStoragePending(true);
      } else {
        await onComplete();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Permintaan gagal diproses.");
    } finally {
      busy.current = false;
      setPending(false);
      setCaptchaToken(null);
      captcha.current?.resetCaptcha();
    }
  }

  const title = deleting ? "Hapus perusahaan" : "Reset seluruh data";
  return (
    <MobileDialog isOpen title={title} onClose={() => { if (!pending && !storagePending) onClose(); }}>
      <form action={submit} className="space-y-4">
        <div className="flex gap-3 rounded-xl bg-red-50 p-3 text-sm leading-relaxed text-red-900">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div>
            <p className="font-semibold">{company.displayName}</p>
            <p className="mt-1">{deleting
              ? "Perusahaan, akses seluruh anggotanya, dan semua datanya akan dihapus permanen."
              : "Transaksi, jurnal, stok, produk, data pelanggan dan pemasok, data karyawan, penggajian serta lampiran akan dihapus permanen. Profil perusahaan, anggota dan konfigurasi dasar tetap tersedia."}</p>
          </div>
        </div>
        {storagePending && <p role="alert" className="text-sm text-amber-800">Data perusahaan sudah diproses. Masukkan password kembali untuk menuntaskan penghapusan berkas tersisa.</p>}
        <TextField name="password" label="Password akun" type="password" autoComplete="current-password" required />
        {siteKey && <HCaptcha ref={captcha} sitekey={siteKey} onVerify={setCaptchaToken} onExpire={() => setCaptchaToken(null)} onError={() => { setCaptchaToken(null); setError("Verifikasi hCaptcha gagal. Coba lagi."); }} />}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          {storagePending ? <ActionButton type="button" variant="secondary" disabled={pending} onClick={() => { void onComplete(); }}>Selesaikan nanti</ActionButton> : <ActionButton type="button" variant="secondary" disabled={pending} onClick={onClose}>Batal</ActionButton>}
          <button type="submit" disabled={pending || Boolean(siteKey && !captchaToken)} className="min-h-10 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60">
            {pending ? "Memproses…" : storagePending ? "Hapus berkas tersisa" : title}
          </button>
        </div>
      </form>
    </MobileDialog>
  );
}
