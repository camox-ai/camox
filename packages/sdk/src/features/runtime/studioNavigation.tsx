import * as React from "react";

import { NavigationProvider } from "../navigation/navigation";

function normalizeRuntimeBasePath(basePath: string): string {
  if (!basePath || basePath === "/") return "";
  return basePath.startsWith("/")
    ? basePath.replace(/\/+$/, "")
    : `/${basePath.replace(/\/+$/, "")}`;
}

function normalizeRuntimePathname(pathname: string, runtimeBasePath: string): string {
  const basePath = normalizeRuntimeBasePath(runtimeBasePath);
  if (!basePath) return pathname || "/";
  if (pathname === basePath) return "/";
  if (pathname.startsWith(`${basePath}/`)) return pathname.slice(basePath.length) || "/";
  return pathname || "/";
}

function toRuntimePathname(pathname: string, runtimeBasePath: string): string {
  const basePath = normalizeRuntimeBasePath(runtimeBasePath);
  const normalizedPathname = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (!basePath) return normalizedPathname;
  if (normalizedPathname === "/") return `${basePath}/`;
  if (normalizedPathname.startsWith(`${basePath}/`)) return normalizedPathname;
  return `${basePath}${normalizedPathname}`;
}

function getStudioLocation(runtimeBasePath: string) {
  return {
    hash: window.location.hash,
    href: window.location.href,
    pathname: normalizeRuntimePathname(window.location.pathname, runtimeBasePath),
    search: window.location.search,
  };
}

function getStudioTarget(to: string, runtimeBasePath: string): URL | null {
  const url = new URL(to, window.location.href);
  if (url.origin !== window.location.origin) return null;

  const pathname = normalizeRuntimePathname(url.pathname, runtimeBasePath);
  url.pathname = toRuntimePathname(pathname, runtimeBasePath);
  return url;
}

export function StudioNavigationProvider({
  children,
  href,
  pathname,
  runtimeBasePath,
}: {
  children: React.ReactNode;
  href: string;
  pathname: string;
  runtimeBasePath: string;
}) {
  const navigate = React.useCallback(
    async ({ replace, to }: { replace?: boolean; to: string }) => {
      const target = getStudioTarget(to, runtimeBasePath);
      if (!target) {
        window.location.assign(to);
        return;
      }

      const currentPathname = normalizeRuntimePathname(window.location.pathname, runtimeBasePath);
      const targetPathname = normalizeRuntimePathname(target.pathname, runtimeBasePath);
      if (targetPathname !== currentPathname) {
        window.location.assign(target.href);
        return;
      }

      if (replace) {
        window.history.replaceState(null, "", target.href);
      } else {
        window.history.pushState(null, "", target.href);
      }
      window.dispatchEvent(new Event("camox:navigation"));
    },
    [runtimeBasePath],
  );

  const getLocation = React.useCallback(
    () => getStudioLocation(runtimeBasePath),
    [runtimeBasePath],
  );

  return (
    <NavigationProvider
      getLocation={getLocation}
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
