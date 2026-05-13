/**
 * workerd / worker / deno entry — resolves via the matching exports condition.
 *
 * Uses the same wasm renderer as the node wrapper (single engine across
 * runtimes). The split between this file and `imageResponse.node.ts` is only
 * about how the wasm module gets loaded — see that file for the full
 * rationale.
 *
 * Here there's no filesystem: `@takumi-rs/wasm/next` resolves to the wasm
 * file with the `?module` query, which the Cloudflare Workers bundler
 * (Wrangler / `@cloudflare/vite-plugin` — matches `\.wasm(\?module)?$`) and
 * Next.js / Vercel both recognise as a `WebAssembly.Module` reference.
 * `@takumi-rs/image-response/wasm` then lazy-inits the wasm inside its
 * response stream.
 *
 * Geist is bundled in `./defaultFonts` to compensate for the wasm renderer
 * shipping with no embedded fonts.
 *
 * We wrap the wasm class so the SDK call site doesn't have to know which
 * runtime it's on: `new ImageResponse(jsx, { width, height })` works in
 * either case.
 */

import { ImageResponse as WasmImageResponse } from "@takumi-rs/image-response/wasm";
import wasmModule from "@takumi-rs/wasm/next";
import type { ReactNode } from "react";

import { DEFAULT_FONTS } from "./defaultFonts";

type WasmCtorOptions = ConstructorParameters<typeof WasmImageResponse>[1];

/** Same shape as the wasm options minus the `module` field we inject ourselves. */
export type ImageResponseOptions = Omit<WasmCtorOptions, "module">;

export class ImageResponse extends WasmImageResponse {
  constructor(component: ReactNode, options?: ImageResponseOptions) {
    const merged = {
      ...options,
      module: wasmModule,
      // Honor user-provided fonts; otherwise inject Geist as a default so text
      // has something to render with.
      fonts: options && "fonts" in options && options.fonts ? options.fonts : DEFAULT_FONTS,
    } as unknown as WasmCtorOptions;
    super(component, merged);
  }
}
