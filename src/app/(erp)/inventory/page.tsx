import { WorkspacePageProvider } from "@/components/workspace-page-provider";
import { InventoryWorkspaceV2 } from "@/components/erp-workspaces";
import { getInitialErpWorkspace } from "@/lib/erp/workspace-loader";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const workspace = await getInitialErpWorkspace({ profile: "inventory" });

  return (
    <WorkspacePageProvider workspace={workspace}>
      <InventoryWorkspaceV2 initialWorkspace={workspace} />
    </WorkspacePageProvider>
  );
}
