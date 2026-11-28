import { isApiResponse, requireApiMembership, requireApiPermission, withDemoHeader } from "@/lib/auth/api";
import { getDemoErpStore } from "@/lib/erp/demo-store";
import { loadSupabaseWorkspace } from "@/lib/erp/workspace-repository";
import {
  canOpenWorkspaceProfile,
  parsePublicWorkspaceProfile,
  requiredPermissionForWorkspaceProfile,
} from "@/lib/erp/workspace-profiles";
import { createRequestSupabaseClient } from "@/lib/supabase/server";

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export async function GET(request: Request) {
  const profile = parsePublicWorkspaceProfile(new URL(request.url).searchParams.get("profile"));
  if (!profile) {
    return json({ error: "Workspace profile tidak dikenal atau tidak diizinkan." }, 400);
  }

  const permission = profile === "settings" ? null : requiredPermissionForWorkspaceProfile(profile);
  const context = permission
    ? await requireApiPermission(request, permission)
    : await requireApiMembership(request);

  if (isApiResponse(context)) {
    return context;
  }

  if (profile === "settings" && !canOpenWorkspaceProfile(profile, context.permissions)) {
    return json({ error: "Akses pengaturan belum diberikan." }, 403);
  }

  if (context.demoMode) {
    return withDemoHeader(json({ workspace: getDemoErpStore() }), context);
  }

  const supabase = createRequestSupabaseClient(request);

  try {
    return withDemoHeader(json({ workspace: await loadSupabaseWorkspace(supabase, context, { profile }) }), context);
  } catch (error) {
    return withDemoHeader(
      json({ error: error instanceof Error ? error.message : "Workspace gagal dimuat." }, 500),
      context,
    );
  }
}
