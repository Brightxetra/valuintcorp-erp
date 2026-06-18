import { WorkspacePageProvider } from "@/components/workspace-page-provider";
import { KasWorkspace } from "@/components/kas-workspace-new";
import { getInitialErpWorkspace } from "@/lib/erp/workspace-loader";

export const dynamic = "force-dynamic";

export default async function KasBankPage() {
  const workspace = await getInitialErpWorkspace({ profile: "cash" });

  return (
    <WorkspacePageProvider workspace={workspace}>
      <KasWorkspace initialWorkspace={workspace} />
    </WorkspacePageProvider>
  );
}
