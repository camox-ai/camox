import { useClerk, RedirectToSignIn } from "@clerk/clerk-react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import * as React from "react";

import { Navbar } from "./components/Navbar";

interface CamoxStudioProps {
  children: React.ReactNode;
}

const CamoxStudio = ({ children }: CamoxStudioProps) => {
  const { isSignedIn } = useClerk();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  if (!isSignedIn) {
    return <RedirectToSignIn redirectUrl="/" />;
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
