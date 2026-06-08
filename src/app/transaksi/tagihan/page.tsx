import { AppShell } from "@/components/app-shell-new";
import { TagihanWorkspace } from "@/components/tagihan-workspace-new";
import { getInitialErpWorkspace } from "@/lib/erp/workspace-loader";

export const dynamic = "force-dynamic";

export default async function TagihanSupplierPage() {
  const workspace = await getInitialErpWorkspace();

  return (
    <AppShell workspace={workspace}>
      <TagihanWorkspace initialWorkspace={workspace} />
    </AppShell>
  );
}
