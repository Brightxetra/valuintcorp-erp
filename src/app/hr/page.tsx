import { AppShell } from "@/components/app-shell-new";
import { HrWorkspaceV2 } from "@/components/erp-workspaces";
import { getInitialErpWorkspace } from "@/lib/erp/workspace-loader";

export const dynamic = "force-dynamic";

export default async function HrPage() {
  const workspace = await getInitialErpWorkspace();

  return (
    <AppShell workspace={workspace}>
      <HrWorkspaceV2 initialWorkspace={workspace} />
    </AppShell>
  );
}
