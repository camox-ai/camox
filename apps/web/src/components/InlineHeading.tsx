import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

type InlineHeadingProps = Omit<ComponentProps<"p">, "title"> & {
  lead: ReactNode;
  continuation: ReactNode;
};

export function InlineHeading({ lead, continuation, className, ...props }: InlineHeadingProps) {
  return (
    <p
      {...props}
      className={cn(
        "text-foreground text-xl leading-tight font-semibold tracking-tight sm:text-3xl md:text-4xl",
        className,
      )}
    >
      {lead} <span className="text-muted-foreground">{continuation}</span>
    </p>
  );
}
