import { toast, Toaster } from "@camox/ui/toaster";
import { useQuery } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools/production";
import * as React from "react";
import studioCssUrl from "virtual:camox-studio-css";

import { AuthGate } from "@/components/AuthGate";
import type { CamoxApp } from "@/core/createApp";
import { identifyProject, identifyUser } from "@/lib/analytics-client";
import { initApiClient } from "@/lib/api-client";
import {
  AuthContext,
  createCamoxAuthClient,
  useAuthActions,
  useAuthContext,
  useProcessOtt,
  useSignInRedirect,
} from "@/lib/auth";
import { projectQueries } from "@/lib/queries";
import { useProjectRoom } from "@/lib/use-project-room";

import { usePreviewPagesActions } from "../preview/CamoxPreview";
import { useNavbarActions } from "../studio/components/Navbar";
import { useApplyTheme, useThemeActions, useThemeValue } from "../studio/useTheme";
import { CamoxAppProvider } from "./components/CamoxAppContext";
import { CommandPalette, useCommandPaletteActions } from "./components/CommandPalette";
import { useAdminShortcuts } from "./useAdminShortcuts";

declare const __ENABLE_TANSTACK_DEVTOOLS__: boolean;

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

  const { theme } = useApplyTheme();

  return (
    <>
      {children}
      <Toaster theme={theme} />
      <CommandPalette />
    </>
  );
};

const UnauthenticatedCamoxProvider = ({ children }: { children: React.ReactNode }) => {
  const signInRedirect = useSignInRedirect();
  const { authenticationUrl } = useAuthContext();

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isMetaOrCtrl = event.metaKey || event.ctrlKey;

      // Unauthenticated keyboard handler - Cmd+Enter opens sign in
      if (isMetaOrCtrl && event.key === "Enter") {
        event.preventDefault();
        signInRedirect();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [signInRedirect, authenticationUrl]);

  React.useEffect(() => {
    if (import.meta.env.PROD) {
      return;
    }
    const toastId = toast("Sign in to open Camox Studio", {
      duration: Infinity,
      action: {
        label: "Sign in",
        onClick: () => signInRedirect(),
      },
    });
    return () => void toast.dismiss(toastId);
  }, [signInRedirect]);

  const { theme } = useThemeValue();

  return (
    <>
      <Toaster theme={theme} position="bottom-right" offset={{ bottom: "1rem" }} />
      <div className="bg-background min-h-screen">{children}</div>
    </>
  );
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
