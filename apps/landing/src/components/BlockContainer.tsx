import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

type BlockContainerProps = ComponentProps<"section">;

/**
 * Class for the double vertical border (desktop only) that runs continuously
 * down stacked blocks. Apply to any `container`-width element that should
 * participate in that border — see also {@link BlockContainer}. The styles live
 * in `block-side-border` in `styles.css`.
 */
export const blockSideBorder = "block-side-border";

/**
 * Shared wrapper for page blocks. Ensures consistent vertical rhythm, a bottom
 * separator border, the centered content container, and (on desktop) the double
 * vertical border that runs continuously between stacked blocks.
 */
export function BlockContainer({ className, children, ...props }: BlockContainerProps) {
  return (
    <section {...props} className={cn("border-border border-b", className)}>
      <div className={cn("container py-12 sm:py-16 md:py-20", blockSideBorder)}>{children}</div>
    </section>
  );
}
