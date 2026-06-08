import {
  buildFinancialPdf,
  buildFinancialWorkbook,
} from "@/lib/exports/financial-export";
import { isApiResponse, requireApiPermission, withDemoHeader } from "@/lib/auth/api";
import { getDemoErpStore } from "@/lib/erp/demo-store";
import { loadSupabaseWorkspace } from "@/lib/erp/workspace-repository";
import type { ErpWorkspace } from "@/lib/erp/types";
import { createRequestSupabaseClient } from "@/lib/supabase/server";

function bodyFromBytes(bytes: Uint8Array): ArrayBuffer {
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);
  return body;
}

export async function GET(request: Request) {
  const context = await requireApiPermission(request, "reports:export");

  if (isApiResponse(context)) {
    return context;
  }

  const format = new URL(request.url).searchParams.get("format") ?? "xlsx";
  let workspace: ErpWorkspace;

  if (context.demoMode) {
    workspace = getDemoErpStore();
  } else {
    try {
      workspace = await loadSupabaseWorkspace(createRequestSupabaseClient(request), context);
    } catch (error) {
      return withDemoHeader(
        Response.json(
          { error: error instanceof Error ? error.message : "Workspace gagal dimuat untuk export." },
          { status: 500, headers: { "cache-control": "no-store" } },
        ),
        context,
      );
    }
  }

  if (format === "pdf") {
    const pdf = await buildFinancialPdf({
      business: workspace.business,
      taxProfile: workspace.taxProfile,
      entries: workspace.journals,
      period: workspace.period,
    });

    return withDemoHeader(
      new Response(bodyFromBytes(pdf), {
        headers: {
          "content-type": "application/pdf",
          "content-disposition": 'attachment; filename="laporan-keuangan-erp.pdf"',
          "cache-control": "no-store",
        },
      }),
      context,
    );
  }

  const workbook = await buildFinancialWorkbook({
    business: workspace.business,
    taxProfile: workspace.taxProfile,
    entries: workspace.journals,
    period: workspace.period,
  });

  return withDemoHeader(
    new Response(bodyFromBytes(workbook), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": 'attachment; filename="laporan-keuangan-erp.xlsx"',
        "cache-control": "no-store",
      },
    }),
    context,
  );
}
