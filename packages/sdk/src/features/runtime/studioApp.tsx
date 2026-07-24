import {
  HydrationBoundary,
  QueryClientProvider,
  type DehydratedState,
  type QueryClient,
} from "@tanstack/react-query";
import * as React from "react";

import { AuthGate } from "../../components/AuthGate";
import type { CamoxApp } from "../../core/createApp";
import { CompleteBlockEditingRuntimeProvider } from "../../core/editing/CompleteBlockEditingRuntime";
import { useSignInRedirect } from "../../lib/auth";
import { CamoxContent } from "../content/CamoxContent";
import { AuthenticatedCamoxProvider } from "../provider/AuthenticatedCamoxProvider";
import { CoreCamoxProvider } from "../provider/CoreCamoxProvider";
import { CamoxStudio } from "../studio/CamoxStudio";
import { STUDIO_CONTENT_PATH } from "../studio/routes";
import { StudioNavigationProvider } from "./studioNavigation";

export interface StudioRenderInput {
  apiUrl: string;
  authenticationUrl: string;
  dehydratedState: unknown;
  environmentName?: string;
  href: string;
  pathname: string;
  projectSlug: string;
  routeKind: "studio" | "studio-content" | "studio-nested";
  runtimeBasePath: string;
}

function StudioRouteContent({ input }: { input: StudioRenderInput }) {
  if (input.pathname === STUDIO_CONTENT_PATH) return <CamoxContent />;

  if (input.routeKind === "studio-nested") {
    return <div className="text-muted-foreground p-6 text-sm">Studio page not found</div>;
  }

  return <div className="text-muted-foreground p-6 text-sm">Loading Studio…</div>;
}

function StudioAuthentication({ children }: { children: React.ReactNode }) {
  const signInRedirect = useSignInRedirect(() => {
    if (typeof window === "undefined") return undefined;
    return new URL("/", window.location.href).href;
  });

  React.useEffect(() => signInRedirect(), [signInRedirect]);
  return <>{children}</>;
}

function StudioAccessGate({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate
      authenticated={<AuthenticatedCamoxProvider>{children}</AuthenticatedCamoxProvider>}
      loading={null}
      unauthenticated={<StudioAuthentication>{null}</StudioAuthentication>}
    />
  );
}

export function StudioApp({
  camoxApp,
  input,
  queryClient,
}: {
  camoxApp: CamoxApp;
  input: StudioRenderInput;
  queryClient: QueryClient;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <HydrationBoundary state={input.dehydratedState as DehydratedState}>
        <StudioNavigationProvider
          href={input.href}
          pathname={input.pathname}
          runtimeBasePath={input.runtimeBasePath}
        >
          <CoreCamoxProvider
            camoxApp={camoxApp}
            authenticationUrl={input.authenticationUrl}
            apiUrl={input.apiUrl}
            projectSlug={input.projectSlug}
            environmentName={input.environmentName}
          >
            <StudioAccessGate>
              <CompleteBlockEditingRuntimeProvider>
                <CamoxStudio>
                  <StudioRouteContent input={input} />
                </CamoxStudio>
              </CompleteBlockEditingRuntimeProvider>
            </StudioAccessGate>
          </CoreCamoxProvider>
        </StudioNavigationProvider>
      </HydrationBoundary>
    </QueryClientProvider>
  );
}
