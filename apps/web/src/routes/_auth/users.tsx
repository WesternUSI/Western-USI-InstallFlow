import { createFileRoute } from "@tanstack/react-router";

import { ComingSoon } from "@/components/coming-soon";
import { PageHeader } from "@/components/page-header";

export const Route = createFileRoute("/_auth/users")({
  component: () => (
    <>
      <PageHeader title="Users" description="Manage user accounts, roles and team membership." />
      <ComingSoon screen="Users" />
    </>
  ),
});
