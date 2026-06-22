import { PosWorkspace } from "@/components/pos-workspace";
import { WorkspacePageProvider } from "@/components/workspace-page-provider";
import { getInitialErpWorkspace } from "@/lib/erp/workspace-loader";

export const dynamic = "force-dynamic";

export default async function PosPage() {
  const workspace = await getInitialErpWorkspace({ profile: "pos" });
  return <WorkspacePageProvider workspace={workspace}><PosWorkspace initialWorkspace={workspace} /></WorkspacePageProvider>;
}
