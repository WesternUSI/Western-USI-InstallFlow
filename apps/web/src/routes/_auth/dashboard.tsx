import { useUser } from "@clerk/react";
import { createFileRoute } from "@tanstack/react-router";

import { UploadSiteDatabaseButton } from "@/components/upload-site-database-button";

export const Route = createFileRoute("/_auth/dashboard")({
  component: RouteComponent,
});

function RouteComponent() {
  const user = useUser();

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-[#edf1f3]">
      <p className="text-[15px] font-medium text-[#6c7278]">Welcome {user.user?.fullName}</p>
      <UploadSiteDatabaseButton />
    </div>
  );
}
