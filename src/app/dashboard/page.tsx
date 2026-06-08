import { AppShell } from "@/components/app-shell-new";
import { DashboardWorkspace } from "@/components/dashboard-new";
import { getInitialErpWorkspace } from "@/lib/erp/workspace-loader";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const workspace = await getInitialErpWorkspace();

  return (
    <AppShell workspace={workspace}>
      <DashboardWorkspace initialWorkspace={workspace} />
    </AppShell>
  );
}