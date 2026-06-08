import { isApiResponse, requireApiPermission, withDemoHeader } from "@/lib/auth/api";
import { buildRawImportPreview } from "@/lib/erp/import-preview";
import { csvImportSchema } from "@/lib/erp/schemas";

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const context = await requireApiPermission(request, "accounting:write");

  if (isApiResponse(context)) return context;

  const payload = await request.json().catch(() => null);
  const parsed = csvImportSchema.safeParse(payload);

  if (!parsed.success) {
    return withDemoHeader(json({ errors: parsed.error.flatten() }, 400), context);
  }

  return withDemoHeader(
    json({
      preview: buildRawImportPreview({
        ...parsed.data,
        businessId: context.businessId,
      }),
    }),
    context,
  );
}
