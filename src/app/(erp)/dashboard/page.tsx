import { WorkspacePageProvider } from "@/components/workspace-page-provider";
import { DashboardWorkspace } from "@/components/dashboard-new";
import { getInitialErpWorkspace } from "@/lib/erp/workspace-loader";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const workspace = await getInitialErpWorkspace({ profile: "dashboard" });

  return (
    <WorkspacePageProvider workspace={workspace}>
      <DashboardWorkspace initialWorkspace={workspace} />
    </WorkspacePageProvider>
  );
}
