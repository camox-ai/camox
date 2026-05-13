/**
 * Self-import declarations.
 *
 * Inside the SDK source, dynamic imports like `import("camox/_internal/imageResponse")`
 * are deliberately routed through this package's own `exports` map (via the user's
 * bundler) so we can dispatch by runtime — they shouldn't be rewritten to a relative
 * path at SDK build time. Node and TypeScript both support package self-references via
 * the package name, but only when a self-link exists in `node_modules`; inside this
 * workspace package none does, so TypeScript needs a hint.
 *
 * The runtime entry resolved by the user's bundler is the workerd/node-specific wrapper
 * from `src/features/og/imageResponse.{node,workerd}.ts` — typing the import here as the
 * node variant is fine since both wrappers expose the same `ImageResponse` shape (see
 * the two source files in this same directory tree).
 */
declare module "camox/_internal/imageResponse" {
  export { ImageResponse } from "../features/og/imageResponse.node";
}
