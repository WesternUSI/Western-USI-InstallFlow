import { createFileRoute } from "@tanstack/react-router";

import { ComingSoon } from "@/components/coming-soon";
import { PageHeader } from "@/components/page-header";

export const Route = createFileRoute("/_auth/teams")({
  component: () => (
    <>
      <PageHeader title="Teams" description="Manage installation teams and their members." />
      <ComingSoon screen="Teams" />
    </>
  ),
});
