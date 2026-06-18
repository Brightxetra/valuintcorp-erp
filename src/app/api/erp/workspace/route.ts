import { isApiResponse, requireApiPermission, withDemoHeader } from "@/lib/auth/api";
import { getDemoErpStore } from "@/lib/erp/demo-store";
import { loadSupabaseWorkspace, type WorkspaceLoadProfile } from "@/lib/erp/workspace-repository";
import { createRequestSupabaseClient } from "@/lib/supabase/server";

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

const workspaceProfiles = new Set<WorkspaceLoadProfile>([
  "full",
  "shell",
  "dashboard",
  "sales",
  "purchases",
  "cash",
  "inventory",
  "pricing",
  "accounting",
  "reports",
  "tax",
  "hr",
  "payroll",
  "assets",
  "settings",
  "onboarding",
  "document-detail",
]);

function requestedProfile(request: Request): WorkspaceLoadProfile {
  const raw = new URL(request.url).searchParams.get("profile");
  return raw && workspaceProfiles.has(raw as WorkspaceLoadProfile) ? (raw as WorkspaceLoadProfile) : "full";
}

export async function GET(request: Request) {
  const context = await requireApiPermission(request, "business:read");

  if (isApiResponse(context)) {
    return context;
  }

  if (context.demoMode) {
    return withDemoHeader(json({ workspace: getDemoErpStore() }), context);
  }

  const supabase = createRequestSupabaseClient(request);

  try {
    return withDemoHeader(json({ workspace: await loadSupabaseWorkspace(supabase, context, { profile: requestedProfile(request) }) }), context);
  } catch (error) {
    return withDemoHeader(
      json({ error: error instanceof Error ? error.message : "Workspace gagal dimuat." }, 500),
      context,
    );
  }
}
