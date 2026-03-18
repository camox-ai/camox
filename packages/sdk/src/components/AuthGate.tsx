import { useConvexAuth } from "convex/react";

interface AuthGateProps {
  authenticated: React.ReactNode;
  unauthenticated: React.ReactNode;
}

export function AuthGate({ authenticated, unauthenticated }: AuthGateProps) {
  const { isAuthenticated, isLoading } = useConvexAuth();

  if (isLoading) return null;
  return isAuthenticated ? authenticated : unauthenticated;
}
