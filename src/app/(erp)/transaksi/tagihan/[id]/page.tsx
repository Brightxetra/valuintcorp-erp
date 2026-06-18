import { WorkspacePageProvider } from "@/components/workspace-page-provider";
import { DocumentDetailWorkspace } from "@/components/document-detail-workspace";
import { getInitialErpWorkspace } from "@/lib/erp/workspace-loader";

export const dynamic = "force-dynamic";

export default async function TagihanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await getInitialErpWorkspace({
    documentId: id,
    documentType: "purchase_bill",
    profile: "document-detail",
  });

  return (
    <WorkspacePageProvider workspace={workspace}>
      <DocumentDetailWorkspace
        initialWorkspace={workspace}
        documentType="purchase_bill"
        documentId={id}
      />
    </WorkspacePageProvider>
  );
}
