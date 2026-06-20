"use client";

import { useEffect, useRef } from "react";
import { notify } from "@/lib/notify";

interface FeedbackToastProps {
  error?: string | null;
  success?: string | null;
  successDescription?: string | null;
}

const successMessageLabels: Record<string, string> = {
  "business disimpan.": "Profil bisnis disimpan.",
  "tax_profile disimpan.": "Profil pajak disimpan.",
  "customer disimpan.": "Pelanggan disimpan.",
  "supplier disimpan.": "Supplier disimpan.",
  "product disimpan.": "Produk disimpan.",
  "warehouse disimpan.": "Gudang disimpan.",
  "business dinonaktifkan.": "Profil bisnis dinonaktifkan.",
  "tax_profile dinonaktifkan.": "Profil pajak dinonaktifkan.",
  "customer dinonaktifkan.": "Pelanggan dinonaktifkan.",
  "supplier dinonaktifkan.": "Supplier dinonaktifkan.",
  "product dinonaktifkan.": "Produk dinonaktifkan.",
  "warehouse dinonaktifkan.": "Gudang dinonaktifkan.",
};

function readableSuccess(message: string) {
  return successMessageLabels[message] ?? message;
}

export function FeedbackToast({ error = null, success = null, successDescription = null }: FeedbackToastProps) {
  const previous = useRef({ error: null as string | null, success: null as string | null });

  useEffect(() => {
    if (!success) {
      previous.current.success = null;
      return;
    }

    if (previous.current.success !== success) {
      previous.current.success = success;
      notify.success(readableSuccess(success), {
        description: successDescription ?? undefined,
        dedupeKey: `success:${success}:${successDescription ?? ""}`,
      });
    }
  }, [success, successDescription]);

  useEffect(() => {
    if (!error) {
      previous.current.error = null;
      return;
    }

    if (previous.current.error !== error) {
      previous.current.error = error;
      notify.error("Operasi gagal", { description: error, dedupeKey: `error:${error}` });
    }
  }, [error]);

  return null;
}
