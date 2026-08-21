import { useClerk } from "@clerk/react";
import { api } from "@usi-installer/backend/convex/_generated/api";
import { Navigate, Outlet, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from "convex/react";
import { ShieldAlert } from "lucide-react";

import { AdminSidebar } from "@/components/admin-sidebar";
import Loader from "@/components/loader";
import { SidebarProvider } from "@/lib/sidebar-context";

export const Route = createFileRoute("/_auth")({
  component: AuthLayout,
});

/** Shown to a signed-in Clerk user whose Convex role isn't admin/office_staff
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
      <h1 className="text-lg font-bold text-slate-900">This panel is for office staff only</h1>
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

  if (user === undefined) {
    return <Loader />;
  }

  if (user === null || (user.role !== "admin" && user.role !== "office_staff")) {
    return <RestrictedAccess />;
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
