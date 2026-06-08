import { AppShell } from "@/components/app-shell-new";
import { JurnalWorkspace } from "@/components/jurnal-workspace-new";
import { getInitialErpWorkspace } from "@/lib/erp/workspace-loader";

export const dynamic = "force-dynamic";

export default async function CatatanJurnalPage() {
  const workspace = await getInitialErpWorkspace();

  return (
    <AppShell workspace={workspace}>
      <JurnalWorkspace initialWorkspace={workspace} />
    </AppShell>
  );
}
