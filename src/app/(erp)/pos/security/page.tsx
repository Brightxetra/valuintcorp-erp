import { PosSecurityWorkspace } from "@/components/pos-security-workspace";
import { WorkspacePageProvider } from "@/components/workspace-page-provider";
import { getInitialErpWorkspace } from "@/lib/erp/workspace-loader";

export const dynamic = "force-dynamic";

export default async function PosSecurityPage() {
  const workspace = await getInitialErpWorkspace({ profile: "pos" });
  return <WorkspacePageProvider workspace={workspace}><PosSecurityWorkspace initialWorkspace={workspace} /></WorkspacePageProvider>;
}
