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
    <div className="border-primary bg-background ring-primary/15 shadow-primary/20 flex items-center gap-4 rounded-2xl border-2 px-6 py-5 font-mono shadow-2xl ring-8">
      <span aria-hidden className="text-muted-foreground shrink-0 text-xl font-bold select-none">
        $
      </span>
      <div ref={commandRef} className="min-w-0 flex-1 overflow-x-auto">
        {children}
      </div>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? "Copied" : "Copy command"}
        className="text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:ring-ring/40 inline-flex size-10 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        {copied ? <Check className="text-primary size-5" /> : <Copy className="size-5" />}
      </button>
    </div>
  );
}
