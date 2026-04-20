import { AuthUIProvider } from "@daveyplate/better-auth-ui";
import { QueryClientProvider } from "@tanstack/react-query";
import { Link as RouterLink, Outlet, createFileRoute, useRouter } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { type ComponentProps, useCallback } from "react";

import { authClient, getServerSession } from "@/lib/auth-client";

export const Route = createFileRoute("/_app")({
  head: () => ({
    links: [
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
      },
    ],
  }),
  beforeLoad: async () => {
    const session = await getServerSession();
    return { session };
  },
  component: AppLayout,
  errorComponent: ({ error }) => (
    <div className="dark bg-background text-foreground flex h-screen flex-1 flex-col items-center justify-center">
      <TriangleAlert className="h-8 w-8" />
      <p>An error occurred</p>
      <p className="text-muted-foreground">{error.message}</p>
    </div>
  ),
});

function LinkAdapter({ href, ...props }: ComponentProps<"a"> & { href: string }) {
  return <RouterLink to={href} {...props} />;
}

function AppLayout() {
  const router = useRouter();
  const { queryClient } = Route.useRouteContext();

  const onSessionChange = useCallback(async () => {
    await router.invalidate();
  }, [router]);

  const navigate = useCallback(
    async (href: string) => {
      router.navigate({ to: href });
    },
    [router],
  );

  const replace = useCallback(
    async (href: string) => {
      router.navigate({ to: href, replace: true });
    },
    [router],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthUIProvider
        authClient={authClient}
        navigate={navigate}
        replace={replace}
        onSessionChange={onSessionChange}
        Link={LinkAdapter}
        basePath=""
        viewPaths={{
          SIGN_IN: "login",
          SIGN_UP: "signup",
          SIGN_OUT: "logout",
          FORGOT_PASSWORD: "forgot-password",
        }}
        account={{ basePath: "", viewPaths: { SETTINGS: "dashboard/profile" } }}
        organization={true}
        avatar
        credentials={{ forgotPassword: true }}
        social={{ providers: ["github", "google"] }}
      >
        <div className="dark font-['Inter',sans-serif] antialiased">
          <Outlet />
        </div>
      </AuthUIProvider>
    </QueryClientProvider>
  );
}
