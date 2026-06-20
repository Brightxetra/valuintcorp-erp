"use client";

import type { LucideIcon } from "lucide-react";
import { FeedbackToast } from "@/components/feedback-toast";

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

// ============================================================================
// PREMIUM DESIGN TOKENS
// ============================================================================

export const tokens = {
  colors: {
    background: "#f8fafc",
    foreground: "#0f172a",
    card: "#ffffff",
    cardHover: "#f8fafc",
    border: "#e2e8f0",
    borderHover: "#cbd5e1",
    muted: "#94a3b8",
    text: "#1e293b",
    textSecondary: "#64748b",
    primary: "#0f172a",
    primaryHover: "#1e293b",
    accent: "#3b82f6",
    accentHover: "#2563eb",
    success: "#059669",
    successBg: "#d1fae5",
    warning: "#d97706",
    warningBg: "#fef3c7",
    error: "#dc2626",
    errorBg: "#fee2e2",
  },
  shadows: {
    sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
    md: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
    lg: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
    xl: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
  },
  radius: {
    sm: "0.375rem",
    md: "0.5rem",
    lg: "0.75rem",
    xl: "1rem",
  },
} as const;

// ============================================================================
// TYPOGRAPHY
// ============================================================================

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div>
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">{eyebrow}</p>
        ) : null}
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
      </div>
      {action ? <div className="flex flex-wrap gap-3">{action}</div> : null}
    </div>
  );
}

export function WorkspaceHeader({
  title,
  description,
  primaryAction,
  secondaryAction,
}: {
  title: string;
  description: string;
  primaryAction?: React.ReactNode;
  secondaryAction?: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {secondaryAction}
          {primaryAction}
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// PANELS & CARDS
// ============================================================================

export function Panel({
  title,
  description,
  action,
  children,
  className,
  noPadding = false,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  noPadding?: boolean;
}) {
  return (
    <section className={cn("rounded-xl border border-slate-200 bg-white shadow-sm", className)}>
      {title ? (
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-slate-950">{title}</h2>
            {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      <div className={noPadding ? "" : "p-5"}>{children}</div>
    </section>
  );
}

export function Card({
  children,
  className,
  hover = false,
}: {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all",
        hover && "hover:border-slate-300 hover:shadow-md cursor-pointer",
        className,
      )}
    >
      {children}
    </div>
  );
}

// ============================================================================
// METRIC CARDS - Premium KPI Display
// ============================================================================

export function MetricCard({
  label,
  value,
  meta,
  trend,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  meta?: string;
  trend?: { value: number; label: string };
  icon: LucideIcon;
  tone?: "emerald" | "blue" | "amber" | "neutral" | "red";
}) {
  const toneClasses = {
    emerald: { bg: "bg-emerald-50", text: "text-emerald-600", iconBg: "bg-emerald-100" },
    blue: { bg: "bg-blue-50", text: "text-blue-600", iconBg: "bg-blue-100" },
    amber: { bg: "bg-amber-50", text: "text-amber-600", iconBg: "bg-amber-100" },
    neutral: { bg: "bg-slate-50", text: "text-slate-600", iconBg: "bg-slate-100" },
    red: { bg: "bg-red-50", text: "text-red-600", iconBg: "bg-red-100" },
  }[tone];

  const trendClasses = trend
    ? trend.value >= 0
      ? "text-emerald-600"
      : "text-red-600"
    : "";

  return (
    <div className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{value}</p>
          {meta && <p className="mt-1 text-sm text-slate-400">{meta}</p>}
          {trend && (
            <p className={cn("mt-2 text-sm font-medium", trendClasses)}>
              {trend.value >= 0 ? "↑" : "↓"} {Math.abs(trend.value)}% {trend.label}
            </p>
          )}
        </div>
        <div className={cn("rounded-xl p-3", toneClasses.iconBg)}>
          <Icon className={cn("size-5", toneClasses.text)} aria-hidden />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// STAT TILES - Compact Metric Display
// ============================================================================

export function StatTile({
  label,
  value,
  helper,
  icon: Icon,
}: {
  label: string;
  value: string;
  helper?: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-3">
      {Icon && (
        <div className="rounded-lg bg-white p-2">
          <Icon className="size-4 text-slate-600" aria-hidden />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-1 text-sm font-semibold text-slate-950">{value}</p>
        {helper && <p className="mt-0.5 text-xs text-slate-400">{helper}</p>}
      </div>
    </div>
  );
}

// ============================================================================
// STATUS PILLS - Clean Status Indicators
// ============================================================================

export function StatusPill({
  children,
  tone = "neutral",
  size = "default",
}: {
  children: React.ReactNode;
  tone?: "emerald" | "blue" | "amber" | "neutral" | "red";
  size?: "sm" | "default";
}) {
  const toneClasses = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    neutral: "bg-slate-100 text-slate-700 border-slate-200",
    red: "bg-red-50 text-red-700 border-red-200",
  }[tone];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border font-medium",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        toneClasses,
      )}
    >
      {children}
    </span>
  );
}

// ============================================================================
// BUTTONS - Premium Action Components
// ============================================================================

export function ActionButton({
  children,
  variant = "primary",
  size = "default",
  icon: Icon,
  iconPosition = "left",
  loading = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "default" | "lg";
  icon?: LucideIcon;
  iconPosition?: "left" | "right";
  loading?: boolean;
}) {
  const variantClasses = {
    primary: "bg-slate-900 text-white hover:bg-slate-800 active:bg-slate-950",
    secondary: "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 active:bg-slate-100",
    ghost: "bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-950",
    danger: "bg-red-600 text-white hover:bg-red-700 active:bg-red-800",
  }[variant];

  const sizeClasses = {
    sm: "px-3 py-1.5 text-xs",
    default: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base",
  }[size];

  const iconSize = size === "sm" ? "size-3.5" : size === "lg" ? "size-5" : "size-4";

  return (
    <button
      {...props}
      disabled={loading || props.disabled}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50",
        variantClasses,
        sizeClasses,
        props.className,
      )}
    >
      {loading ? (
        <svg className={cn("animate-spin", iconSize)} viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : (
        <>
          {Icon && iconPosition === "left" && <Icon className={iconSize} aria-hidden />}
          {children}
          {Icon && iconPosition === "right" && <Icon className={iconSize} aria-hidden />}
        </>
      )}
    </button>
  );
}

export function IconButton({
  children,
  variant = "secondary",
  size = "default",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "default" | "lg";
}) {
  const variantClasses = {
    primary: "bg-slate-900 text-white hover:bg-slate-800",
    secondary: "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
    ghost: "bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-950",
  }[variant];

  const sizeClasses = {
    sm: "p-1.5",
    default: "p-2",
    lg: "p-3",
  }[size];

  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center justify-center rounded-lg transition-all disabled:cursor-not-allowed disabled:opacity-50",
        variantClasses,
        sizeClasses,
        props.className,
      )}
    >
      {children}
    </button>
  );
}

// ============================================================================
// FORM INPUTS - Clean & Accessible
// ============================================================================

export function TextField({
  label,
  hint,
  error,
  required,
  icon: Icon,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  icon?: LucideIcon;
}) {
  return (
    <label className="block">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        {required && <span className="text-red-500">*</span>}
      </div>
      <div className="relative mt-1">
        {Icon && (
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <Icon className="size-4 text-slate-400" aria-hidden />
          </div>
        )}
        <input
          {...props}
          className={cn(
            "w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none transition placeholder:text-slate-400",
            Icon ? "pl-10" : "",
            error
              ? "border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-100"
              : "border-slate-200 focus:border-slate-400 focus:ring-2 focus:ring-slate-100",
            props.className,
          )}
        />
      </div>
      {hint && !error && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
      <FeedbackToast error={error} />
    </label>
  );
}

export function SelectField({
  label,
  hint,
  error,
  required,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        {required && <span className="text-red-500">*</span>}
      </div>
      <select
        {...props}
        className={cn(
          "mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none transition",
          error
            ? "border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-100"
            : "border-slate-200 focus:border-slate-400 focus:ring-2 focus:ring-slate-100",
          props.className,
        )}
      >
        {children}
      </select>
      {hint && !error && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
      <FeedbackToast error={error} />
    </label>
  );
}

export function TextArea({
  label,
  hint,
  error,
  required,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        {required && <span className="text-red-500">*</span>}
      </div>
      <textarea
        {...props}
        className={cn(
          "mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none transition placeholder:text-slate-400",
          error
            ? "border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-100"
            : "border-slate-200 focus:border-slate-400 focus:ring-2 focus:ring-slate-100",
          props.className,
        )}
      />
      {hint && !error && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
      <FeedbackToast error={error} />
    </label>
  );
}

// ============================================================================
// DATA TABLE - Premium Table Component
// ============================================================================

export function DataTable({
  columns,
  children,
  empty,
}: {
  columns: string[];
  children: React.ReactNode;
  empty?: { title: string; description: string };
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <p className="border-b border-slate-100 px-3 py-2 text-xs text-slate-500 sm:hidden">Geser tabel untuk melihat kolom lain.</p>
      <div
        className="overflow-x-auto"
        role="region"
        aria-label="Tabel data. Geser horizontal untuk melihat kolom lain."
        tabIndex={0}
      >
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-slate-50">
            <tr>
              {columns.map((column, i) => (
                <th
                  key={column}
                  className={cn(
                    "px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500",
                    i === 0 && "w-px",
                  )}
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">{children}</tbody>
        </table>
        {empty && empty.title && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm font-medium text-slate-900">{empty.title}</p>
            <p className="mt-1 text-sm text-slate-500">{empty.description}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export function TableRow({
  children,
  onClick,
  hover = true,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  hover?: boolean;
}) {
  return (
    <tr
      className={cn(
        "transition-colors",
        hover && "hover:bg-slate-50",
        onClick && "cursor-pointer",
      )}
      onClick={onClick}
    >
      {children}
    </tr>
  );
}

export function TableCell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={cn("px-4 py-3 text-sm text-slate-700", className)}>{children}</td>;
}

// ============================================================================
// FILTER BAR
// ============================================================================

export function FilterBar({
  placeholder = "Cari...",
  value,
  onChange,
  children,
  onClear,
}: {
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  children?: React.ReactNode;
  onClear?: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative flex-1">
        <input
          type="search"
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
        />
        <svg
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        {value && onClear && (
          <button
            type="button"
            onClick={onClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

// ============================================================================
// EMPTY STATE
// ============================================================================

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {Icon && (
        <div className="rounded-2xl bg-slate-100 p-4">
          <Icon className="size-8 text-slate-400" aria-hidden />
        </div>
      )}
      <p className="mt-4 text-base font-medium text-slate-900">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ============================================================================
// MODAL - Dialog Component
// ============================================================================

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "default",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "default" | "lg" | "xl";
}) {
  const sizeClasses = {
    sm: "max-w-sm",
    default: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
  }[size];

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cn(
          "relative z-10 w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-xl",
          sizeClasses,
        )}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <X className="size-5" />
        </button>
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
          {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
        </div>
        <div className="mb-6">{children}</div>
        {footer && <div className="flex justify-end gap-3">{footer}</div>}
      </div>
    </div>
  );
}

// ============================================================================
// TABS - Navigation Tabs
// ============================================================================

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: string; label: string; count?: number }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="-mb-px flex gap-1 border-b border-slate-200">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={cn(
            "relative px-4 py-3 text-sm font-medium transition-colors",
            active === tab.id ? "text-slate-950" : "text-slate-500 hover:text-slate-700",
          )}
        >
          <span>{tab.label}</span>
          {tab.count !== undefined && (
            <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs">{tab.count}</span>
          )}
          {active === tab.id && (
            <span className="absolute inset-x-0 bottom-0 mx-4 h-0.5 rounded-full bg-slate-950" />
          )}
        </button>
      ))}
    </div>
  );
}

// ============================================================================
// SKELETON - Loading States
// ============================================================================

export function Skeleton({
  className,
}: {
  className?: string;
}) {
  return <div className={cn("animate-pulse rounded-lg bg-slate-200", className)} />;
}

export function SkeletonCard() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between">
        <div className="space-y-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="size-12 rounded-xl" />
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <div className="bg-slate-50 px-4 py-3">
        <div className="flex gap-8">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <div className="divide-y divide-slate-100 bg-white">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-8 px-4 py-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-28" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// PROGRESS - Step Progress Indicator
// ============================================================================

export function ProgressSteps({
  steps,
  current,
}: {
  steps: string[];
  current: number;
}) {
  return (
    <div className="flex items-center">
      {steps.map((step, i) => (
        <div key={step} className="flex items-center">
          <div
            className={cn(
              "flex size-8 items-center justify-center rounded-full text-sm font-medium",
              i < current ? "bg-slate-900 text-white" : i === current ? "border-2 border-slate-900 text-slate-900" : "bg-slate-100 text-slate-400",
            )}
          >
            {i < current ? "✓" : i + 1}
          </div>
          {i < steps.length - 1 && (
            <div className={cn("mx-2 h-0.5 w-8", i < current ? "bg-slate-900" : "bg-slate-200")} />
          )}
          <span className={cn("ml-2 text-sm", i <= current ? "text-slate-700" : "text-slate-400")}>{step}</span>
          {i < steps.length - 1 && <span className="mx-3 text-slate-300">/</span>}
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// DIVIDER
// ============================================================================

export function Divider({
  label,
}: {
  label?: string;
}) {
  if (!label) {
    return <hr className="my-6 border-slate-200" />;
  }
  return (
    <div className="my-6 flex items-center gap-4">
      <hr className="flex-1 border-slate-200" />
      <span className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</span>
      <hr className="flex-1 border-slate-200" />
    </div>
  );
}

// Import X for the close button
import { X } from "lucide-react";
