import { AppShell } from "@/components/app-shell-new";
import { StokWorkspace } from "@/components/stok-workspace-new";
import { getInitialErpWorkspace } from "@/lib/erp/workspace-loader";

export const dynamic = "force-dynamic";

export default async function StokPersediaanPage() {
  const workspace = await getInitialErpWorkspace();

  return (
    <AppShell workspace={workspace}>
      <StokWorkspace initialWorkspace={workspace} />
    </AppShell>
  );
}
