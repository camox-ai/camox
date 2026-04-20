import type { InvalidationMessage, QueryKey } from "@camox/api-contract/query-keys";

import type { ProjectRoom } from "../durable-objects/project-room";

type ProjectRoomStub = DurableObjectStub & Pick<ProjectRoom, "broadcastInvalidation">;

type BroadcastInvalidationOptions = {
  waitUntil: (promise: Promise<unknown>) => void;
  projectRoomNamespace: DurableObjectNamespace;
  projectId: number;
  targets: QueryKey[];
};

export function broadcastInvalidation({
  waitUntil,
  projectRoomNamespace,
  projectId,
  targets,
}: BroadcastInvalidationOptions) {
  const id = projectRoomNamespace.idFromName(String(projectId));
  const stub = projectRoomNamespace.get(id) as ProjectRoomStub;
  const message: InvalidationMessage = { type: "invalidate", targets };
  waitUntil(stub.broadcastInvalidation(message));
}
