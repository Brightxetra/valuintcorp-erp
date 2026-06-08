import { AppShell } from "@/components/app-shell-new";
import { KasWorkspace } from "@/components/kas-workspace-new";
import { getInitialErpWorkspace } from "@/lib/erp/workspace-loader";

export const dynamic = "force-dynamic";

export default async function KasBankPage() {
  const workspace = await getInitialErpWorkspace();

  return (
    <AppShell workspace={workspace}>
      <KasWorkspace initialWorkspace={workspace} />
    </AppShell>
  );
}
