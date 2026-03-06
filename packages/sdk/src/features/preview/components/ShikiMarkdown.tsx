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
        className="min-w-0 w-full overflow-hidden rounded-md border border-input text-sm [&_pre]:whitespace-pre-wrap [&_pre]:break-all [&_pre]:px-3 [&_pre]:py-2 [&_pre]:rounded-md [&_code]:font-mono"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </>
  );
};
