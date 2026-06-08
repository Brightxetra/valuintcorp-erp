import { AppShell } from "@/components/app-shell-new";
import { KaryawanWorkspace } from "@/components/karyawan-workspace";
import { getInitialErpWorkspace } from "@/lib/erp/workspace-loader";

export const dynamic = "force-dynamic";

export default async function KaryawanPage() {
  const workspace = await getInitialErpWorkspace();

  return (
    <AppShell workspace={workspace}>
      <KaryawanWorkspace initialWorkspace={workspace} />
    </AppShell>
  );
}