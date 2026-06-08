import { AppShell } from "@/components/app-shell-new";
import { InventoryWorkspaceV2 } from "@/components/erp-workspaces";
import { getInitialErpWorkspace } from "@/lib/erp/workspace-loader";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const workspace = await getInitialErpWorkspace();

  return (
    <AppShell workspace={workspace}>
      <InventoryWorkspaceV2 initialWorkspace={workspace} />
    </AppShell>
  );
}
