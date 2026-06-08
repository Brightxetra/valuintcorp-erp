import { AppShell } from "@/components/app-shell-new";
import { AccountingWorkspace } from "@/components/erp-workspaces";
import { getInitialErpWorkspace } from "@/lib/erp/workspace-loader";

export const dynamic = "force-dynamic";

export default async function AccountingPage() {
  const workspace = await getInitialErpWorkspace();

  return (
    <AppShell workspace={workspace}>
      <AccountingWorkspace initialWorkspace={workspace} />
    </AppShell>
  );
}
