import * as React from "react";
import { codeToHtml } from "shiki";

const css = `
.dark .shiki,
.dark .shiki span {
  color: var(--shiki-dark) !important;
  background-color: var(--shiki-dark-bg) !important;
}
`;

export const ShikiMarkdown = ({ code }: { code: string }) => {
  const [html, setHtml] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    codeToHtml(code, {
      lang: "markdown",
      themes: { light: "github-light", dark: "github-dark-high-contrast" },
      defaultColor: false,
    }).then((result) => {
      if (!cancelled) setHtml(result);
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
