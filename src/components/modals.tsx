"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, CheckCircle, Info, X, AlertCircle } from "lucide-react";
import { cn } from "@/components/ui";

// ============================================================================
// TOAST NOTIFICATION SYSTEM
// ============================================================================

export interface Toast {
  id: string;
  type: "success" | "error" | "warning" | "info";
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  duration?: number;
}

let toastListeners: ((toasts: Toast[]) => void)[] = [];
let currentToasts: Toast[] = [];

function notifyListeners(toasts: Toast[]) {
  currentToasts = toasts;
  toastListeners.forEach((listener) => listener(toasts));
}

export function addToast(toast: Omit<Toast, "id">) {
  const id = Math.random().toString(36).slice(2);
  const newToast: Toast = { ...toast, id };
  notifyListeners([...currentToasts, newToast]);

  // Auto remove after duration
  const duration = toast.duration ?? 5000;
  if (duration > 0) {
    setTimeout(() => removeToast(id), duration);
  }
}

export function removeToast(id: string) {
  notifyListeners(currentToasts.filter((t) => t.id !== id));
}

function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const listener = (newToasts: Toast[]) => setToasts(newToasts);
    toastListeners.push(listener);
    const timeout = window.setTimeout(() => setToasts(currentToasts), 0);
    return () => {
      window.clearTimeout(timeout);
      toastListeners = toastListeners.filter((l) => l !== listener);
    };
  }, []);

  return { toasts, removeToast };
}

// Toast Container Component
export function ToastContainer() {
  const { toasts, removeToast } = useToasts();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-20 right-4 z-50 flex flex-col gap-3 lg:bottom-4">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => removeToast(toast.id)} />
      ))}
    </div>
  );
}

// Individual Toast
function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const icons = {
    success: CheckCircle,
    error: AlertCircle,
    warning: AlertTriangle,
    info: Info,
  };
  const Icon = icons[toast.type];

  const typeStyles = {
    success: "border-emerald-200 bg-emerald-50",
    error: "border-red-200 bg-red-50",
    warning: "border-amber-200 bg-amber-50",
    info: "border-blue-200 bg-blue-50",
  };

  const iconStyles = {
    success: "text-emerald-600",
    error: "text-red-600",
    warning: "text-amber-600",
    info: "text-blue-600",
  };

  return (
    <div
      className={cn(
        "flex max-w-sm items-start gap-3 rounded-2xl border p-4 shadow-xl transition-all animate-in slide-in-from-right",
        typeStyles[toast.type]
      )}
    >
      <div className={cn("mt-0.5 rounded-full p-1", iconStyles[toast.type], "bg-white/50")}>
        <Icon className="size-4" aria-hidden />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-950">{toast.title}</p>
        {toast.description && (
          <p className="mt-1 text-sm text-slate-600">{toast.description}</p>
        )}
        {toast.action && (
          <button
            type="button"
            onClick={toast.action.onClick}
            className="mt-2 text-sm font-medium text-slate-700 underline hover:text-slate-900"
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="rounded-lg p-1 text-slate-400 hover:bg-white/50 hover:text-slate-600"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

// ============================================================================
// CONFIRMATION MODAL
// ============================================================================

interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  icon?: "warning" | "danger" | "info";
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
}

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  icon = "warning",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  loading = false,
}: ConfirmModalProps) {
  if (!open) return null;

  const icons = {
    warning: AlertTriangle,
    danger: AlertCircle,
    info: Info,
  };
  const Icon = icons[icon];

  const iconStyles = {
    warning: "bg-amber-100 text-amber-600",
    danger: "bg-red-100 text-red-600",
    info: "bg-blue-100 text-blue-600",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <X className="size-5" />
        </button>

        <div className="flex items-start gap-4">
          <div className={cn("rounded-2xl p-3", iconStyles[icon])}>
            <Icon className="size-6" aria-hidden />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
            {description && (
              <p className="mt-2 text-sm text-slate-600">{description}</p>
            )}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={cn(
              "rounded-xl px-4 py-2.5 text-sm font-medium text-white transition-colors disabled:opacity-50",
              icon === "danger" ? "bg-red-600 hover:bg-red-700" : "bg-slate-900 hover:bg-slate-800"
            )}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Processing...
              </span>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// VOID DOCUMENT MODAL - Specialized Confirmation
// ============================================================================

interface VoidDocumentModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  document: {
    type: string;
    number: string;
    customer?: string;
    amount: number;
  } | null;
  loading?: boolean;
}

export function VoidDocumentModal({
  open,
  onClose,
  onConfirm,
  document,
  loading = false,
}: VoidDocumentModalProps) {
  const [reason, setReason] = useState("");

  if (!open) return null;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(value);
  };

  if (!document) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-4 border-b border-slate-100 p-6">
          <div className="rounded-2xl bg-red-100 p-3">
            <AlertTriangle className="size-6 text-red-600" aria-hidden />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Void Document</h2>
            <p className="text-sm text-slate-500">Pembatalan tidak dapat dibatalkan</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Document Info */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Tipe</p>
                <p className="mt-1 font-semibold text-slate-950 capitalize">{document.type.replace("_", " ")}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Nomor</p>
                <p className="mt-1 font-semibold text-slate-950">{document.number}</p>
              </div>
              {document.customer && (
                <div className="col-span-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Customer/Supplier</p>
                  <p className="mt-1 font-semibold text-slate-950">{document.customer}</p>
                </div>
              )}
              <div className="col-span-2">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Amount</p>
                <p className="mt-1 text-lg font-bold text-slate-950">{formatCurrency(document.amount)}</p>
              </div>
            </div>
          </div>

          {/* Impact Warning */}
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
            <h4 className="flex items-center gap-2 text-sm font-semibold text-red-800">
              <AlertTriangle className="size-4" aria-hidden />
              Dampak Pembatalan
            </h4>
            <ul className="mt-2 space-y-1 text-sm text-red-700">
              <li className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-red-400" />
                Jurnal akuntansi terkait akan dibatalkan
              </li>
              <li className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-red-400" />
                {document.type.includes("sales") ? "Piutang customer akan dihapus" : "Utang supplier akan dihapus"}
              </li>
              <li className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-red-400" />
                Nomor dokumen tidak dapat digunakan kembali
              </li>
            </ul>
          </div>

          {/* Reason Input */}
          <div className="mt-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Alasan pembatalan <span className="text-red-500">*</span></span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Contoh: Customer mengembalikan barang, order dibatalkan..."
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                rows={3}
              />
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-100 p-6">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={() => onConfirm(reason)}
            disabled={loading || !reason.trim()}
            className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <>
                <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Memproses...
              </>
            ) : (
              <>
                <AlertTriangle className="size-4" aria-hidden />
                Void Document
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// SUCCESS MODAL
// ============================================================================

interface SuccessModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  actions?: { label: string; onClick: () => void }[];
}

export function SuccessModal({
  open,
  onClose,
  title,
  description,
  actions,
}: SuccessModalProps) {
  useEffect(() => {
    if (open) {
      const timer = setTimeout(onClose, 3000);
      return () => clearTimeout(timer);
    }
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-emerald-200 bg-white p-6 text-center shadow-2xl">
        <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle className="size-8 text-emerald-600" aria-hidden />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-slate-950">{title}</h2>
        {description && <p className="mt-2 text-sm text-slate-600">{description}</p>}
        {actions && (
          <div className="mt-6 flex justify-center gap-3">
            {actions.map((action, i) => (
              <button
                key={i}
                type="button"
                onClick={action.onClick}
                className={cn(
                  "rounded-xl px-4 py-2.5 text-sm font-medium transition-colors",
                  i === 0 ? "bg-slate-900 text-white hover:bg-slate-800" : "border border-slate-200 text-slate-700 hover:bg-slate-50"
                )}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
