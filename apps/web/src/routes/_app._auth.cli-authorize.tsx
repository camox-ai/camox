import { Button } from "@camox/ui/button";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Terminal } from "lucide-react";
import { useState } from "react";
import { z } from "zod";

import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_app/_auth/cli-authorize")({
  beforeLoad: ({ context, location }) => {
    if (!context.session) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
  },
  validateSearch: z.object({
    callback: z.string(),
  }),
  head: () => ({
    meta: [{ title: "Authorize Camox CLI" }],
  }),
  component: CliAuthorizePage,
});

function CliAuthorizePage() {
  const { callback } = Route.useSearch();
  const [status, setStatus] = useState<"idle" | "authorizing" | "error">("idle");

  async function handleAuthorize() {
    setStatus("authorizing");
    try {
      const result = await authClient.oneTimeToken.generate();
      const token = result?.data?.token;
      if (!token) {
        setStatus("error");
        return;
      }
      const url = new URL(callback);
      url.searchParams.set("ott", token);
      window.location.href = url.toString();
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex max-w-sm flex-col items-center gap-6 text-center">
        <div className="bg-muted flex size-16 items-center justify-center rounded-full">
          <Terminal className="text-muted-foreground size-8" />
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Authorize Camox CLI</h1>
          <p className="text-muted-foreground">
            The Camox CLI is requesting permission to perform actions on your behalf.
          </p>
        </div>
        {status === "error" ? (
          <p className="text-destructive text-sm">Something went wrong. Please try again.</p>
        ) : null}
        <div className="flex w-full flex-col gap-2">
          <Button onClick={handleAuthorize} disabled={status === "authorizing"} className="w-full">
            {status === "authorizing" ? "Authorizing…" : "Authorize"}
          </Button>
        </div>
      </div>
    </div>
  );
}
