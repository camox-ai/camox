import { useLocation, useNavigate } from "@tanstack/react-router";
import { useConvexAuth } from "convex/react";
import * as React from "react";

import { useSignInRedirect } from "@/lib/auth";

import { Navbar } from "./components/Navbar";

interface CamoxStudioProps {
  children: React.ReactNode;
}

const CamoxStudio = ({ children }: CamoxStudioProps) => {
  const { isAuthenticated } = useConvexAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const signInRedirect = useSignInRedirect();

  if (!isAuthenticated) {
    signInRedirect();
    return null;
  }

  if (pathname === "cmx-studio") {
    // @ts-expect-error the route exists but is managed in the user's app so TS doesn't know about it
    navigate("/");
  }

  return (
    <div className="bg-background flex h-screen flex-col overflow-hidden">
      <Navbar />
      {children}
    </div>
  );
};

export { CamoxStudio };
