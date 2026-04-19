import type { InvalidationMessage, QueryKey } from "@camox/api-contract/query-keys";

export function broadcastInvalidation(
  environmentRoomNamespace: DurableObjectNamespace,
  environmentId: number,
  targets: QueryKey[],
) {
  const id = environmentRoomNamespace.idFromName(String(environmentId));
  const stub = environmentRoomNamespace.get(id);
  const message: InvalidationMessage = { type: "invalidate", targets };
  // Fire-and-forget — don't block the mutation response
  stub.fetch("http://do/broadcast", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
  });
}
