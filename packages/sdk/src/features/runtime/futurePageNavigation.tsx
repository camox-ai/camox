import { hydrate, type QueryClient } from "@tanstack/react-query";
import { createHead, renderDOMHead } from "@unhead/react/client";
import * as React from "react";
import type { ActiveHeadEntry, UseHeadInput } from "unhead/types";

import { NavigationProvider } from "../navigation/navigation";
import {
  createFuturePageHeadInput,
  type FutureLayoutIdentity,
  type FuturePageRenderInput,
} from "./futureRuntime";

interface FuturePageDataResponse {
  dehydratedState?: unknown;
  head?: unknown;
  layoutIdentity?: FutureLayoutIdentity | null;
  pathname?: string;
}

function normalizeRuntimeBasePath(basePath: string): string {
  if (!basePath || basePath === "/") return "";
  return basePath.startsWith("/")
    ? basePath.replace(/\/+$/, "")
    : `/${basePath.replace(/\/+$/, "")}`;
}

function normalizePagePath(pathname: string, runtimeBasePath: string): string {
  const basePath = normalizeRuntimeBasePath(runtimeBasePath);
  if (!basePath) return pathname || "/";
  if (pathname === basePath) return "/";
  if (pathname.startsWith(`${basePath}/`)) return pathname.slice(basePath.length) || "/";
  return pathname || "/";
}

function toFuturePathname(pagePathname: string, runtimeBasePath: string): string {
  const basePath = normalizeRuntimeBasePath(runtimeBasePath);
  const normalizedPathname = pagePathname.startsWith("/") ? pagePathname : `/${pagePathname}`;
  if (!basePath) return normalizedPathname;
  if (normalizedPathname === "/") return `${basePath}/`;
  if (normalizedPathname.startsWith(`${basePath}/`)) return normalizedPathname;
  return `${basePath}${normalizedPathname}`;
}

function getFutureLocation(runtimeBasePath: string) {
  return {
    hash: window.location.hash,
    href: window.location.href,
    pathname: normalizePagePath(window.location.pathname, runtimeBasePath),
    search: window.location.search,
  };
}

function isReservedPagePath(pathname: string): boolean {
  return (
    pathname.startsWith("/_camox/") ||
    pathname === "/_camox" ||
    pathname === "/camox" ||
    pathname.startsWith("/camox/") ||
    pathname === "/og" ||
    pathname === "/sitemap.xml"
  );
}

function getClientNavigationTarget(to: string, runtimeBasePath: string): URL | null {
  const url = new URL(to, window.location.href);
  if (url.origin !== window.location.origin) return null;

  const pagePathname = normalizePagePath(url.pathname, runtimeBasePath);
  if (isReservedPagePath(pagePathname)) return null;

  url.pathname = toFuturePathname(pagePathname, runtimeBasePath);
  return url;
}

async function fetchFuturePageData(
  pagePathname: string,
  runtimeBasePath: string,
): Promise<FuturePageDataResponse> {
  const dataUrl = new URL(
    toFuturePathname("/_camox/data", runtimeBasePath),
    window.location.origin,
  );
  dataUrl.searchParams.set("path", pagePathname);

  const response = await fetch(dataUrl, {
    headers: { Accept: "application/json" },
    credentials: "same-origin",
  });
  if (!response.ok) throw new Error(`Future Page data request failed: ${response.status}`);

  return (await response.json()) as FuturePageDataResponse;
}

interface FutureHeadManager {
  entry?: ActiveHeadEntry<UseHeadInput>;
  head: ReturnType<typeof createHead>;
  removedServerPageHead: boolean;
}

function isPageHead(
  head: unknown,
): head is { meta?: Array<Record<string, string>>; links?: Array<Record<string, string>> } {
  return !!head && typeof head === "object";
}

function updateHead(head: unknown, manager: FutureHeadManager) {
  if (!isPageHead(head)) return;

  if (!manager.removedServerPageHead) {
    document.querySelectorAll("[data-camox-page-head]").forEach((element) => element.remove());
    manager.removedServerPageHead = true;
  }

  manager.entry?.dispose();
  manager.entry = manager.head.push(createFuturePageHeadInput(head));
  renderDOMHead(manager.head);
}

function hasSameLayoutIdentity(
  current: FutureLayoutIdentity | null | undefined,
  next: FutureLayoutIdentity | null | undefined,
) {
  return (
    !!current &&
    !!next &&
    current.id === next.id &&
    current.layoutId === next.layoutId &&
    current.version === next.version
  );
}

function isLayoutBlockQuery(query: unknown, layoutBlockIds: Set<number>) {
  if (!query || typeof query !== "object") return false;
  const queryKey = (query as { queryKey?: unknown }).queryKey;
  return (
    Array.isArray(queryKey) &&
    queryKey[0] === "camox" &&
    queryKey[1] === "blocks" &&
    queryKey[2] === "get" &&
    typeof queryKey[3] === "number" &&
    layoutBlockIds.has(queryKey[3])
  );
}

function preserveStableLayoutBlockCaches(
  dehydratedState: unknown,
  currentLayout: FutureLayoutIdentity | null | undefined,
  nextLayout: FutureLayoutIdentity | null | undefined,
) {
  if (!hasSameLayoutIdentity(currentLayout, nextLayout)) return dehydratedState;
  if (!dehydratedState || typeof dehydratedState !== "object") return dehydratedState;
  if (!Array.isArray((dehydratedState as { queries?: unknown }).queries)) return dehydratedState;

  const layoutBlockIds = new Set(currentLayout?.blockIds ?? []);
  return {
    ...dehydratedState,
    queries: (dehydratedState as { queries: unknown[] }).queries.filter(
      (query) => !isLayoutBlockQuery(query, layoutBlockIds),
    ),
  };
}

export function FuturePageNavigationProvider({
  children,
  initialInput,
  queryClient,
}: {
  children: React.ReactNode;
  initialInput: FuturePageRenderInput;
  queryClient: QueryClient;
}) {
  const headManagerRef = React.useRef<FutureHeadManager | null>(null);
  if (!headManagerRef.current) {
    headManagerRef.current = {
      head: createHead(),
      removedServerPageHead: false,
    };
  }

  const headManager = headManagerRef.current;
  const currentLayoutIdentityRef = React.useRef<FutureLayoutIdentity | null>(
    initialInput.layoutIdentity,
  );

  const navigate = React.useCallback(
    async ({ replace, to }: { replace?: boolean; to: string }) => {
      const target = getClientNavigationTarget(to, initialInput.runtimeBasePath);
      if (!target) {
        window.location.assign(to);
        return;
      }

      const pagePathname = normalizePagePath(target.pathname, initialInput.runtimeBasePath);
      try {
        const data = await fetchFuturePageData(pagePathname, initialInput.runtimeBasePath);
        if (data.dehydratedState) {
          hydrate(
            queryClient,
            preserveStableLayoutBlockCaches(
              data.dehydratedState,
              currentLayoutIdentityRef.current,
              data.layoutIdentity,
            ),
          );
        }
        currentLayoutIdentityRef.current = data.layoutIdentity ?? null;
        updateHead(data.head, headManager);
      } catch {
        window.location.assign(target.href);
        return;
      }

      if (replace) {
        window.history.replaceState(null, "", target.href);
      } else {
        window.history.pushState(null, "", target.href);
        window.scrollTo({ top: 0 });
      }
      window.dispatchEvent(new Event("camox:navigation"));
    },
    [headManager, initialInput.runtimeBasePath, queryClient],
  );

  React.useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) return;

      const anchor = (event.target as Element | null)?.closest("a");
      if (!anchor) return;
      if (anchor.hasAttribute("download")) return;
      if (anchor.target && anchor.target !== "_self") return;

      const target = getClientNavigationTarget(anchor.href, initialInput.runtimeBasePath);
      if (!target) return;

      event.preventDefault();
      void navigate({ to: target.href });
    };

    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [navigate]);

  React.useEffect(() => {
    const onPopState = () => {
      const pagePathname = normalizePagePath(
        window.location.pathname,
        initialInput.runtimeBasePath,
      );
      void fetchFuturePageData(pagePathname, initialInput.runtimeBasePath)
        .then((data) => {
          if (data.dehydratedState) {
            hydrate(
              queryClient,
              preserveStableLayoutBlockCaches(
                data.dehydratedState,
                currentLayoutIdentityRef.current,
                data.layoutIdentity,
              ),
            );
          }
          currentLayoutIdentityRef.current = data.layoutIdentity ?? null;
          updateHead(data.head, headManager);
          window.dispatchEvent(new Event("camox:navigation"));
        })
        .catch(() => window.location.reload());
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [headManager, initialInput.runtimeBasePath, queryClient]);

  const getLocation = React.useCallback(
    () => getFutureLocation(initialInput.runtimeBasePath),
    [initialInput.runtimeBasePath],
  );

  return (
    <NavigationProvider
      getLocation={getLocation}
      initialLocation={{
        hash: new URL(initialInput.href).hash,
        href: initialInput.href,
        pathname: initialInput.pathname,
        search: new URL(initialInput.href).search,
      }}
      navigate={navigate}
    >
      {children}
    </NavigationProvider>
  );
}
