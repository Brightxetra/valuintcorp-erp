import { WorkspacePageProvider } from "@/components/workspace-page-provider";
import { BPJSWorkspace } from "@/components/bpjs-workspace";
import { getInitialErpWorkspace } from "@/lib/erp/workspace-loader";

export const dynamic = "force-dynamic";

export default async function BPJSPage() {
  const workspace = await getInitialErpWorkspace({ profile: "payroll" });

  return (
    <WorkspacePageProvider workspace={workspace}>
      <BPJSWorkspace initialWorkspace={workspace} />
    </WorkspacePageProvider>
  );
}
