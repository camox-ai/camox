import { TerminalIcon } from "lucide-react";

export function CreateProjectGuide() {
  return (
    <div className="text-muted-foreground flex flex-col items-center gap-3 py-10 text-center">
      <TerminalIcon className="h-10 w-10" />
      <h2 className="text-foreground text-lg font-semibold">Create a project via CLI</h2>
      <p className="max-w-sm text-sm">
        Run <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-sm">npx camox init</code>{" "}
        in your terminal to get started.
      </p>
    </div>
  );
}
