import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceSupabaseClient: () => ({ rpc: rpcMock }),
}));

import { callActorServiceRpc } from "@/lib/supabase/service-rpc";

describe("actor-bound service RPC helper", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    rpcMock.mockResolvedValue({ data: null, error: null });
  });

  it("overwrites any caller-supplied actor UUID with the authenticated server actor", async () => {
    await callActorServiceRpc(
      "post_stock_receipt",
      { actorUserId: "client-spoof", businessId: "business-id" },
      "server-actor",
    );

    expect(rpcMock).toHaveBeenCalledWith("post_stock_receipt", {
      payload: {
        actorUserId: "server-actor",
        businessId: "business-id",
      },
    });
  });
});
