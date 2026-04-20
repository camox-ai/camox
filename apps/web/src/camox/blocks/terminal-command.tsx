import { Type, createBlock } from "camox/createBlock";
import { Check, Copy } from "lucide-react";
import { useRef, useState } from "react";

const terminalCommand = createBlock({
  id: "terminal-command",
  title: "Terminal Command",
  description:
    "Use this block as a primary call to action that displays a shell command users should copy and paste into their terminal. Place it prominently on landing or documentation pages (e.g. install, quickstart, getting started). Keep the command concise and on a single line. The block renders the command large with a centered label above it and a one-click copy-to-clipboard button.",
  content: {
    label: Type.String({
      default: "Get started in seconds",
      title: "Label",
    }),
    command: Type.String({
      default: "npx create-camox@latest my-site",
      title: "Command",
    }),
  },
  component: TerminalCommandComponent,
  toMarkdown: (c) => [c.label, `\`\`\`bash\n${c.command}\n\`\`\``],
});

function TerminalCommandComponent() {
  const commandRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const text = commandRef.current?.textContent?.trim() ?? "";
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="py-16 sm:py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-xl">
          <terminalCommand.Field name="label">
            {(props) => (
              <p
                {...props}
                className="text-muted-foreground mb-4 text-center text-sm font-medium sm:text-base"
              />
            )}
          </terminalCommand.Field>
          <div className="border-primary bg-background ring-primary/15 shadow-primary/20 flex items-center gap-3 rounded-2xl border-2 px-5 py-4 font-mono shadow-2xl ring-8 sm:gap-4 sm:px-6 sm:py-5">
            <span
              aria-hidden
              className="text-muted-foreground shrink-0 text-lg font-bold select-none sm:text-xl"
            >
              $
            </span>
            <div ref={commandRef} className="min-w-0 flex-1 overflow-x-auto">
              <terminalCommand.Field name="command">
                {(props) => (
                  <code
                    {...props}
                    className="text-foreground block text-base font-medium whitespace-nowrap sm:text-lg"
                  />
                )}
              </terminalCommand.Field>
            </div>
            <button
              type="button"
              onClick={handleCopy}
              aria-label={copied ? "Copied" : "Copy command"}
              className="text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:ring-ring/40 inline-flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:ring-2 focus-visible:outline-none sm:size-10"
            >
              {copied ? <Check className="text-primary size-5" /> : <Copy className="size-5" />}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

export { terminalCommand as block };
