import { Button } from "@camox/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@camox/ui/dropdown-menu";
import { Skeleton } from "@camox/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronDown, Globe, Info, Settings, Users } from "lucide-react";
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost">
          <div className="flex items-center gap-2">
            <Favicon size={16} />
            <span className="select-none">{project.name}</span>
          </div>
          <ChevronDown className="shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72" align="start" side="bottom">
        <DropdownMenuItem
          onSelect={() => {
            if (authCtx) {
              window.open(
                `${authCtx.authenticationUrl}/dashboard/${project.organizationSlug}/${project.slug}/overview`,
                "_blank",
              );
            }
          }}
        >
          <Settings />
          Project settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
          {project.organizationSlug}
        </DropdownMenuLabel>
        <DropdownMenuItem
          onSelect={() => {
            if (authCtx) {
              window.open(
                `${authCtx.authenticationUrl}/dashboard/${project.organizationSlug}/team?tab=members`,
                "_blank",
              );
            }
          }}
        >
          <Users />
          Team members
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            if (authCtx) {
              window.open(
                `${authCtx.authenticationUrl}/dashboard/${project.organizationSlug}/team?tab=settings`,
                "_blank",
              );
            }
          }}
        >
          <Settings className="h-4 w-4" />
          Team settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="https://camox.ai" target="_blank">
            <Info className="h-4 w-4" />
            Powered by Camox
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
