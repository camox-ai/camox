import { Navigate, useLocation } from "@tanstack/react-router";
import * as React from "react";

import { useAuthState, useSignInRedirect } from "@/lib/auth";

import { Navbar } from "./components/Navbar";

interface CamoxStudioProps {
  children: React.ReactNode;
}

const CamoxStudio = ({ children }: CamoxStudioProps) => {
  const { isAuthenticated, isLoading: isLoadingAuth } = useAuthState();
  const { pathname } = useLocation();
  const signInRedirect = useSignInRedirect();

  React.useEffect(() => {
    if (!isAuthenticated && !isLoadingAuth) {
      signInRedirect();
    }
  }, [isAuthenticated, signInRedirect]);

  if (pathname === "cmx-studio") {
    return <Navigate to="/" />;
  }

  return (
    <div className="bg-background flex h-screen flex-col overflow-hidden">
      <Navbar />
      {children}
    </div>
  );
};

export { CamoxStudio };
