import { useAuthState } from "@/lib/auth";

interface AuthGateProps {
  authenticated: React.ReactNode;
  unauthenticated: React.ReactNode;
  loading?: React.ReactNode;
}

export function AuthGate({ authenticated, unauthenticated, loading = null }: AuthGateProps) {
  const { isAuthenticated, isLoading } = useAuthState();

  if (isLoading) return loading;
  return isAuthenticated ? authenticated : unauthenticated;
}
