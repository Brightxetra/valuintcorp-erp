import { WorkspacePageProvider } from "@/components/workspace-page-provider";
import { PurchasesWorkspace } from "@/components/erp-workspaces";
import { getInitialErpWorkspace } from "@/lib/erp/workspace-loader";

export const dynamic = "force-dynamic";

export default async function PurchasesPage() {
  const workspace = await getInitialErpWorkspace({ profile: "purchases" });

  return (
    <WorkspacePageProvider workspace={workspace}>
      <PurchasesWorkspace initialWorkspace={workspace} />
    </WorkspacePageProvider>
  );
}
