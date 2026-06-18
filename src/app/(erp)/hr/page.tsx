import { WorkspacePageProvider } from "@/components/workspace-page-provider";
import { HrWorkspaceV2 } from "@/components/erp-workspaces";
import { getInitialErpWorkspace } from "@/lib/erp/workspace-loader";

export const dynamic = "force-dynamic";

export default async function HrPage() {
  const workspace = await getInitialErpWorkspace({ profile: "hr" });

  return (
    <WorkspacePageProvider workspace={workspace}>
      <HrWorkspaceV2 initialWorkspace={workspace} />
    </WorkspacePageProvider>
  );
}
