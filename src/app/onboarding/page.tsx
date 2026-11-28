import { redirect } from "next/navigation";
import { BusinessOnboarding } from "@/components/business-onboarding";
import { shouldUseDemoFallback } from "@/lib/auth/runtime";
import { getServerAccessToken, getServerWorkspaceContext } from "@/lib/auth/server-session";
import { landingPathForPermissions, permissionsForRole } from "@/lib/security/permissions";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const demoMode = shouldUseDemoFallback();
  if (!demoMode) {
    if (!(await getServerAccessToken())) redirect("/login");
    const context = await getServerWorkspaceContext();
    if (context) redirect(landingPathForPermissions(context.permissions ?? permissionsForRole(context.role)));
  }
  return <BusinessOnboarding demoMode={demoMode} />;
}
