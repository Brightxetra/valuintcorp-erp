import { WorkspacePageProvider } from "@/components/workspace-page-provider";
import { ReportsWorkspaceV2 } from "@/components/erp-workspaces";
import { getInitialErpWorkspace } from "@/lib/erp/workspace-loader";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const workspace = await getInitialErpWorkspace({ profile: "reports" });

  return (
    <WorkspacePageProvider workspace={workspace}>
      <ReportsWorkspaceV2 initialWorkspace={workspace} />
    </WorkspacePageProvider>
  );
}
