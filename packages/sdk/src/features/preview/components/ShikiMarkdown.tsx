import { createHighlighterCore, type HighlighterCore } from "@shikijs/core";
import { createJavaScriptRegexEngine } from "@shikijs/engine-javascript";
import * as React from "react";

const css = `
.dark .shiki,
.dark .shiki span {
  color: var(--shiki-dark) !important;
  background-color: var(--shiki-dark-bg) !important;
}
`;

// Fine-grained shiki bundle: only the markdown grammar and the two themes we use,
// with the pure-JS regex engine so we don't need to load onig.wasm (which breaks
// SSR builds via rolldown's vite-wasm-fallback plugin).
let highlighterPromise: Promise<HighlighterCore> | null = null;
const getHighlighter = () => {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [
        import("@shikijs/themes/github-light"),
        import("@shikijs/themes/github-dark-high-contrast"),
      ],
      langs: [import("@shikijs/langs/markdown")],
      engine: createJavaScriptRegexEngine(),
    });
  }
  return highlighterPromise;
};

export const ShikiMarkdown = ({ code }: { code: string }) => {
  const [html, setHtml] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    void getHighlighter().then((highlighter) => {
      if (cancelled) return;
      setHtml(
        highlighter.codeToHtml(code, {
          lang: "markdown",
          themes: { light: "github-light", dark: "github-dark-high-contrast" },
          defaultColor: false,
        }),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (!html) return null;

  return (
    <>
      <style>{css}</style>
      <div
        className="border-input w-full min-w-0 overflow-hidden rounded-md border text-sm [&_code]:font-mono [&_pre]:rounded-md [&_pre]:px-3 [&_pre]:py-2 [&_pre]:break-all [&_pre]:whitespace-pre-wrap"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </>
  );
};
