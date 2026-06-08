import { AppShell } from "@/components/app-shell-new";
import { BPJSWorkspace } from "@/components/bpjs-workspace";
import { getInitialErpWorkspace } from "@/lib/erp/workspace-loader";

export const dynamic = "force-dynamic";

export default async function BPJSPage() {
  const workspace = await getInitialErpWorkspace();

  return (
    <AppShell workspace={workspace}>
      <BPJSWorkspace initialWorkspace={workspace} />
    </AppShell>
  );
}