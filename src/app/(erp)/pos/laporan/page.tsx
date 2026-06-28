import { PosReportsWorkspace } from "@/components/pos-reports-workspace";
import { WorkspacePageProvider } from "@/components/workspace-page-provider";
import { getInitialErpWorkspace } from "@/lib/erp/workspace-loader";

export const dynamic = "force-dynamic";

export default async function PosLaporanPage() {
  const workspace = await getInitialErpWorkspace({ profile: "pos" });
  return <WorkspacePageProvider workspace={workspace}><PosReportsWorkspace initialWorkspace={workspace} /></WorkspacePageProvider>;
}
