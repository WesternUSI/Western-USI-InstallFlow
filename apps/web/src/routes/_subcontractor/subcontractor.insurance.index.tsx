import { api } from "@usi-installer/backend/convex/_generated/api";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";

import { Notice, PagedTable, Panel, RowAction, StatusBadge } from "@/components/whs/safety-ui";
import { SubPage } from "@/components/whs/subcontractor-portal";
import { formatIsoDate } from "@/lib/upload-file";
import { useListState } from "@/lib/use-list-state";

export const Route = createFileRoute("/_subcontractor/subcontractor/insurance/")({
  component: OurInsurance,
});

/**
 * S2 Our Insurance (framework 4C, 10): the company's own policies. The
 * Figma's search and status filter are left out; a company has a handful of
 * policies at most.
 */
function OurInsurance() {
  const policies = useQuery(api.subcontractorPortal.insurance);
  const company = useQuery(api.subcontractorPortal.company);
  const list = useListState();

  return (
    <SubPage title="Our Insurance" back={{ to: "/subcontractor", label: "Our Compliance" }}>
      <Panel>
        <PagedTable
          noun="policies"
          page={list.page}
          onPage={list.setPage}
          rows={policies ?? []}
          rowKey={(row) => row.id}
          empty={policies === undefined ? "Loading…" : "No insurance policies on file yet. Western USI adds them."}
          columns={[
            {
              key: "policy",
              header: "Policy",
              render: (row) => (
                <Link
                  to="/subcontractor/insurance/$policyId"
                  params={{ policyId: row.id }}
                  className="font-medium text-[#111827] hover:text-[#2563eb] hover:underline"
                >
                  {row.type}
                </Link>
              ),
            },
            { key: "insurer", header: "Insurer / coverage", render: (row) => `${row.insurer} · ${row.coverage}` },
            { key: "expiry", header: "Expiry", render: (row) => formatIsoDate(row.expires) },
            { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
            {
              key: "action",
              header: "Action",
              align: "right",
              render: (row) => (
                <RowAction to="/subcontractor/insurance/$policyId" params={{ policyId: row.id }}>
                  View policy
                </RowAction>
              ),
            },
          ]}
        />
      </Panel>
      <Notice tone="info">
        Business insurance belongs to {company?.name ?? "your company"}. Upload renewals here; Western USI checks and verifies them.
      </Notice>
    </SubPage>
  );
}
