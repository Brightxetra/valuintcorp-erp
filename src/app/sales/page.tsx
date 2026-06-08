import { AppShell } from "@/components/app-shell-new";
import { SalesWorkspace } from "@/components/erp-workspaces";
import { getInitialErpWorkspace } from "@/lib/erp/workspace-loader";

export const dynamic = "force-dynamic";

export default async function SalesPage() {
  const workspace = await getInitialErpWorkspace();

  return (
    <AppShell workspace={workspace}>
      <SalesWorkspace initialWorkspace={workspace} />
    </AppShell>
  );
}
