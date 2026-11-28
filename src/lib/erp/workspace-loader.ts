import { redirect } from "next/navigation";
import { getServerAccessToken, getServerWorkspaceContext, createServerSupabaseClient } from "@/lib/auth/server-session";
import { shouldUseDemoFallback } from "@/lib/auth/runtime";
import { getDemoErpStore } from "@/lib/erp/demo-store";
import type { ErpWorkspace } from "@/lib/erp/types";
import { isPosOnlyPermissionSet, permissionsForRole } from "@/lib/security/permissions";
import { loadSupabaseWorkspace, type WorkspaceLoadOptions } from "@/lib/erp/workspace-repository";
import { canOpenWorkspaceProfile } from "@/lib/erp/workspace-profiles";

export async function getInitialErpWorkspace(options: WorkspaceLoadOptions = {}): Promise<ErpWorkspace> {
  if (shouldUseDemoFallback()) return getDemoErpStore();

  const accessToken = await getServerAccessToken();
  if (!accessToken) redirect("/login");

  const context = await getServerWorkspaceContext();
  if (!context) redirect("/onboarding");

  const permissions = context.permissions ?? permissionsForRole(context.role);
  if (!canOpenWorkspaceProfile(options.profile ?? "full", permissions)) {
    redirect(isPosOnlyPermissionSet(permissions) ? "/pos" : "/access-denied");
  }

  return loadSupabaseWorkspace(createServerSupabaseClient(accessToken), context, options);
}
