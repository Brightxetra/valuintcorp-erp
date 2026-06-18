import { WorkspacePageProvider } from "@/components/workspace-page-provider";
import { TagihanWorkspace } from "@/components/tagihan-workspace-new";
import { getInitialErpWorkspace } from "@/lib/erp/workspace-loader";

export const dynamic = "force-dynamic";

export default async function TagihanSupplierPage() {
  const workspace = await getInitialErpWorkspace({ profile: "purchases" });

  return (
    <WorkspacePageProvider workspace={workspace}>
      <TagihanWorkspace initialWorkspace={workspace} />
    </WorkspacePageProvider>
  );
}
