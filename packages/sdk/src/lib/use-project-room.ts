import { useQueryClient } from "@tanstack/react-query";
import { usePartySocket } from "partysocket/react";
import { useRef } from "react";

type InvalidationEvent = {
  type: "invalidate";
  entity: "page" | "block" | "repeatableItem" | "file" | "layout";
  action: "created" | "updated" | "deleted";
  entityId?: number;
  pageId?: number;
  parentId?: number;
};

const DEBOUNCE_MS = 300;

export function useProjectRoom(apiUrl: string, projectId: number | undefined) {
  const queryClient = useQueryClient();
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Accumulate entities to invalidate during the debounce window
  const pendingRef = useRef(new Set<InvalidationEvent["entity"]>());

  const host = apiUrl.replace(/^https?:\/\//, "");

  usePartySocket({
    host,
    party: "project-room",
    room: String(projectId ?? ""),
    prefix: "/parties",
    enabled: !!projectId,
    onMessage(event) {
      try {
        const data: InvalidationEvent = JSON.parse(event.data);
        if (data.type !== "invalidate") return;

        pendingRef.current.add(data.entity);

        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          const entities = pendingRef.current;
          pendingRef.current = new Set();

          for (const entity of entities) {
            switch (entity) {
              case "page":
                queryClient.invalidateQueries({ queryKey: ["pages"] });
                break;
              case "block":
              case "repeatableItem":
                queryClient.invalidateQueries({ queryKey: ["pages", "getByPath"] });
                queryClient.invalidateQueries({ queryKey: ["blocks"] });
                break;
              case "file":
                queryClient.invalidateQueries({ queryKey: ["files"] });
                break;
              case "layout":
                queryClient.invalidateQueries({ queryKey: ["layouts"] });
                queryClient.invalidateQueries({ queryKey: ["pages", "getByPath"] });
                break;
            }
          }
        }, DEBOUNCE_MS);
      } catch {
        // Ignore malformed messages
      }
    },
  });
}
