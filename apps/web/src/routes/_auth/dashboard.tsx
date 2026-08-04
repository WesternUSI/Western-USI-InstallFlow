import { UserButton, useUser } from "@clerk/react";
import { createFileRoute } from "@tanstack/react-router";
import { api } from "@usi-installer/backend/convex/_generated/api";
import { useQuery } from "convex/react";

export const Route = createFileRoute("/_auth/dashboard")({
  component: RouteComponent,
});

function RouteComponent() {
  const privateData = useQuery(api.privateData.get);
  const user = useUser();

  return (
    <div>
      <h1>Dashboard</h1>
      <p>Welcome {user.user?.fullName}</p>
      <p>privateData: {privateData?.message}</p>
      <UserButton />
    </div>
  );
}
