import { createFileRoute } from "@tanstack/react-router";
import { Terminal } from "lucide-react";

export const Route = createFileRoute("/_app/_auth/cli-authorized")({
  component: CliAuthorizedPage,
});

function CliAuthorizedPage() {
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <div className="bg-muted flex size-16 items-center justify-center rounded-full">
        <Terminal className="text-muted-foreground size-8" />
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">You're all set!</h1>
        <p className="text-muted-foreground">You can close this tab and return to your terminal.</p>
      </div>
    </div>
  );
}
