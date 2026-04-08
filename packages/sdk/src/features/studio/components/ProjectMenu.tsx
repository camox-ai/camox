import { Button } from "@camox/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@camox/ui/popover";
import { Separator } from "@camox/ui/separator";
import { Skeleton } from "@camox/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Globe, Settings, Users } from "lucide-react";
import * as React from "react";

import { AuthContext } from "@/lib/auth";
import { projectQueries } from "@/lib/queries";

const Favicon = ({ size = 16 }: { size?: number }) => {
  const [faviconUrl, setFaviconUrl] = React.useState<string | null>(null);
  const [hasError, setHasError] = React.useState(false);

  React.useEffect(() => {
    const getFaviconUrl = () => {
      const selectors = [
        'link[rel="icon"]',
        'link[rel="shortcut icon"]',
        'link[rel="apple-touch-icon"]',
      ];

      for (const selector of selectors) {
        const link = document.querySelector(selector) as HTMLLinkElement;
        if (link?.href) {
          return link.href;
        }
      }
      return null;
    };

    const url = getFaviconUrl();
    setFaviconUrl(url);
  }, []);

  if (!faviconUrl || hasError) {
    return (
      <div
        className="bg-muted flex items-center justify-center rounded-full"
        style={{ height: size, width: size }}
      >
        <Globe
          className="text-muted-foreground"
          style={{ height: size * 0.6, width: size * 0.6 }}
        />
      </div>
    );
  }

  return (
    <div
      className="bg-muted flex items-center justify-center overflow-hidden rounded-full"
      style={{ height: size, width: size }}
    >
      <img
        src={faviconUrl}
        alt="Favicon"
        className="h-full w-full object-cover"
        onError={() => setHasError(true)}
      />
    </div>
  );
};

export const ProjectMenu = () => {
  const [open, setOpen] = React.useState(false);
  const authCtx = React.useContext(AuthContext);
  const { data: project } = useQuery(projectQueries.getBySlug(authCtx!.projectSlug));

  if (!project) {
    return (
      <div className="flex h-9 min-w-[150px] items-center gap-2 px-4">
        <Skeleton className="h-4 w-4 rounded-full" />
        <Skeleton className="h-3 flex-1" />
      </div>
    );
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" className="min-w-[150px] justify-between gap-2">
            <div className="flex items-center gap-2">
              <Favicon size={16} />
              <span>{project.name}</span>
            </div>
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start" side="bottom">
          <div className="flex flex-col">
            <div className="flex flex-col gap-2 p-4">
              <h3 className="font-mono text-sm leading-none">{project.name}</h3>
            </div>
            <Separator />
            <div className="flex flex-col gap-1 p-2">
              <Button
                variant="ghost"
                className="w-full justify-start"
                onClick={() => {
                  if (authCtx) {
                    window.open(
                      `${authCtx.authenticationUrl}/dashboard/${project.organizationSlug}/${project.slug}/overview`,
                      "_blank",
                    );
                  }
                  setOpen(false);
                }}
              >
                <Settings className="text-muted-foreground size-4" />
                Project settings
              </Button>
            </div>
            <Separator />
            <div className="flex flex-col gap-1 p-2">
              <Button
                variant="ghost"
                className="w-full justify-start"
                onClick={() => {
                  if (authCtx) {
                    window.open(
                      `${authCtx.authenticationUrl}/dashboard/${project.organizationSlug}/team?tab=members`,
                      "_blank",
                    );
                  }
                  setOpen(false);
                }}
              >
                <Users className="text-muted-foreground size-4" />
                Team members
              </Button>
              <Button
                variant="ghost"
                className="w-full justify-start"
                onClick={() => {
                  if (authCtx) {
                    window.open(
                      `${authCtx.authenticationUrl}/dashboard/${project.organizationSlug}/team?tab=settings`,
                      "_blank",
                    );
                  }
                  setOpen(false);
                }}
              >
                <Settings className="text-muted-foreground size-4" />
                Team settings
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
};
