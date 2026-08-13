import { HeadContent, Outlet, createRootRouteWithContext } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { Toaster } from "@usi-installer/ui/components/sonner";

import { ThemeProvider } from "@/components/theme-provider";

import "../index.css";

export interface RouterAppContext {}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootComponent,
  head: () => ({
    meta: [
      {
        title: "usi-installer",
      },
      {
        name: "description",
        content: "usi-installer is a web application",
      },
    ],
    links: [
      {
        rel: "icon",
        href: "/favicon.ico",
      },
    ],
  }),
});

function RootComponent() {
  return (
    <>
      <HeadContent />
      {/* The admin panel is a light-only design: its colours are set directly
          rather than through theme tokens, so the shadcn components have to
          stay light too or dialogs and inputs come out dark. `forcedTheme`
          also ignores any "dark" left in localStorage from earlier builds. */}
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        forcedTheme="light"
        disableTransitionOnChange
        storageKey="vite-ui-theme"
      >
        {/* The admin panel supplies its own sidebar chrome; only the signed-out
            routes fall back to the plain header. */}
        <Outlet />
        <Toaster richColors />
      </ThemeProvider>
      <TanStackRouterDevtools position="bottom-left" />
    </>
  );
}
