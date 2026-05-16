// Rewrites R2-served image URLs through Cloudflare Image Transformations
// (https://developers.cloudflare.com/images/transform-images/). The transform
// path is intercepted by Cloudflare at the zone edge, so the source URL must
// be on a Cloudflare-proxied hostname. URLs on localhost/loopback/.local are
// returned unchanged so local dev still works against a non-proxied API.

const DEFAULT_QUALITY = 85;
const DEFAULT_SRCSET_WIDTHS = [320, 640, 960, 1280, 1920];
const DEFAULT_SRC_WIDTH = 1280;
const DEFAULT_SIZES = "100vw";
// Below this raw size, re-encoding through Cloudflare typically *increases* the
// byte count (encoder overhead dominates), so we serve the original untouched.
const MIN_OPTIMIZE_SIZE = 50 * 1024;

function isNonProxiedHostname(hostname: string): boolean {
  if (hostname === "localhost") return true;
  if (hostname === "127.0.0.1") return true;
  if (hostname === "0.0.0.0") return true;
  if (hostname === "::1") return true;
  if (hostname.endsWith(".local")) return true;
  if (hostname.endsWith(".localhost")) return true;
  return false;
}

function parseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

// Only files served by the Camox API (R2-backed) are eligible — external
// placeholders (placehold.co, etc.) and other off-origin images pass through
// unchanged because Cloudflare can't transform what isn't on the same zone.
function isTransformableUrl(parsed: URL): boolean {
  if (isNonProxiedHostname(parsed.hostname)) return false;
  if (parsed.pathname.startsWith("/cdn-cgi/image/")) return false;
  if (!parsed.pathname.startsWith("/files/serve/")) return false;
  return true;
}

// Cloudflare Image Transformations does not support SVG (or PDF) inputs —
// they're served as-is from origin. Wrapping them through /cdn-cgi/image/ is
// at best a no-op, at worst an error, so bail out before constructing the URL.
function isNonTransformableMimeType(mimeType: string | undefined): boolean {
  if (!mimeType) return false;
  return mimeType === "image/svg+xml";
}

// Only raster images (JPEG/PNG/WebP/AVIF/GIF/etc.) carry visual content a vision
// model can analyze. SVGs are markup and non-image MIME types aren't images at
// all — neither is worth sending to the metadata LLM.
export function isRasterImage(mimeType: string | undefined | null): boolean {
  if (!mimeType) return false;
  if (!mimeType.startsWith("image/")) return false;
  return mimeType !== "image/svg+xml";
}

export function transformImageUrl(
  url: string,
  options: { width?: number; quality?: number; mimeType?: string; size?: number | null } = {},
): string {
  if (!url) return url;
  if (isNonTransformableMimeType(options.mimeType)) return url;
  if (options.size != null && options.size < MIN_OPTIMIZE_SIZE) return url;
  const parsed = parseUrl(url);
  if (!parsed) return url;
  if (!isTransformableUrl(parsed)) return url;

  const parts = [`format=auto`, `quality=${options.quality ?? DEFAULT_QUALITY}`, `fit=scale-down`];
  if (options.width != null) parts.push(`width=${options.width}`);

  return `${parsed.origin}/cdn-cgi/image/${parts.join(",")}${parsed.pathname}${parsed.search}`;
}

export function buildImageSrcSet(
  url: string,
  mimeType?: string,
  size?: number | null,
): string | undefined {
  if (!url) return undefined;
  if (isNonTransformableMimeType(mimeType)) return undefined;
  if (size != null && size < MIN_OPTIMIZE_SIZE) return undefined;
  const parsed = parseUrl(url);
  if (!parsed) return undefined;
  if (!isTransformableUrl(parsed)) return undefined;

  return DEFAULT_SRCSET_WIDTHS.map((w) => `${transformImageUrl(url, { width: w })} ${w}w`).join(
    ", ",
  );
}

export function getDefaultImageWidth(): number {
  return DEFAULT_SRC_WIDTH;
}

export function getDefaultImageSizes(): string {
  return DEFAULT_SIZES;
}
