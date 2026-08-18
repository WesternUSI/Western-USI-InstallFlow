import { Navigate, Outlet, createFileRoute } from "@tanstack/react-router";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";

import { AdminSidebar } from "@/components/admin-sidebar";
import Loader from "@/components/loader";
import { SidebarProvider } from "@/lib/sidebar-context";

export const Route = createFileRoute("/_auth")({
  component: AuthLayout,
});

function AuthLayout() {
  return (
    <>
      <Authenticated>
        <SidebarProvider>
          <div className="flex h-full overflow-hidden bg-[#FAFAFA]">
            <AdminSidebar />
            <main className="flex min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
              <Outlet />
            </main>
          </div>
        </SidebarProvider>
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
