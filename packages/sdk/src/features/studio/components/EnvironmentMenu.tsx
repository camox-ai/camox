import { Badge } from "@camox/ui/badge";
import { Button } from "@camox/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@camox/ui/popover";
import { ChevronsUpDown } from "lucide-react";
import * as React from "react";

import { AuthContext } from "@/lib/auth";

export const EnvironmentMenu = () => {
  const [open, setOpen] = React.useState(false);
  const authCtx = React.useContext(AuthContext);

  if (!authCtx?.environmentName) {
    return null;
  }

  const isProduction = authCtx.environmentName === "production";

  const badgeClassName = isProduction
    ? "bg-green-100 text-green-800 border border-green-300 hover:bg-green-100 dark:bg-green-900 dark:text-green-300 dark:border-green-700 dark:hover:bg-green-900 font-mono text-xs"
    : "bg-yellow-100 text-yellow-800 border border-yellow-300 hover:bg-yellow-100 dark:bg-yellow-900 dark:text-yellow-300 dark:border-yellow-700 dark:hover:bg-yellow-900 font-mono text-xs";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" className="gap-2">
          <Badge variant="secondary" className={badgeClassName}>
            {authCtx.environmentName}
          </Badge>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-4" align="start" side="bottom">
        <div className="flex flex-col gap-3">
          {isProduction ? (
            <p className="text-sm">You are viewing the production environment.</p>
          ) : (
            <>
              <p className="text-sm">
                This environment is your own space to iterate on content and data structures. It
                won't affect your teammates or production.
              </p>
              <p className="text-muted-foreground text-xs">
                Switching between environments and transferring data between them is coming soon.
              </p>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
