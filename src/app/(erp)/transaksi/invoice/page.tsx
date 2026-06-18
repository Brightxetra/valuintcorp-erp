import { WorkspacePageProvider } from "@/components/workspace-page-provider";
import { TransaksiWorkspace } from "@/components/transaksi-workspace-new";
import { getInitialErpWorkspace } from "@/lib/erp/workspace-loader";

export const dynamic = "force-dynamic";

export default async function InvoicePenjualanPage() {
  const workspace = await getInitialErpWorkspace({ profile: "sales" });

  return (
    <WorkspacePageProvider workspace={workspace}>
      <TransaksiWorkspace initialWorkspace={workspace} />
    </WorkspacePageProvider>
  );
}
