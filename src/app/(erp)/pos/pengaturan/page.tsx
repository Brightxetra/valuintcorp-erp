import { PosSettingsWorkspace } from "@/components/pos-settings-workspace";
import { WorkspacePageProvider } from "@/components/workspace-page-provider";
import { getInitialErpWorkspace } from "@/lib/erp/workspace-loader";

export const dynamic = "force-dynamic";

export default async function PosPengaturanPage() {
  const workspace = await getInitialErpWorkspace({ profile: "pos" });
  return <WorkspacePageProvider workspace={workspace}><PosSettingsWorkspace initialWorkspace={workspace} /></WorkspacePageProvider>;
}
