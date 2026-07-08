import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@camox/ui/alert-dialog";
import { Toaster } from "@camox/ui/toaster";
import { useQuery } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools/production";
import * as React from "react";
import studioCssUrl from "virtual:camox-studio-css";

import { AuthGate } from "@/components/AuthGate";
import type { CamoxApp } from "@/core/createApp";
import { useLocation } from "@/features/navigation/navigation";
import { initApiClient } from "@/lib/api-client";
import {
  AuthContext,
  createCamoxAuthClient,
  useAuthActions,
  useProcessOtt,
  useSignInRedirect,
} from "@/lib/auth";
import { projectQueries } from "@/lib/queries";
import { identifyProject, identifyUser } from "@/lib/telemetry-client";
import { useProjectRoom } from "@/lib/use-project-room";

import { usePreviewPagesActions } from "../preview/CamoxPreview";
import { PreviewPanel } from "../preview/components/PreviewPanel";
import { useNavbarActions } from "../studio/components/Navbar";
import { STUDIO_BASE_PATH } from "../studio/routes";
import { useApplyTheme, useThemeActions, useThemeValue } from "../studio/useTheme";
import { actionsStore, type Action } from "./actionsStore";
import { CamoxAppProvider } from "./components/CamoxAppContext";
import { CommandPalette, useCommandPaletteActions } from "./components/CommandPalette";
import { useAdminShortcuts } from "./useAdminShortcuts";

declare const __ENABLE_TANSTACK_DEVTOOLS__: boolean;

const isLocalhost = () => {
  if (typeof window === "undefined") return false;
  const { hostname } = window.location;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
};

const isStudioPathname = (pathname: string) => {
  return pathname === STUDIO_BASE_PATH || pathname.startsWith(`${STUDIO_BASE_PATH}/`);
};

interface AuthenticatedCamoxProviderProps {
  children: React.ReactNode;
}

const AuthenticatedCamoxProvider = ({ children }: AuthenticatedCamoxProviderProps) => {
  useAdminShortcuts();

  useCommandPaletteActions();
  useThemeActions();
  useAuthActions();
  useNavbarActions();
  usePreviewPagesActions();

  // Real-time invalidation via WebSocket
  const { authClient, apiUrl, projectSlug, environmentName } = React.useContext(AuthContext)!;
  const { data: session } = authClient.useSession();
  const user = session?.user;
  const { data: project } = useQuery(projectQueries.getBySlug(projectSlug));
  useProjectRoom(apiUrl, project?.id);

  React.useEffect(() => {
    if (!user) return;
    identifyUser({ userId: user.id, email: user.email, name: user.name });
  }, [user]);

  React.useEffect(() => {
    if (!project) return;
    identifyProject({
      projectId: project.id,
      projectSlug,
      projectName: project.name,
      environmentName,
    });
  }, [project, projectSlug, environmentName]);

  const { resolvedTheme } = useApplyTheme();

  return (
    <>
      {children}
      <Toaster theme={resolvedTheme} />
      <CommandPalette />
    </>
  );
};

const UnauthenticatedLocalhostPreview = ({ children }: { children: React.ReactNode }) => {
  const signInRedirect = useSignInRedirect();
  const { resolvedTheme } = useApplyTheme();
  const [isSignInDialogOpen, setIsSignInDialogOpen] = React.useState(false);

  useAdminShortcuts();

  React.useEffect(() => {
    const actions = [
      {
        id: "sign-in-to-edit",
        label: "Sign in to edit",
        aliases: ["Enter edit mode", "Edit mode"],
        groupLabel: "Preview",
        checkIfAvailable: () => true,
        execute: () => setIsSignInDialogOpen(true),
        shortcut: { key: "Enter", withMeta: true },
      },
    ] satisfies Action[];

    actionsStore.send({ type: "registerManyActions", actions });
    return () => {
      actionsStore.send({
        type: "unregisterManyActions",
        ids: actions.map((action) => action.id),
      });
    };
  }, []);

  return (
    <>
      <link rel="stylesheet" href={studioCssUrl} />
      <Toaster theme={resolvedTheme} position="bottom-right" offset={{ bottom: "1rem" }} />
      <div className="bg-background flex h-screen flex-col overflow-hidden">
        <PreviewPanel
          toolbarProps={{
            onEditModeChange: (checked) => {
              if (checked) setIsSignInDialogOpen(true);
            },
          }}
        >
          {children}
        </PreviewPanel>
      </div>
      <AlertDialog open={isSignInDialogOpen} onOpenChange={setIsSignInDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign in to edit</AlertDialogTitle>
            <AlertDialogDescription>
              You need to sign in before you can enable edit mode.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="outline" size="default">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={signInRedirect}>Sign in</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

const UnauthenticatedPage = ({ children }: { children: React.ReactNode }) => {
  const { theme } = useThemeValue();

  return (
    <>
      <Toaster theme={theme} position="bottom-right" offset={{ bottom: "1rem" }} />
      <div className="bg-background min-h-screen">{children}</div>
    </>
  );
};

const UnauthenticatedCamoxProvider = ({ children }: { children: React.ReactNode }) => {
  const { pathname } = useLocation();
  const getSignInCallbackHref = React.useCallback(() => {
    if (typeof window === "undefined") return undefined;
    if (pathname !== STUDIO_BASE_PATH) return window.location.href;

    const rootPath = "/";
    return new URL(rootPath, window.location.href).href;
  }, [pathname]);
  const signInRedirect = useSignInRedirect(getSignInCallbackHref);

  React.useEffect(() => {
    if (!isStudioPathname(pathname)) return;
    signInRedirect();
  }, [pathname, signInRedirect]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isLocalhost()) return;
      const isMetaOrCtrl = event.metaKey || event.ctrlKey;

      // Unauthenticated keyboard handler - Cmd+Enter opens sign in
      if (isMetaOrCtrl && event.key === "Enter") {
        event.preventDefault();
        signInRedirect();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [signInRedirect]);

  if (isStudioPathname(pathname)) {
    return null;
  }

  if (isLocalhost() && !isStudioPathname(pathname)) {
    return <UnauthenticatedLocalhostPreview>{children}</UnauthenticatedLocalhostPreview>;
  }

  return <UnauthenticatedPage>{children}</UnauthenticatedPage>;
};

interface CamoxProviderProps {
  children: React.ReactNode;
  camoxApp: CamoxApp;
  authenticationUrl: string;
  apiUrl: string;
  projectSlug: string;
  environmentName?: string;
}

export function CamoxProvider({
  children,
  camoxApp,
  authenticationUrl,
  apiUrl,
  projectSlug,
  environmentName,
}: CamoxProviderProps) {
  const authClient = React.useMemo(() => createCamoxAuthClient(apiUrl), [apiUrl]);

  const initializedApiUrl = React.useRef<string | null>(null);
  if (initializedApiUrl.current !== apiUrl) {
    initApiClient(apiUrl, environmentName);
    initializedApiUrl.current = apiUrl;
  }

  // Verify ?ott= one-time token before the provider tree renders
  const ottReady = useProcessOtt(authClient);
  if (!ottReady) return null;

  return (
    <AuthContext.Provider
      value={{ authClient, authenticationUrl, apiUrl, projectSlug, environmentName }}
    >
      <CamoxAppProvider app={camoxApp}>
        {__ENABLE_TANSTACK_DEVTOOLS__ && <ReactQueryDevtools initialIsOpen={false} />}
        <AuthGate
          authenticated={
            <>
              <link rel="stylesheet" href={studioCssUrl} />
              <AuthenticatedCamoxProvider>{children}</AuthenticatedCamoxProvider>
            </>
          }
          unauthenticated={<UnauthenticatedCamoxProvider>{children}</UnauthenticatedCamoxProvider>}
        />
      </CamoxAppProvider>
    </AuthContext.Provider>
  );
}
