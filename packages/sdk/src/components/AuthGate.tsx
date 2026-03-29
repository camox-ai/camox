import { useAuthState } from "@/lib/auth";

interface AuthGateProps {
  authenticated: React.ReactNode;
  unauthenticated: React.ReactNode;
}

export function AuthGate({ authenticated, unauthenticated }: AuthGateProps) {
  const { isAuthenticated, isLoading } = useAuthState();

  if (isLoading) return null;
  return isAuthenticated ? authenticated : unauthenticated;
}
