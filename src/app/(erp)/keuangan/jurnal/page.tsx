import { WorkspacePageProvider } from "@/components/workspace-page-provider";
import { JurnalWorkspace } from "@/components/jurnal-workspace-new";
import { getInitialErpWorkspace } from "@/lib/erp/workspace-loader";

export const dynamic = "force-dynamic";

export default async function CatatanJurnalPage() {
  const workspace = await getInitialErpWorkspace({ profile: "accounting" });

  return (
    <WorkspacePageProvider workspace={workspace}>
      <JurnalWorkspace initialWorkspace={workspace} />
    </WorkspacePageProvider>
  );
}
