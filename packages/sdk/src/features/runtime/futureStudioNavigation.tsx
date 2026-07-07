import * as React from "react";

import { NavigationProvider } from "../navigation/navigation";

const FUTURE_BASE_PATH = "/_future";

function normalizeFuturePathname(pathname: string): string {
  if (pathname === FUTURE_BASE_PATH) return "/";
  if (pathname.startsWith(`${FUTURE_BASE_PATH}/`)) {
    return pathname.slice(FUTURE_BASE_PATH.length) || "/";
  }
  return pathname || "/";
}

function toFuturePathname(pathname: string): string {
  if (pathname === "/") return `${FUTURE_BASE_PATH}/`;
  if (pathname.startsWith(`${FUTURE_BASE_PATH}/`)) return pathname;
  return `${FUTURE_BASE_PATH}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

function getFutureStudioLocation() {
  return {
    hash: window.location.hash,
    href: window.location.href,
    pathname: normalizeFuturePathname(window.location.pathname),
    search: window.location.search,
  };
}

function getFutureStudioTarget(to: string): URL | null {
  const url = new URL(to, window.location.href);
  if (url.origin !== window.location.origin) return null;

  const pathname = normalizeFuturePathname(url.pathname);
  url.pathname = toFuturePathname(pathname);
  return url;
}

export function FutureStudioNavigationProvider({
  children,
  href,
  pathname,
}: {
  children: React.ReactNode;
  href: string;
  pathname: string;
}) {
  const navigate = React.useCallback(async ({ replace, to }: { replace?: boolean; to: string }) => {
    const target = getFutureStudioTarget(to);
    if (!target) {
      window.location.assign(to);
      return;
    }

    if (replace) {
      window.history.replaceState(null, "", target.href);
    } else {
      window.history.pushState(null, "", target.href);
    }
    window.dispatchEvent(new Event("camox:navigation"));
  }, []);

  return (
    <NavigationProvider
      getLocation={getFutureStudioLocation}
      initialLocation={{
        hash: new URL(href).hash,
        href,
        pathname,
        search: new URL(href).search,
      }}
      navigate={navigate}
    >
      {children}
    </NavigationProvider>
  );
}
