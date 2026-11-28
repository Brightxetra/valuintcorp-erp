import { EmailAuthCallback } from "@/components/email-auth-callback";
import { getServerWorkspaceContext } from "@/lib/auth/server-session";
import { landingPathForPermissions, permissionsForRole } from "@/lib/security/permissions";

export const dynamic = "force-dynamic";

export default async function Home() {
  const context = await getServerWorkspaceContext();
  const destination = context ? landingPathForPermissions(context.permissions ?? permissionsForRole(context.role)) : "/dashboard";
  return <EmailAuthCallback destination={destination} />;
}
