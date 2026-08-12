import { createFileRoute } from "@tanstack/react-router";

import { ComingSoon } from "@/components/coming-soon";
import { PageHeader } from "@/components/page-header";

export const Route = createFileRoute("/_auth/settings")({
  component: () => (
    <>
      <PageHeader title="Settings" description="System settings for the admin panel." />
      <ComingSoon screen="Settings" />
    </>
  ),
});
