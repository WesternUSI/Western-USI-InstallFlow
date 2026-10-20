import { useClerk } from "@clerk/react";
import { api } from "@usi-installer/backend/convex/_generated/api";
import { Navigate, Outlet, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from "convex/react";
import { ShieldAlert } from "lucide-react";
import { useEffect } from "react";

import { AdminSidebar } from "@/components/admin-sidebar";
import { ChangePasswordScreen } from "@/components/change-password-screen";
import Loader from "@/components/loader";
import { clearLanding, hasAdminDashboard, hasManagementDashboard, isLanding, lastDashboard, rememberDashboard } from "@/lib/dashboard-mode";
import { SidebarProvider } from "@/lib/sidebar-context";

export const Route = createFileRoute("/_auth")({
  component: AuthLayout,
});

/** Shown to a signed-in Clerk user who is neither admin nor management
 * — installers get the mobile app, not this panel. */
function RestrictedAccess() {
  const { signOut } = useClerk();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    void navigate({ to: "/login" });
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-[#FAFAFA] px-6 text-center">
      <ShieldAlert className="size-10 text-red-500" />
      <h1 className="text-lg font-bold text-slate-900">This panel is for administrators and management only</h1>
      <p className="max-w-sm text-sm text-slate-500">
        Installer accounts don't have access to the admin dashboard. Use the Western USI
        InstallFlow mobile app instead.
      </p>
      <button
        type="button"
        onClick={() => void handleSignOut()}
        className="mt-2 text-sm font-medium text-blue-600 hover:text-blue-700"
      >
        Sign out
      </button>
    </div>
  );
}

/** Gates the admin panel on role, not just sign-in — an installer's Clerk
 * session is otherwise indistinguishable from an admin's. */
function AdminGate() {
  const user = useQuery(api.users.currentUser);
  const isAdmin = hasAdminDashboard(user);
  // Right after signing in, someone with both dashboards opens the one they used last (decision AD43).
  const openManagement = user !== undefined && isAdmin && hasManagementDashboard(user) && isLanding() && lastDashboard() === "management";

  useEffect(() => {
    if (user === undefined) return;
    clearLanding();
    if (isAdmin && !openManagement) rememberDashboard("admin");
  }, [user, isAdmin, openManagement]);

  if (user === undefined) {
    return <Loader />;
  }

  // Management without admin access has its own dashboard (decision AD43).
  if (user !== null && !isAdmin && hasManagementDashboard(user)) {
    return <Navigate to="/management" />;
  }
  if (openManagement) {
    return <Navigate to="/management" />;
  }

  if (user === null || !isAdmin) {
    return <RestrictedAccess />;
  }

  if (user.must_change_password) {
    return <ChangePasswordScreen />;
  }

  return (
    <SidebarProvider>
      <div className="flex h-full overflow-hidden bg-[#FAFAFA]">
        <AdminSidebar />
        <main className="flex min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </SidebarProvider>
  );
}

function AuthLayout() {
  return (
    <>
      <Authenticated>
        <AdminGate />
      </Authenticated>
      <Unauthenticated>
        <Navigate to="/login" />
      </Unauthenticated>
      <AuthLoading>
        <Loader />
      </AuthLoading>
    </>
  );
}
