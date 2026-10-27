import { api } from "@usi-installer/backend/convex/_generated/api";
import { Navigate, Outlet, createFileRoute, useRouterState } from "@tanstack/react-router";
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from "convex/react";
import { useEffect } from "react";

import { ChangePasswordScreen } from "@/components/change-password-screen";
import Loader from "@/components/loader";
import { SubcontractorSidebar } from "@/components/subcontractor-sidebar";
import { clearPendingPage, hasSubcontractorPortal, setPendingPage } from "@/lib/dashboard-mode";
import { SidebarProvider } from "@/lib/sidebar-context";

export const Route = createFileRoute("/_subcontractor")({
  component: SubcontractorLayout,
});

/**
 * The subcontractor portal (framework 10 "Subcontractor contact"): same
 * website and login as the admin panel, its own pages under /subcontractor,
 * for a subcontractor's login only.
 */
function SubcontractorLayout() {
  // A link from a reminder email opens that record once the person has signed in (decision AD50).
  const here = useRouterState({ select: (state) => state.location.href });
  return (
    <>
      <Authenticated>
        <SubcontractorGate />
      </Authenticated>
      <Unauthenticated>
        <ToLogin here={here} />
      </Unauthenticated>
      <AuthLoading>
        <Loader />
      </AuthLoading>
    </>
  );
}

/** Signed out: remember this page for after sign-in, then go to login. */
function ToLogin({ here }: { here: string }) {
  setPendingPage(here);
  return <Navigate to="/login" search={{ redirect: here }} />;
}

function SubcontractorGate() {
  const user = useQuery(api.users.currentUser);

  // Signed in now: the waiting page has been opened (or isn't theirs to open).
  useEffect(() => {
    if (user !== undefined && user !== null) clearPendingPage();
  }, [user]);

  // Just after signing in the account can read as "nobody" for a moment: wait rather than send them away.
  if (user === undefined || user === null) return <Loader />;
  // Anyone else goes to the admin panel, which sends each person to the dashboard they may open.
  if (!hasSubcontractorPortal(user)) return <Navigate to="/dashboard" />;
  if (user.must_change_password) return <ChangePasswordScreen />;

  return (
    <SidebarProvider>
      <div className="flex h-full overflow-hidden bg-[#FAFAFA]">
        <SubcontractorSidebar />
        <main className="flex min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </SidebarProvider>
  );
}
