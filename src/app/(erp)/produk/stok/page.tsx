import { WorkspacePageProvider } from "@/components/workspace-page-provider";
import { StokWorkspace } from "@/components/stok-workspace-new";
import { getInitialErpWorkspace } from "@/lib/erp/workspace-loader";

export const dynamic = "force-dynamic";

export default async function StokPersediaanPage() {
  const workspace = await getInitialErpWorkspace({ profile: "inventory" });

  return (
    <WorkspacePageProvider workspace={workspace}>
      <StokWorkspace initialWorkspace={workspace} />
    </WorkspacePageProvider>
  );
}
