import { AuthUIProvider } from "@daveyplate/better-auth-ui";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  Link as RouterLink,
  Outlet,
  createFileRoute,
  redirect,
  useRouter,
} from "@tanstack/react-router";
import { type ComponentProps, useCallback } from "react";
import { z } from "zod";

import { authClient, getServerSession } from "@/lib/auth-client";

function isSafeRedirect(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export const Route = createFileRoute("/_app")({
  validateSearch: z.object({
    redirect: z.string().optional(),
  }),
  head: () => ({
    links: [
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
      },
    ],
  }),
  beforeLoad: async ({ search }) => {
    const session = await getServerSession();

    if (session && search.redirect && isSafeRedirect(search.redirect)) {
      const ottResult = await authClient.oneTimeToken.generate();
      const url = new URL(search.redirect);
      if (ottResult?.data?.token) {
        url.searchParams.set("ott", ottResult.data.token);
      }
      throw redirect({ href: url.toString() });
    }

    return { session };
  },
  component: AppLayout,
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
        organization={{
          basePath: "",
          logo: true,
          viewPaths: {
            SETTINGS: "dashboard/team?tab=settings",
            MEMBERS: "dashboard/team?tab=members",
          },
        }}
        avatar
        credentials={{ forgotPassword: true }}
        social={{ providers: ["github", "google"] }}
      >
        <div className="font-['Inter',sans-serif] antialiased">
          <Outlet />
        </div>
      </AuthUIProvider>
    </QueryClientProvider>
  );
}
