import { WorkspacePageProvider } from "@/components/workspace-page-provider";
import { HargaWorkspace } from "@/components/harga-workspace-new";
import { getInitialErpWorkspace } from "@/lib/erp/workspace-loader";

export const dynamic = "force-dynamic";

export default async function DaftarHargaPage() {
  const workspace = await getInitialErpWorkspace({ profile: "pricing" });

  return (
    <WorkspacePageProvider workspace={workspace}>
      <HargaWorkspace initialWorkspace={workspace} />
    </WorkspacePageProvider>
  );
}
