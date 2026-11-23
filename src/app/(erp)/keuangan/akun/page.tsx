import { WorkspacePageProvider } from "@/components/workspace-page-provider";
import { AkunWorkspace } from "@/components/akun-workspace";
import { getInitialErpWorkspace } from "@/lib/erp/workspace-loader";

export const dynamic = "force-dynamic";

export default async function AkunPage() {
  const workspace = await getInitialErpWorkspace({ profile: "accounting" });

  return (
    <WorkspacePageProvider profile="accounting" workspace={workspace}>
      <AkunWorkspace initialWorkspace={workspace} />
    </WorkspacePageProvider>
  );
}
