import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

type PillProps = ComponentProps<"span">;

export function Pill({ className, ...props }: PillProps) {
  return (
    <span
      {...props}
      className={cn(
        "bg-accent/50 border-accent text-accent-foreground inline-block rounded-full border px-4 py-1.5 text-sm font-medium",
        className,
      )}
    />
  );
}
