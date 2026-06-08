import { AppShell } from "@/components/app-shell-new";
import { TaxWorkspaceV2 } from "@/components/erp-workspaces";
import { getInitialErpWorkspace } from "@/lib/erp/workspace-loader";

export const dynamic = "force-dynamic";

export default async function TaxPage() {
  const workspace = await getInitialErpWorkspace();

  return (
    <AppShell workspace={workspace}>
      <TaxWorkspaceV2 initialWorkspace={workspace} />
    </AppShell>
  );
}
