import { WorkspacePageProvider } from "@/components/workspace-page-provider";
import { AccountingWorkspace } from "@/components/erp-workspaces";
import { getInitialErpWorkspace } from "@/lib/erp/workspace-loader";

export const dynamic = "force-dynamic";

export default async function AccountingPage() {
  const workspace = await getInitialErpWorkspace({ profile: "accounting" });

  return (
    <WorkspacePageProvider workspace={workspace}>
      <AccountingWorkspace initialWorkspace={workspace} />
    </WorkspacePageProvider>
  );
}
