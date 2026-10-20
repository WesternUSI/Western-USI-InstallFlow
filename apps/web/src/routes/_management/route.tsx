import { api } from "@usi-installer/backend/convex/_generated/api";
import { Navigate, Outlet, createFileRoute, useRouterState } from "@tanstack/react-router";
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from "convex/react";
import { useEffect } from "react";

import { ChangePasswordScreen } from "@/components/change-password-screen";
import Loader from "@/components/loader";
import { ManagementSidebar } from "@/components/management-sidebar";
import { clearLanding, clearPendingPage, hasManagementDashboard, rememberDashboard, setPendingPage } from "@/lib/dashboard-mode";
import { SidebarProvider } from "@/lib/sidebar-context";

export const Route = createFileRoute("/_management")({
  component: ManagementLayout,
});

/**
 * The management dashboard (framework 3 "Management view", 10; decision AD43):
 * same website and login as the admin panel, its own pages under /management.
 */
function ManagementLayout() {
  // A link from an escalation email opens that record once the person has signed in (decision AD45).
  const here = useRouterState({ select: (state) => state.location.href });
  return (
    <>
      <Authenticated>
        <ManagementGate />
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

/** Signed out: remember this page for after sign-in, then go to login (decision AD45). */
function ToLogin({ here }: { here: string }) {
  setPendingPage(here);
  return <Navigate to="/login" search={{ redirect: here }} />;
}

function ManagementGate() {
  const user = useQuery(api.users.currentUser);
  const allowed = hasManagementDashboard(user);

  useEffect(() => {
    if (!allowed) return;
    clearLanding();
    clearPendingPage();
    rememberDashboard("management");
  }, [allowed]);

  // Just after signing in the account can read as "nobody" for a moment: wait rather than send them away.
  if (user === undefined || user === null) return <Loader />;
  // Anyone else goes to the admin panel, which lets admins in and turns everyone else away.
  if (!allowed) return <Navigate to="/dashboard" />;
  if (user?.must_change_password) return <ChangePasswordScreen />;

  return (
    <SidebarProvider>
      <div className="flex h-full overflow-hidden bg-[#FAFAFA]">
        <ManagementSidebar />
        <main className="flex min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </SidebarProvider>
  );
}
