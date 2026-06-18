import { WorkspacePageProvider } from "@/components/workspace-page-provider";
import { AsetTetapWorkspace } from "@/components/aset-tetap-workspace";
import { getInitialErpWorkspace } from "@/lib/erp/workspace-loader";

export const dynamic = "force-dynamic";

export default async function AsetTetapPage() {
  const workspace = await getInitialErpWorkspace({ profile: "assets" });

  return (
    <WorkspacePageProvider workspace={workspace}>
      <AsetTetapWorkspace initialWorkspace={workspace} />
    </WorkspacePageProvider>
  );
}
