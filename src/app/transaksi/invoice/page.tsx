import { AppShell } from "@/components/app-shell-new";
import { TransaksiWorkspace } from "@/components/transaksi-workspace-new";
import { getInitialErpWorkspace } from "@/lib/erp/workspace-loader";

export const dynamic = "force-dynamic";

export default async function InvoicePenjualanPage() {
  const workspace = await getInitialErpWorkspace();

  return (
    <AppShell workspace={workspace}>
      <TransaksiWorkspace initialWorkspace={workspace} />
    </AppShell>
  );
}
