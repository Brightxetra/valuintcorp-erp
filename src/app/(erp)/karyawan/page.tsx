import { WorkspacePageProvider } from "@/components/workspace-page-provider";
import { KaryawanWorkspace } from "@/components/karyawan-workspace";
import { getInitialErpWorkspace } from "@/lib/erp/workspace-loader";

export const dynamic = "force-dynamic";

export default async function KaryawanPage() {
  const workspace = await getInitialErpWorkspace({ profile: "hr" });

  return (
    <WorkspacePageProvider workspace={workspace}>
      <KaryawanWorkspace initialWorkspace={workspace} />
    </WorkspacePageProvider>
  );
}
