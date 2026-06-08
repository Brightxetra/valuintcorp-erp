import { AppShell } from "@/components/app-shell-new";
import { OnboardingWorkspaceV2 } from "@/components/erp-workspaces";
import { getInitialErpWorkspace } from "@/lib/erp/workspace-loader";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const workspace = await getInitialErpWorkspace({ allowOnboardingFallback: true });

  return (
    <AppShell workspace={workspace}>
      <OnboardingWorkspaceV2 initialWorkspace={workspace} />
    </AppShell>
  );
}
