import type { BetterAuthClientPlugin, ClientStore } from "better-auth";

/**
 * Cross-domain client plugin for better-auth.
 *
 * Stores session cookies in localStorage and sends them via a custom
 * `Better-Auth-Cookie` header, since browsers won't send real cookies across
 * different origins. Also mirrors cookie data to a same-site cookie so the
 * SSR server can read it and forward it to the API.
 *
 * Adapted from `packages/sdk/src/lib/auth.ts`.
 */

/* ----- Cookie helpers ---------------------------------------------------- */

interface CookieAttributes {
  value: string;
  expires?: Date;
  "max-age"?: number;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
}

interface StoredCookie {
  value: string;
  expires: string | null;
}

function parseSetCookieHeader(header: string): Map<string, CookieAttributes> {
  const cookieMap = new Map<string, CookieAttributes>();
  const cookies = header.split(", ");
  cookies.forEach((cookie) => {
    const [nameValue, ...attributes] = cookie.split("; ");
    const [name, value] = nameValue.split("=");
    const cookieObj: CookieAttributes = { value };
    attributes.forEach((attr) => {
      const [attrName, attrValue] = attr.split("=");
      cookieObj[attrName.toLowerCase() as "value"] = attrValue;
    });
    cookieMap.set(name, cookieObj);
  });
  return cookieMap;
}

function getSetCookie(header: string, prevCookie?: string) {
  const parsed = parseSetCookieHeader(header);
  let toSetCookie: Record<string, StoredCookie> = {};
  parsed.forEach((cookie, key) => {
    const expiresAt = cookie["expires"];
    const maxAge = cookie["max-age"];
    let expires: Date | null = null;
    if (expiresAt) {
      expires = new Date(String(expiresAt));
    } else if (maxAge) {
      expires = new Date(Date.now() + Number(maxAge) * 1000);
    }
    toSetCookie[key] = {
      value: cookie["value"],
      expires: expires ? expires.toISOString() : null,
    };
  });
  if (prevCookie) {
    try {
      const prevCookieParsed = JSON.parse(prevCookie);
      toSetCookie = { ...prevCookieParsed, ...toSetCookie };
    } catch {
      // noop
    }
  }
  return JSON.stringify(toSetCookie);
}

/**
 * Parse the JSON cookie blob from storage into a `; key=value` string
 * suitable for the `Better-Auth-Cookie` request header.
 */
export function parseCookieString(cookie: string) {
  let parsed = {} as Record<string, StoredCookie>;
  try {
    parsed = JSON.parse(cookie) as Record<string, StoredCookie>;
  } catch {
    // noop
  }
  return Object.entries(parsed).reduce((acc, [key, value]) => {
    if (value.expires && new Date(value.expires) < new Date()) return acc;
    return `${acc}; ${key}=${value.value}`;
  }, "");
}

/* ----- SSR cookie mirror ------------------------------------------------- */

/** Name of the same-site cookie that mirrors the cross-domain auth data. */
export const SSR_COOKIE_NAME = "__ba_cross";

function syncSsrCookie(cookieJson: string) {
  if (typeof document === "undefined") return;
  const maxAge = 60 * 60 * 24 * 400; // ~13 months
  document.cookie = `${SSR_COOKIE_NAME}=${encodeURIComponent(cookieJson)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

function clearSsrCookie() {
  if (typeof document === "undefined") return;
  document.cookie = `${SSR_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
}

/* ----- Plugin ------------------------------------------------------------ */

export function crossDomainClient(): BetterAuthClientPlugin {
  let store: ClientStore | null = null;
  const cookieName = "better-auth_cookie";
  const localCacheName = "better-auth_session_data";
  const storage = typeof window !== "undefined" ? localStorage : undefined;

  return {
    id: "cross-domain",
    getActions(_: any, $store: ClientStore) {
      store = $store;
      return {
        getCookie: () => parseCookieString(storage?.getItem(cookieName) || "{}"),
        updateSession: () => $store.notify("$sessionSignal"),
      };
    },
    fetchPlugins: [
      {
        id: "cross-domain",
        name: "Cross Domain",
        hooks: {
          async onSuccess(context: any) {
            if (!storage) return;

            const setCookie = context.response.headers.get("set-better-auth-cookie");
            if (setCookie) {
              const prevCookie = storage.getItem(cookieName);
              const toSetCookie = getSetCookie(setCookie || "", prevCookie ?? undefined);
              storage.setItem(cookieName, toSetCookie);
              syncSsrCookie(toSetCookie);

              if (setCookie.includes(".session_token=")) {
                const parsed = parseSetCookieHeader(setCookie);
                let prevParsed: Record<string, StoredCookie> = {};
                try {
                  prevParsed = JSON.parse(prevCookie || "{}");
                } catch {
                  // noop
                }
                const tokenKey = [...parsed.keys()].find((k) => k.includes("session_token"));
                if (tokenKey && prevParsed[tokenKey]?.value !== parsed.get(tokenKey)?.value) {
                  store?.notify("$sessionSignal");
                }
              }
            }

            if (context.request.url.toString().includes("/get-session")) {
              const data = context.data;
              storage.setItem(localCacheName, JSON.stringify(data));
              if (data === null) {
                storage.setItem(cookieName, "{}");
                clearSsrCookie();
              }
            }
          },
        },
        async init(url: string, options: any) {
          if (!storage) return { url, options };

          options = options || {};
          const storedCookie = storage.getItem(cookieName);
          const cookie = parseCookieString(storedCookie || "{}");
          options.credentials = "omit";
          options.headers = {
            ...options.headers,
            "Better-Auth-Cookie": cookie,
          };

          if (url.includes("/sign-out")) {
            storage.setItem(cookieName, "{}");
            store?.atoms.session?.set({
              data: null,
              error: null,
              isPending: false,
            });
            storage.setItem(localCacheName, "{}");
            clearSsrCookie();
          }

          return { url, options };
        },
      },
    ],
  };
}
