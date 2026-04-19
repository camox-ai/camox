import type { InvalidationMessage, QueryKey } from "@camox/api-contract/query-keys";

export function broadcastInvalidation(
  projectRoomNamespace: DurableObjectNamespace,
  projectId: number,
  targets: QueryKey[],
) {
  const id = projectRoomNamespace.idFromName(String(projectId));
  const stub = projectRoomNamespace.get(id);
  const message: InvalidationMessage = { type: "invalidate", targets };
  // Fire-and-forget — don't block the mutation response
  stub.fetch("http://do/broadcast", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
  });
}
