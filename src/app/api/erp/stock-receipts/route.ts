import { z } from "zod";
import { isApiResponse, requireApiPermission, withDemoHeader } from "@/lib/auth/api";
import { createIdempotentDemoStockReceipt } from "@/lib/erp/demo-store";
import { createStockReceiptSchema } from "@/lib/erp/schemas";
import { stockReceiptCommandResultSchema } from "@/lib/erp/stock-receipt-command";
import { canonicalizeStockReceiptAmounts } from "@/lib/erp/stock-receipt-decimal";
import { stockReceiptErrorCodes } from "@/lib/erp/stock-receipt-errors";
import {
  logApiError,
  logApiInfo,
  logApiWarning,
} from "@/lib/observability/logger";
import { callActorServiceRpc } from "@/lib/supabase/service-rpc";

const idempotencyKeySchema = z.uuid();
const route = "/api/erp/stock-receipts";

interface StockReceiptRpcError {
  code?: string;
  message: string;
}

function executeStockReceiptRpc(
  payload: Parameters<typeof callActorServiceRpc>[1],
  actorUserId: string,
) {
  return callActorServiceRpc(
    "post_stock_receipt",
    payload,
    actorUserId,
  );
}

function classifyRpcError(
  error: StockReceiptRpcError,
  upstreamStatus?: number,
) {
  const code = error.code ?? "";
  const normalizedMessage = error.message.toLowerCase();

  if (code === "23505" || normalizedMessage.includes("idempotency key")) {
    return {
      status: 409,
      message: "Idempotency-Key sudah digunakan untuk penerimaan stok yang berbeda.",
      conflict: "idempotency",
      errorCode: stockReceiptErrorCodes.idempotencyConflict,
    } as const;
  }

  if (code === "55000") {
    return {
      status: 409,
      message: "Periode transaksi sudah dikunci. Gunakan periode terbuka.",
      conflict: "period_locked",
      errorCode: stockReceiptErrorCodes.periodLocked,
    } as const;
  }

  if (code === "42501") {
    return {
      status: 403,
      message: "Anda tidak memiliki izin untuk mencatat penerimaan stok ini.",
      conflict: null,
      errorCode: stockReceiptErrorCodes.forbidden,
    } as const;
  }

  if (["22003", "22023", "22P02", "23503", "23514"].includes(code)) {
    return {
      status: 422,
      message:
        code === "23503"
          ? "Produk atau gudang tidak valid untuk bisnis ini."
          : "Data penerimaan stok tidak valid.",
      conflict: null,
      errorCode: stockReceiptErrorCodes.invalid,
    } as const;
  }

  const unavailable =
    upstreamStatus === 0 ||
    (typeof upstreamStatus === "number" && upstreamStatus >= 500) ||
    code.startsWith("08") ||
    code.startsWith("PGRST") ||
    [
      "40001",
      "40P01",
      "53300",
      "55P03",
      "57014",
      "57P01",
      "57P02",
      "57P03",
    ].includes(code);

  return {
    status: unavailable ? 503 : 500,
    message: unavailable
      ? "Layanan stok sementara tidak tersedia. Coba konfirmasi ulang permintaan yang sama."
      : "Penerimaan stok gagal diproses. Coba konfirmasi ulang permintaan yang sama.",
    conflict: null,
    errorCode: unavailable
      ? stockReceiptErrorCodes.unavailable
      : stockReceiptErrorCodes.unexpected,
  } as const;
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const context = await requireApiPermission(request, "inventory:manage");
  if (isApiResponse(context)) return context;

  const payload = await request.json().catch(() => null);
  const parsed = createStockReceiptSchema.safeParse(payload);

  if (!parsed.success) {
    logApiWarning("erp.stock_receipt.failed", {
      businessId: context.businessId,
      userId: context.userId,
      route,
      status: "400",
      details: { reason: "invalid_payload" },
    });
    return withDemoHeader(json({ errors: parsed.error.flatten() }, 400), context);
  }

  const operationKey = idempotencyKeySchema.safeParse(
    request.headers.get("idempotency-key"),
  );

  if (!operationKey.success) {
    logApiWarning("erp.stock_receipt.failed", {
      businessId: context.businessId,
      userId: context.userId,
      route,
      status: "400",
      details: { reason: "invalid_idempotency_header" },
    });
    return withDemoHeader(
      json({ error: "Idempotency-Key header wajib berupa UUID yang valid." }, 400),
      context,
    );
  }

  if (context.demoMode) {
    try {
      const result = createIdempotentDemoStockReceipt(
        parsed.data,
        operationKey.data,
      );

      if (result.conflict) {
        logApiWarning("erp.stock_receipt.conflict", {
          businessId: context.businessId,
          userId: context.userId,
          route,
          status: "409",
          details: { conflict: "idempotency", runtime: "demo_fallback" },
        });
        return withDemoHeader(
          json(
            {
              error:
                "Idempotency-Key sudah digunakan untuk penerimaan stok yang berbeda.",
              code: stockReceiptErrorCodes.idempotencyConflict,
            },
            409,
          ),
          context,
        );
      }

      const status = result.created ? 201 : 200;
      logApiInfo(
        result.created
          ? "erp.stock_receipt.created"
          : "erp.stock_receipt.replayed",
        {
          businessId: context.businessId,
          userId: context.userId,
          route,
          status: String(status),
        },
      );
      return withDemoHeader(json({ workspace: result.workspace }, status), context);
    } catch (error) {
      logApiError("erp.stock_receipt.failed", error, {
        businessId: context.businessId,
        userId: context.userId,
        route,
        status: "422",
        details: { runtime: "demo_fallback" },
      });
      return withDemoHeader(
        json({ error: error instanceof Error ? error.message : "Stok masuk gagal dicatat." }, 422),
        context,
      );
    }
  }

  let rpcResult: Awaited<ReturnType<typeof callActorServiceRpc>>;

  try {
    rpcResult = await executeStockReceiptRpc(
      {
        ...parsed.data,
        businessId: context.businessId,
        operationKey: operationKey.data,
        actorName: context.userName ?? context.userEmail ?? context.userId,
      },
      context.userId,
    );
  } catch (error) {
    logApiError("erp.stock_receipt.failed", error, {
      businessId: context.businessId,
      userId: context.userId,
      route,
      status: "503",
      details: { reason: "rpc_transport_failure" },
    });
    return withDemoHeader(
      json(
        {
          error:
            "Layanan stok sementara tidak tersedia. Coba konfirmasi ulang permintaan yang sama.",
          code: stockReceiptErrorCodes.unavailable,
        },
        503,
      ),
      context,
    );
  }

  const { data, error, status: upstreamStatus } = rpcResult;

  if (error) {
    const classified = classifyRpcError(error, upstreamStatus);

    if (classified.conflict) {
      logApiWarning("erp.stock_receipt.conflict", {
        businessId: context.businessId,
        userId: context.userId,
        route,
        status: String(classified.status),
        details: { code: error.code, conflict: classified.conflict },
      });
    } else {
      logApiError("erp.stock_receipt.failed", error, {
        businessId: context.businessId,
        userId: context.userId,
        route,
        status: String(classified.status),
        details: { code: error.code },
      });
    }

    return withDemoHeader(
      json(
        { error: classified.message, code: classified.errorCode },
        classified.status,
      ),
      context,
    );
  }

  const commandResult = stockReceiptCommandResultSchema.safeParse(data);

  if (!commandResult.success) {
    logApiError(
      "erp.stock_receipt.failed",
      new Error("Stock receipt RPC returned an invalid response envelope."),
      {
        businessId: context.businessId,
        userId: context.userId,
        route,
        status: "502",
        details: { reason: "invalid_rpc_response" },
      },
    );
    return withDemoHeader(
      json({ error: "Respons command stok masuk tidak valid." }, 502),
      context,
    );
  }

  const movement = commandResult.data.movement;
  const canonicalAmounts = canonicalizeStockReceiptAmounts(
    parsed.data.quantity,
    parsed.data.unitCost,
  );
  const expectedMemo = parsed.data.memo ?? "Stok masuk manual";
  const matchesRequest =
    movement.businessId === context.businessId &&
    movement.itemId === parsed.data.itemId &&
    movement.warehouseId === parsed.data.warehouseId &&
    movement.date === parsed.data.date &&
    movement.quantity === canonicalAmounts.quantity.value &&
    movement.value === canonicalAmounts.value.value &&
    movement.memo === expectedMemo;

  if (!matchesRequest) {
    logApiError(
      "erp.stock_receipt.failed",
      new Error("Stock receipt RPC returned a movement outside the request scope."),
      {
        businessId: context.businessId,
        userId: context.userId,
        route,
        status: "502",
        details: { reason: "rpc_scope_mismatch" },
      },
    );
    return withDemoHeader(
      json({ error: "Respons command stok masuk tidak valid." }, 502),
      context,
    );
  }

  const status = commandResult.data.created ? 201 : 200;
  logApiInfo(
    commandResult.data.created
      ? "erp.stock_receipt.created"
      : "erp.stock_receipt.replayed",
    {
      businessId: context.businessId,
      userId: context.userId,
      route,
      status: String(status),
    },
  );

  return withDemoHeader(
    json(commandResult.data, status),
    context,
  );
}
