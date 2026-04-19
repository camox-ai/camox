import type { InvalidationMessage, QueryKey } from "@camox/api-contract/query-keys";
import { useQueryClient } from "@tanstack/react-query";
import { usePartySocket } from "partysocket/react";
import { useRef } from "react";

import { getAuthCookieHeader } from "./auth";

const DEBOUNCE_MS = 300;

export function useEnvironmentRoom(apiUrl: string, environmentId: number | undefined) {
  const queryClient = useQueryClient();
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pendingRef = useRef<QueryKey[]>([]);

  const host = apiUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "");

  usePartySocket({
    host,
    party: "environment-room",
    room: String(environmentId ?? ""),
    prefix: "parties",
    query: () => ({ _authCookie: getAuthCookieHeader() }),
    enabled: !!environmentId,
    onOpen() {
      if (process.env.NODE_ENV !== "production") {
        console.debug("[useEnvironmentRoom] WebSocket connected");
      }
    },
    onClose(event) {
      console.warn(
        `[useEnvironmentRoom] WebSocket closed (code=${event.code}, reason=${event.reason || "none"})`,
      );
    },
    onError(event) {
      console.error("[useEnvironmentRoom] WebSocket error:", event);
    },
    onMessage(event) {
      let data: InvalidationMessage;
      try {
        data = JSON.parse(event.data);
      } catch {
        // Ignore non-JSON messages (e.g. partysocket pings)
        return;
      }

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
    },
  });
}
