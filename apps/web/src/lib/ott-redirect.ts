import { authClient } from "./auth-client";

function isSafeRedirect(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * If `?redirect=<url>` is in the current URL, generates a one-time token
 * and hard-redirects to that URL with `?ott=<token>` appended.
 * Returns `true` if a redirect was initiated.
 */
export async function handleOttRedirect(): Promise<boolean> {
  const params = new URLSearchParams(window.location.search);
  const redirect = params.get("redirect");

  if (!redirect || !isSafeRedirect(redirect)) {
    return false;
  }

  const ottResult = await (authClient as any).oneTimeToken.generate();
  const url = new URL(redirect);
  if (ottResult?.data?.token) {
    url.searchParams.set("ott", ottResult.data.token);
  }
  window.location.href = url.toString();
  return true;
}
