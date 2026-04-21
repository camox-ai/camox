import { Check, Copy } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";

type TerminalCardProps = {
  children: ReactNode;
};

export function TerminalCard({ children }: TerminalCardProps) {
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
    <div className="border-primary bg-background ring-primary/15 shadow-primary/20 flex items-center gap-2 rounded-xl border-2 px-3 py-2.5 font-mono shadow-xl ring-4 sm:gap-4 sm:rounded-2xl sm:px-6 sm:py-5 sm:shadow-2xl sm:ring-8">
      <span
        aria-hidden
        className="text-muted-foreground shrink-0 text-base font-bold select-none sm:text-xl"
      >
        $
      </span>
      <div ref={commandRef} className="min-w-0 flex-1 overflow-x-auto">
        {children}
      </div>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? "Copied" : "Copy command"}
        className="text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:ring-ring/40 inline-flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:ring-2 focus-visible:outline-none sm:size-10"
      >
        {copied ? (
          <Check className="text-primary size-4 sm:size-5" />
        ) : (
          <Copy className="size-4 sm:size-5" />
        )}
      </button>
    </div>
  );
}
