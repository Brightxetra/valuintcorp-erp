import { AppShell } from "@/components/app-shell-new";
import { LaporanWorkspace } from "@/components/laporan-workspace";
import { getInitialErpWorkspace } from "@/lib/erp/workspace-loader";

export const dynamic = "force-dynamic";

export default async function LaporanPage() {
  const workspace = await getInitialErpWorkspace();

  return (
    <AppShell workspace={workspace}>
      <LaporanWorkspace initialWorkspace={workspace} />
    </AppShell>
  );
}