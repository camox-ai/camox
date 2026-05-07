import { Navigate, useLocation } from "@tanstack/react-router";
import * as React from "react";

import { useAuthState, useSignInRedirect } from "@/lib/auth";
import { trackClientEvent } from "@/lib/telemetry-client";

import { Navbar } from "./components/Navbar";

const CamoxStudio = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isLoading: isLoadingAuth } = useAuthState();
  const { pathname } = useLocation();
  const signInRedirect = useSignInRedirect();

  React.useEffect(() => {
    if (!isAuthenticated && !isLoadingAuth) {
      signInRedirect();
    }
  }, [isAuthenticated, isLoadingAuth, signInRedirect]);

  const hasTrackedOpenRef = React.useRef(false);
  React.useEffect(() => {
    if (!isAuthenticated || hasTrackedOpenRef.current) return;
    hasTrackedOpenRef.current = true;
    trackClientEvent("studio_opened", { route: pathname });
  }, [isAuthenticated, pathname]);

  if (pathname === "cmx-studio") {
    return <Navigate to="/" />;
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="bg-background flex h-screen flex-col overflow-hidden">
      <Navbar />
      {children}
    </div>
  );
};

export { CamoxStudio };
