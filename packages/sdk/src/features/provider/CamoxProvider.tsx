import { Toaster } from "@camox/ui/toaster";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as React from "react";
import studioCssUrl from "virtual:camox-studio-css";

import { AuthGate } from "@/components/AuthGate";
import type { CamoxApp } from "@/core/createApp";
import { ApiClientContext, createApiClient } from "@/lib/api-client";
import {
  AuthContext,
  createCamoxAuthClient,
  useAuthActions,
  useProcessOtt,
  useSignInRedirect,
} from "@/lib/auth";

import { usePreviewPagesActions } from "../preview/CamoxPreview";
import { useNavbarActions } from "../studio/components/Navbar";
import { useTheme, useThemeActions } from "../studio/useTheme";
import { CamoxAppProvider } from "./components/CamoxAppContext";
import { CommandPalette, useCommandPaletteActions } from "./components/CommandPalette";
import { useAdminShortcuts } from "./useAdminShortcuts";

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

  const { theme } = useTheme();

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

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isMetaOrCtrl = event.metaKey || event.ctrlKey;

      // Unauthenticated keyboard handler - Cmd+Escape opens sign in
      if (isMetaOrCtrl && event.key === "Escape") {
        event.preventDefault();
        signInRedirect();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [signInRedirect]);

  return (
    <>
      <div className="bg-background min-h-screen">{children}</div>
    </>
  );
};

interface CamoxProviderProps {
  children: React.ReactNode;
  camoxApp: CamoxApp;
  convexUrl?: string;
  managementUrl: string;
  apiUrl: string;
  queryClient: QueryClient;
}

export function CamoxProvider({
  children,
  camoxApp,
  managementUrl,
  apiUrl,
  queryClient,
}: CamoxProviderProps) {
  const authClient = React.useMemo(() => createCamoxAuthClient(apiUrl), [apiUrl]);
  const apiClient = React.useMemo(() => createApiClient(apiUrl), [apiUrl]);

  // Verify ?ott= one-time token before the provider tree renders
  const ottReady = useProcessOtt(authClient);
  if (!ottReady) return null;

  return (
    <AuthContext.Provider value={{ authClient, managementUrl, apiUrl }}>
      <ApiClientContext.Provider value={apiClient}>
        <CamoxAppProvider app={camoxApp}>
          <QueryClientProvider client={queryClient}>
            <AuthGate
              authenticated={
                <>
                  <link rel="stylesheet" href={studioCssUrl} />
                  <AuthenticatedCamoxProvider>{children}</AuthenticatedCamoxProvider>
                </>
              }
              unauthenticated={
                <UnauthenticatedCamoxProvider>{children}</UnauthenticatedCamoxProvider>
              }
            />
          </QueryClientProvider>
        </CamoxAppProvider>
      </ApiClientContext.Provider>
    </AuthContext.Provider>
  );
}
