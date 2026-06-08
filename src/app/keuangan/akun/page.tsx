import { AppShell } from "@/components/app-shell-new";
import { AkunWorkspace } from "@/components/akun-workspace";
import { getInitialErpWorkspace } from "@/lib/erp/workspace-loader";

export const dynamic = "force-dynamic";

export default async function AkunPage() {
  const workspace = await getInitialErpWorkspace();

  return (
    <AppShell workspace={workspace}>
      <AkunWorkspace initialWorkspace={workspace} />
    </AppShell>
  );
}