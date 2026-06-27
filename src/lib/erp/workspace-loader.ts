import { redirect } from "next/navigation";
import { getServerAccessToken, getServerAuthenticatedUser, getServerWorkspaceContext, createServerSupabaseClient } from "@/lib/auth/server-session";
import { shouldUseDemoFallback } from "@/lib/auth/runtime";
import { createDemoErpWorkspace } from "@/lib/erp/demo-workspace";
import { getDemoErpStore } from "@/lib/erp/demo-store";
import { refreshErpWorkspace } from "@/lib/erp/operations";
import type { ErpWorkspace } from "@/lib/erp/types";
import { permissionsForRole, type Permission } from "@/lib/security/permissions";
import { loadSupabaseWorkspace, type WorkspaceLoadOptions } from "@/lib/erp/workspace-repository";


function requiredPermissionForProfile(profile: WorkspaceLoadOptions["profile"]): Permission | null {
  switch (profile) {
    case "dashboard": case "settings": case "full": return "business:read";
    case "sales": case "purchases": case "cash": return "accounting:write";
    case "inventory": case "pricing": return "inventory:manage";
    case "accounting": case "assets": case "document-detail": return "accounting:read";
    case "reports": return "reports:export";
    case "tax": return "tax:prepare";
    case "hr": return "hr:manage";
    case "pos": return "pos:read";
    case "payroll": return "payroll:run";
    case "onboarding": return "business:update";
    default: return null;
  }
}

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
    productStructures: [],
    demandForecasts: [],
    mrpRuns: [],
    mrpRecommendations: [],
    productionOrders: [],
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

export async function getInitialErpWorkspace(
  options: WorkspaceLoadOptions & { allowOnboardingFallback?: boolean } = {},
): Promise<ErpWorkspace> {
  const context = await getServerWorkspaceContext();
  const accessToken = await getServerAccessToken();

  if (context && accessToken) {
    const requiredPermission = requiredPermissionForProfile(options.profile);
    const permissions = context.permissions ?? permissionsForRole(context.role);
    if (requiredPermission && !permissions.includes(requiredPermission)) {
      redirect("/access-denied");
    }
    try {
      return await loadSupabaseWorkspace(createServerSupabaseClient(accessToken), context, options);
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
