import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

type PillProps = ComponentProps<"span">;

export function Pill({ className, ...props }: PillProps) {
  return (
    <span
      {...props}
      className={cn(
        "text-primary inline-block rounded-full text-sm font-semibold uppercase",
        className,
      )}
    />
  );
}
