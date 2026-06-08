import { AppShell } from "@/components/app-shell-new";
import { PurchasesWorkspace } from "@/components/erp-workspaces";
import { getInitialErpWorkspace } from "@/lib/erp/workspace-loader";

export const dynamic = "force-dynamic";

export default async function PurchasesPage() {
  const workspace = await getInitialErpWorkspace();

  return (
    <AppShell workspace={workspace}>
      <PurchasesWorkspace initialWorkspace={workspace} />
    </AppShell>
  );
}
