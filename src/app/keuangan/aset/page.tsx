import { AppShell } from "@/components/app-shell-new";
import { AsetTetapWorkspace } from "@/components/aset-tetap-workspace";
import { getInitialErpWorkspace } from "@/lib/erp/workspace-loader";

export const dynamic = "force-dynamic";

export default async function AsetTetapPage() {
  const workspace = await getInitialErpWorkspace();

  return (
    <AppShell workspace={workspace}>
      <AsetTetapWorkspace initialWorkspace={workspace} />
    </AppShell>
  );
}
