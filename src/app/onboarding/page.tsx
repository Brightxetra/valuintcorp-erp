import { WorkspacePageProvider } from "@/components/workspace-page-provider";
import { OnboardingWorkspaceV2 } from "@/components/erp-workspaces";
import { getInitialErpWorkspace } from "@/lib/erp/workspace-loader";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const workspace = await getInitialErpWorkspace({ allowOnboardingFallback: true, profile: "onboarding" });

  return (
    <main className="min-h-screen overflow-x-clip bg-slate-50 px-4 py-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-slate-950 lg:px-6">
      <div className="mx-auto max-w-[1200px]">
        <WorkspacePageProvider workspace={workspace}>
          <OnboardingWorkspaceV2 initialWorkspace={workspace} />
        </WorkspacePageProvider>
      </div>
    </main>
  );
}
