// Mirror of packages/sdk/src/core/lib/imageTransform.ts — kept duplicated
// because the API does not depend on the SDK package. Keep these two in sync.

const DEFAULT_QUALITY = 85;
const DEFAULT_WIDTH = 1280;

function isNonProxiedHostname(hostname: string): boolean {
  if (hostname === "localhost") return true;
  if (hostname === "127.0.0.1") return true;
  if (hostname === "0.0.0.0") return true;
  if (hostname === "::1") return true;
  if (hostname.endsWith(".local")) return true;
  if (hostname.endsWith(".localhost")) return true;
  return false;
}

export function transformImageUrl(
  url: string,
  options: {
    width?: number;
    height?: number;
    quality?: number;
    mimeType?: string;
    format?: string;
  } = {},
): string {
  if (!url) return url;
  if (options.mimeType === "image/svg+xml") return url;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (isNonProxiedHostname(parsed.hostname)) return url;
  if (parsed.pathname.startsWith("/cdn-cgi/image/")) return url;
  if (!parsed.pathname.startsWith("/files/serve/")) return url;

  const parts = [
    `format=${options.format ?? "auto"}`,
    `quality=${options.quality ?? DEFAULT_QUALITY}`,
    `fit=scale-down`,
  ];
  parts.push(`width=${options.width ?? DEFAULT_WIDTH}`);
  if (options.height != null) parts.push(`height=${options.height}`);

  return `${parsed.origin}/cdn-cgi/image/${parts.join(",")}${parsed.pathname}${parsed.search}`;
}
