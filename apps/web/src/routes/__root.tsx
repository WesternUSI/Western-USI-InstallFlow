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
        type: "image/png",
        sizes: "32x32",
        href: "/favicon-32.png",
      },
      {
        rel: "icon",
        type: "image/png",
        sizes: "512x512",
        href: "/favicon-512.png",
      },
      {
        rel: "apple-touch-icon",
        href: "/apple-touch-icon.png",
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
        <Toaster
          position="bottom-right"
          toastOptions={{
            classNames: {
              toast:
                "rounded-xl! border! border-slate-200! bg-white! p-4! shadow-lg! text-sm! text-slate-900!",
              title: "font-semibold! text-slate-900!",
              description: "text-slate-500!",
              actionButton: "bg-blue-600! text-white!",
              cancelButton: "bg-slate-100! text-slate-600!",
              success: "border-l-4! border-l-green-500! [&>[data-icon]]:text-green-600!",
              error: "border-l-4! border-l-red-500! [&>[data-icon]]:text-red-600!",
              warning: "border-l-4! border-l-amber-500! [&>[data-icon]]:text-amber-600!",
              info: "border-l-4! border-l-blue-500! [&>[data-icon]]:text-blue-600!",
            },
          }}
        />
      </ThemeProvider>
      <TanStackRouterDevtools position="bottom-left" />
    </>
  );
}
