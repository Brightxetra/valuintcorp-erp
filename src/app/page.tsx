import { redirect } from "next/navigation";
import { getServerWorkspaceContext } from "@/lib/auth/server-session";
import { isPosOnlyPermissionSet, permissionsForRole } from "@/lib/security/permissions";

export const dynamic = "force-dynamic";

export default async function Home() {
  const context = await getServerWorkspaceContext();

  const permissions = context ? context.permissions ?? permissionsForRole(context.role) : null;

  if (permissions && isPosOnlyPermissionSet(permissions)) {
    redirect("/pos");
  }

  redirect("/dashboard");
}
