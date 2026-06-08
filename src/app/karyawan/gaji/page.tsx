import { AppShell } from "@/components/app-shell-new";
import { GajiWorkspace } from "@/components/gaji-workspace";
import { getInitialErpWorkspace } from "@/lib/erp/workspace-loader";

export const dynamic = "force-dynamic";

export default async function GajiPage() {
  const workspace = await getInitialErpWorkspace();

  return (
    <AppShell workspace={workspace}>
      <GajiWorkspace initialWorkspace={workspace} />
    </AppShell>
  );
}