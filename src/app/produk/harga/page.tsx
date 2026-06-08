import { AppShell } from "@/components/app-shell-new";
import { HargaWorkspace } from "@/components/harga-workspace-new";
import { getInitialErpWorkspace } from "@/lib/erp/workspace-loader";

export const dynamic = "force-dynamic";

export default async function DaftarHargaPage() {
  const workspace = await getInitialErpWorkspace();

  return (
    <AppShell workspace={workspace}>
      <HargaWorkspace initialWorkspace={workspace} />
    </AppShell>
  );
}
