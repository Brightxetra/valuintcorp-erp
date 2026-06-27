import { KatalogProdukWorkspace } from "@/components/katalog-produk-workspace";
import { WorkspacePageProvider } from "@/components/workspace-page-provider";
import { getInitialErpWorkspace } from "@/lib/erp/workspace-loader";

export const dynamic = "force-dynamic";

export default async function KatalogProdukPage() {
  const workspace = await getInitialErpWorkspace({ profile: "inventory" });

  return (
    <WorkspacePageProvider workspace={workspace}>
      <KatalogProdukWorkspace initialWorkspace={workspace} />
    </WorkspacePageProvider>
  );
}
