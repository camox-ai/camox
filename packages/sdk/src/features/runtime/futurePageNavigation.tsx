import { hydrate, type QueryClient } from "@tanstack/react-query";
import * as React from "react";

import { NavigationProvider } from "../navigation/navigation";
import type { FuturePageRenderInput } from "./futureRuntime";

const FUTURE_BASE_PATH = "/_future";
const FUTURE_DATA_PATH = `${FUTURE_BASE_PATH}/_camox/data`;

interface FuturePageDataResponse {
  dehydratedState?: unknown;
  head?: unknown;
  pathname?: string;
}

function normalizePagePath(pathname: string): string {
  if (pathname === FUTURE_BASE_PATH) return "/";
  if (pathname.startsWith(`${FUTURE_BASE_PATH}/`)) {
    return pathname.slice(FUTURE_BASE_PATH.length) || "/";
  }
  return pathname || "/";
}

function toFuturePathname(pagePathname: string): string {
  if (pagePathname === "/") return `${FUTURE_BASE_PATH}/`;
  if (pagePathname.startsWith(`${FUTURE_BASE_PATH}/`)) return pagePathname;
  return `${FUTURE_BASE_PATH}${pagePathname.startsWith("/") ? pagePathname : `/${pagePathname}`}`;
}

function getFutureLocation() {
  return {
    hash: window.location.hash,
    href: window.location.href,
    pathname: normalizePagePath(window.location.pathname),
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

function getClientNavigationTarget(to: string): URL | null {
  const url = new URL(to, window.location.href);
  if (url.origin !== window.location.origin) return null;

  const pagePathname = normalizePagePath(url.pathname);
  if (isReservedPagePath(pagePathname)) return null;

  url.pathname = toFuturePathname(pagePathname);
  return url;
}

async function fetchFuturePageData(pagePathname: string): Promise<FuturePageDataResponse> {
  const dataUrl = new URL(FUTURE_DATA_PATH, window.location.origin);
  dataUrl.searchParams.set("path", pagePathname);

  const response = await fetch(dataUrl, {
    headers: { Accept: "application/json" },
    credentials: "same-origin",
  });
  if (!response.ok) throw new Error(`Future Page data request failed: ${response.status}`);

  return (await response.json()) as FuturePageDataResponse;
}

function updateHead(head: unknown) {
  if (!head || typeof head !== "object") return;

  const meta = (head as { meta?: Array<Record<string, string>> }).meta ?? [];
  const title = meta.find((entry) => entry.title)?.title;
  if (title) document.title = title;
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
  const navigate = React.useCallback(
    async ({ replace, to }: { replace?: boolean; to: string }) => {
      const target = getClientNavigationTarget(to);
      if (!target) {
        window.location.assign(to);
        return;
      }

      const pagePathname = normalizePagePath(target.pathname);
      try {
        const data = await fetchFuturePageData(pagePathname);
        if (data.dehydratedState) hydrate(queryClient, data.dehydratedState);
        updateHead(data.head);
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
    [queryClient],
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

      const target = getClientNavigationTarget(anchor.href);
      if (!target) return;

      event.preventDefault();
      void navigate({ to: target.href });
    };

    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [navigate]);

  React.useEffect(() => {
    const onPopState = () => {
      const pagePathname = normalizePagePath(window.location.pathname);
      void fetchFuturePageData(pagePathname)
        .then((data) => {
          if (data.dehydratedState) hydrate(queryClient, data.dehydratedState);
          updateHead(data.head);
          window.dispatchEvent(new Event("camox:navigation"));
        })
        .catch(() => window.location.reload());
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [queryClient]);

  return (
    <NavigationProvider
      getLocation={getFutureLocation}
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
