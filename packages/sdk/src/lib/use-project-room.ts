import type { InvalidationMessage, QueryKey } from "@camox/api/query-keys";
import { useQueryClient } from "@tanstack/react-query";
import { usePartySocket } from "partysocket/react";
import { useRef } from "react";

const DEBOUNCE_MS = 300;

export function useProjectRoom(apiUrl: string, projectId: number | undefined) {
  const queryClient = useQueryClient();
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pendingRef = useRef<QueryKey[]>([]);

  const host = apiUrl.replace(/^https?:\/\//, "");

  usePartySocket({
    host,
    party: "project-room",
    room: String(projectId ?? ""),
    prefix: "/parties",
    enabled: !!projectId,
    onMessage(event) {
      try {
        const data: InvalidationMessage = JSON.parse(event.data);
        if (data.type !== "invalidate") return;

        pendingRef.current.push(...data.targets);

        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          const targets = pendingRef.current;
          pendingRef.current = [];

          for (const queryKey of targets) {
            queryClient.invalidateQueries({ queryKey });
          }
        }, DEBOUNCE_MS);
      } catch {
        // Ignore malformed messages
      }
    },
  });
}
