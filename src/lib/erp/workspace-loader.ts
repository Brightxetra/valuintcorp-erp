import { redirect } from "next/navigation";
import { getServerAccessToken, getServerAuthenticatedUser, getServerWorkspaceContext, createServerSupabaseClient } from "@/lib/auth/server-session";
import { shouldUseDemoFallback } from "@/lib/auth/runtime";
import { createDemoErpWorkspace } from "@/lib/erp/demo-workspace";
import { getDemoErpStore } from "@/lib/erp/demo-store";
import { refreshErpWorkspace } from "@/lib/erp/operations";
import type { ErpWorkspace } from "@/lib/erp/types";
import { loadSupabaseWorkspace } from "@/lib/erp/workspace-repository";

function createOnboardingWorkspace(user: NonNullable<Awaited<ReturnType<typeof getServerAuthenticatedUser>>>): ErpWorkspace {
  const base = createDemoErpWorkspace();
  const emptyWorkspace = refreshErpWorkspace({
    ...base,
    user: {
      id: user.userId,
      name: user.userName ?? user.userEmail ?? "Supabase user",
      email: user.userEmail ?? "",
      role: "owner",
    },
    business: {
      ...base.business,
      id: "00000000-0000-0000-0000-000000000000",
      legalName: "Setup Bisnis",
      displayName: "Setup Bisnis",
      ownerName: user.userName ?? user.userEmail ?? "Owner",
      industry: "general",
      taxId: undefined,
    },
    locations: [],
    featureFlags: [],
    transactionSources: [],
    memberInvites: [],
    customers: [],
    suppliers: [],
    products: [],
    warehouses: [],
    salesInvoices: [],
    purchaseBills: [],
    payments: [],
    paymentAllocations: [],
    stockMovements: [],
    stockTransfers: [],
    stockAdjustments: [],
    employees: [],
    attendance: [],
    payrollRuns: [],
    journals: [],
    importBatches: [],
    rawImportBatches: [],
    rawTransactions: [],
    rawTransactionLines: [],
    rawPayments: [],
    settlementRecords: [],
    dailyTransactionSummaries: [],
    locationMetrics: [],
    attachments: [],
    activities: [],
  });

  return emptyWorkspace;
}

export async function getInitialErpWorkspace(options: { allowOnboardingFallback?: boolean } = {}): Promise<ErpWorkspace> {
  const context = await getServerWorkspaceContext();
  const accessToken = await getServerAccessToken();

  if (context && accessToken) {
    try {
      return await loadSupabaseWorkspace(createServerSupabaseClient(accessToken), context);
    } catch {
      if (!shouldUseDemoFallback()) {
        redirect("/login");
      }
    }
  }

  if (!shouldUseDemoFallback()) {
    if (options.allowOnboardingFallback && accessToken) {
      const user = await getServerAuthenticatedUser();
      if (user) return createOnboardingWorkspace(user);
    }

    redirect("/login");
  }

  return getDemoErpStore();
}
