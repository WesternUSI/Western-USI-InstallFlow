import { ClerkProvider, useAuth } from "@clerk/react";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { env } from "@usi-installer/env/web";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import ReactDOM from "react-dom/client";

import Loader from "./components/loader";
import { NotFoundPage } from "./components/not-found-page";
import { routeTree } from "./routeTree.gen";
const convex = new ConvexReactClient(env.VITE_CONVEX_URL);

const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  scrollRestoration: true,
  defaultPendingComponent: () => <Loader />,
  defaultNotFoundComponent: () => <NotFoundPage />,
  context: {},
  Wrap: function WrapComponent({ children }: { children: React.ReactNode }) {
    return (
      <ClerkProvider publishableKey={env.VITE_CLERK_PUBLISHABLE_KEY}>
        <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
          {children}
        </ConvexProviderWithClerk>
      </ClerkProvider>
    );
  },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("app");

if (!rootElement) {
  throw new Error("Root element not found");
}

if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<RouterProvider router={router} />);
}
