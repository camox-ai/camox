import type { ToasterProps } from "sonner";
import { Toaster as Sonner, toast } from "sonner";

import { cn } from "../lib/utils";

const Toaster = ({ theme = "system", className, ...props }: ToasterProps) => {
  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className={cn("toaster group camox-studio-theme", theme === "dark" && "dark", className)}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      position="top-center"
      {...props}
    />
  );
};

export { Toaster, toast };
