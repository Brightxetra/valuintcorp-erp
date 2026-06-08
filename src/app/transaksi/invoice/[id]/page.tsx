import { AppShell } from "@/components/app-shell-new";
import { DocumentDetailWorkspace } from "@/components/document-detail-workspace";
import { getInitialErpWorkspace } from "@/lib/erp/workspace-loader";

export const dynamic = "force-dynamic";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, workspace] = await Promise.all([params, getInitialErpWorkspace()]);

  return (
    <AppShell workspace={workspace}>
      <DocumentDetailWorkspace
        initialWorkspace={workspace}
        documentType="sales_invoice"
        documentId={id}
      />
    </AppShell>
  );
}
