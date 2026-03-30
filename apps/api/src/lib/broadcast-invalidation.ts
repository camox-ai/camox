import type { InvalidationEvent } from "../durable-objects/project-room";

type BroadcastEvent = Omit<InvalidationEvent, "type">;

export function broadcastInvalidation(
  projectRoomNamespace: DurableObjectNamespace,
  projectId: number,
  event: BroadcastEvent,
) {
  const id = projectRoomNamespace.idFromName(String(projectId));
  const stub = projectRoomNamespace.get(id);
  // Fire-and-forget — don't block the mutation response
  stub.fetch("http://do/broadcast", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "invalidate", ...event }),
  });
}
