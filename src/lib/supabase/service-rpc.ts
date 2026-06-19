import { createServiceSupabaseClient } from "@/lib/supabase/service";

type ActorPayload = Record<string, unknown>;

export async function callActorServiceRpc(
  functionName: string,
  payload: ActorPayload,
  actorUserId: string,
) {
  const service = createServiceSupabaseClient();

  return service.rpc(functionName, {
    payload: {
      ...payload,
      actorUserId,
    },
  });
}
