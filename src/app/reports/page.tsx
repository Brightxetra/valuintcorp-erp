import { AppShell } from "@/components/app-shell-new";
import { ReportsWorkspaceV2 } from "@/components/erp-workspaces";
import { getInitialErpWorkspace } from "@/lib/erp/workspace-loader";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const workspace = await getInitialErpWorkspace();

  return (
    <AppShell workspace={workspace}>
      <ReportsWorkspaceV2 initialWorkspace={workspace} />
    </AppShell>
  );
}
