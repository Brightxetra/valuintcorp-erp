import { WorkspacePageProvider } from "@/components/workspace-page-provider";
import { LaporanWorkspace } from "@/components/laporan-workspace";
import { getInitialErpWorkspace } from "@/lib/erp/workspace-loader";

export const dynamic = "force-dynamic";

export default async function LaporanPage() {
  const workspace = await getInitialErpWorkspace({ profile: "reports" });

  return (
    <WorkspacePageProvider workspace={workspace}>
      <LaporanWorkspace initialWorkspace={workspace} />
    </WorkspacePageProvider>
  );
}
