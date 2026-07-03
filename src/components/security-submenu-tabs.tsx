"use client";

import { KeyRound, Laptop } from "lucide-react";
import { cn } from "@/components/ui";

export type SecuritySubmenu = "devices" | "password";

const securityTabs: {
  id: SecuritySubmenu;
  label: string;
  description: string;
  icon: React.ElementType;
}[] = [
  {
    id: "devices",
    label: "Device login",
    description: "Perangkat dan sesi aktif",
    icon: Laptop,
  },
  {
    id: "password",
    label: "Password",
    description: "Ubah atau reset password",
    icon: KeyRound,
  },
];

export function SecuritySubmenuTabs({
  value,
  onChange,
  className,
}: {
  value: SecuritySubmenu;
  onChange: (value: SecuritySubmenu) => void;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2 sm:grid-cols-2", className)}>
      {securityTabs.map((tab) => {
        const Icon = tab.icon;
        const active = value === tab.id;

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              "flex min-h-16 items-center gap-3 rounded-xl px-3 py-2 text-left transition",
              active
                ? "bg-white text-slate-950 shadow-sm ring-1 ring-slate-200"
                : "text-slate-600 hover:bg-white/70 hover:text-slate-950",
            )}
            aria-pressed={active}
          >
            <span
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-xl",
                active ? "bg-slate-950 text-white" : "bg-white text-slate-500",
              )}
            >
              <Icon className="size-5" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{tab.label}</span>
              <span className="mt-0.5 block text-xs text-slate-500">{tab.description}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
