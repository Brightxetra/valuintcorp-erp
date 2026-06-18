import { WorkspacePageProvider } from "@/components/workspace-page-provider";
import { OnboardingWorkspaceV2 } from "@/components/erp-workspaces";
import { getInitialErpWorkspace } from "@/lib/erp/workspace-loader";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const workspace = await getInitialErpWorkspace({ allowOnboardingFallback: true, profile: "onboarding" });

  return (
    <WorkspacePageProvider workspace={workspace}>
      <OnboardingWorkspaceV2 initialWorkspace={workspace} />
    </WorkspacePageProvider>
  );
}
