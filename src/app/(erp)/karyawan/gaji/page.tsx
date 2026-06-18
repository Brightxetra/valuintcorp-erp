import { WorkspacePageProvider } from "@/components/workspace-page-provider";
import { GajiWorkspace } from "@/components/gaji-workspace";
import { getInitialErpWorkspace } from "@/lib/erp/workspace-loader";

export const dynamic = "force-dynamic";

export default async function GajiPage() {
  const workspace = await getInitialErpWorkspace({ profile: "payroll" });

  return (
    <WorkspacePageProvider workspace={workspace}>
      <GajiWorkspace initialWorkspace={workspace} />
    </WorkspacePageProvider>
  );
}
