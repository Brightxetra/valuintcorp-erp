import { WorkspacePageProvider } from "@/components/workspace-page-provider";
import { SalesWorkspace } from "@/components/erp-workspaces";
import { getInitialErpWorkspace } from "@/lib/erp/workspace-loader";

export const dynamic = "force-dynamic";

export default async function SalesPage() {
  const workspace = await getInitialErpWorkspace({ profile: "sales" });

  return (
    <WorkspacePageProvider workspace={workspace}>
      <SalesWorkspace initialWorkspace={workspace} />
    </WorkspacePageProvider>
  );
}
