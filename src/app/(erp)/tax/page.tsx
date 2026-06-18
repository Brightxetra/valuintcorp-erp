import { WorkspacePageProvider } from "@/components/workspace-page-provider";
import { TaxWorkspaceV2 } from "@/components/erp-workspaces";
import { getInitialErpWorkspace } from "@/lib/erp/workspace-loader";

export const dynamic = "force-dynamic";

export default async function TaxPage() {
  const workspace = await getInitialErpWorkspace({ profile: "tax" });

  return (
    <WorkspacePageProvider workspace={workspace}>
      <TaxWorkspaceV2 initialWorkspace={workspace} />
    </WorkspacePageProvider>
  );
}
