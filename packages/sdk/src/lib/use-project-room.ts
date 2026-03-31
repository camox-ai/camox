import { useQueryClient } from "@tanstack/react-query";
import { usePartySocket } from "partysocket/react";
import { useRef } from "react";

import { getOrpc } from "./api-client";
import { blockQueries, fileQueries, pageQueries } from "./queries";

type InvalidationEvent = {
  type: "invalidate";
  entity: "page" | "block" | "repeatableItem" | "file" | "layout";
  action: "created" | "updated" | "deleted";
  entityId?: number;
  pageId?: number;
  pagePath?: string;
  parentId?: number;
};

const DEBOUNCE_MS = 300;

export function useProjectRoom(apiUrl: string, projectId: number | undefined) {
  const queryClient = useQueryClient();
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pendingRef = useRef<InvalidationEvent[]>([]);

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

        pendingRef.current.push(data);

        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          const events = pendingRef.current;
          pendingRef.current = [];

          for (const event of events) {
            switch (event.entity) {
              case "page":
                queryClient.invalidateQueries({ queryKey: pageQueries.list().queryKey });
                if (event.entityId) {
                  queryClient.invalidateQueries({
                    queryKey: pageQueries.getById(event.entityId).queryKey,
                  });
                }
                break;
              case "block":
              case "repeatableItem":
                if (event.pagePath) {
                  queryClient.invalidateQueries({
                    queryKey: pageQueries.getByPath(event.pagePath).queryKey,
                  });
                } else {
                  // Fallback: invalidate all getByPath queries (e.g. from AI job scheduler)
                  queryClient.invalidateQueries({ queryKey: getOrpc().pages.getByPath.key() });
                }
                if (event.pageId) {
                  queryClient.invalidateQueries({
                    queryKey: blockQueries.getPageMarkdown(event.pageId).queryKey,
                  });
                }
                queryClient.invalidateQueries({ queryKey: blockQueries.getUsageCounts().queryKey });
                break;
              case "file":
                queryClient.invalidateQueries({ queryKey: fileQueries.list().queryKey });
                if (event.entityId) {
                  queryClient.invalidateQueries({
                    queryKey: fileQueries.get(event.entityId).queryKey,
                  });
                }
                break;
              case "layout":
                queryClient.invalidateQueries({ queryKey: getOrpc().layouts.key() });
                queryClient.invalidateQueries({ queryKey: getOrpc().pages.getByPath.key() });
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
