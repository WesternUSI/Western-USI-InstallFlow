import { api } from "@usi-installer/backend/convex/_generated/api";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useEffect } from "react";

import { NEEDS_ACTION } from "@/components/whs/management";
import { DetailGrid, Notice, PagedTable, Panel, RowAction, SectionTitle, StatCard, StatusBadge } from "@/components/whs/safety-ui";
import { SubPage, uploadAction } from "@/components/whs/subcontractor-portal";
import { formatIsoDate } from "@/lib/upload-file";
import { useListState } from "@/lib/use-list-state";

export const Route = createFileRoute("/_subcontractor/subcontractor/")({
  component: OurCompliance,
});

type Item = { kind: "insurance" | "accreditation"; name: string; related: string };

/** "Public Liability and Umar · First Aid", for a card's hint: a worker's item names the worker. */
function namesOf(items: Item[]): string {
  if (items.length === 0) return "Nothing outstanding";
  const names = items.slice(0, 2).map((item) => (item.kind === "accreditation" ? `${item.related} · ${item.name}` : item.name));
  return items.length > 2 ? `${names.join(", ")} and ${items.length - 2} more` : names.join(" and ");
}

/** The card filters on "Your next actions", with the words its heading shows. */
const FILTERS: Record<string, string> = {
  expired: "Expired requirements",
  missing: "Missing evidence",
  "action-required": "Evidence update needed",
};

/** Most urgent first in the next-actions list. */
const URGENCY = ["expired", "overdue", "missing", "action-required", "due-soon"];

/**
 * S1 Our Compliance (framework 10 "view their own business requirements",
 * 4D "overall compliance status"): the company's exceptions and the uploads
 * it needs to make. Each card opens the list behind it (framework 9): the
 * first three filter "Your next actions", SWMS opens the workers who still
 * have to sign. The Figma's Kit actions card and Export button are left out
 * (kits are the installers', exports are the admin's), and so are its Our
 * Insurance / Our Workers buttons: the sidebar has both, and above the list
 * they read as if they labelled it.
 */
function OurCompliance() {
  const data = useQuery(api.subcontractorPortal.overview);
  const business = useQuery(api.subcontractorPortal.business);
  const list = useListState();
  const filter = list.get("status");
  const items = data?.items ?? [];
  const count = (status: string) => (data === undefined ? "—" : items.filter((item) => item.status === status).length);
  const actions = items
    .filter((item) => uploadAction(item.status) !== undefined && (filter === "" || item.status === filter))
    .sort((a, b) => URGENCY.indexOf(a.status) - URGENCY.indexOf(b.status));
  const needsAction =
    items.some((item) => NEEDS_ACTION.includes(item.status)) || data?.agreement === "missing" || data?.agreement === "overdue";

  // A card opens the list below it: bring it into view.
  useEffect(() => {
    if (filter !== "") document.getElementById("next-actions")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [filter]);

  return (
    <SubPage title="Our Compliance">
      {data === undefined ? null : needsAction ? (
        <Notice tone="warning">
          Overall status: Action required.
          {data.agreement === "missing" || data.agreement === "overdue" ? " Your signed subcontractor agreement also needs updating; Western USI will contact you." : ""}
        </Notice>
      ) : (
        <Notice tone="success">Overall status: Compliant. Nothing needs your action.</Notice>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Expired requirements"
          value={count("expired")}
          hint={namesOf(items.filter((item) => item.status === "expired"))}
          tone="red"
          to="/subcontractor"
          search={{ status: "expired" }}
        />
        <StatCard
          label="Missing evidence"
          value={count("missing")}
          hint={namesOf(items.filter((item) => item.status === "missing"))}
          tone="red"
          to="/subcontractor"
          search={{ status: "missing" }}
        />
        <StatCard
          label="Evidence update needed"
          value={count("action-required")}
          hint={namesOf(items.filter((item) => item.status === "action-required"))}
          to="/subcontractor"
          search={{ status: "action-required" }}
        />
        <StatCard
          label="SWMS acknowledgements"
          value={data?.swms_outstanding ?? "—"}
          hint="Still to sign. Each worker acknowledges personally in the app"
          to="/subcontractor/workers"
          search={{ swms: "to-sign" }}
        />
        <StatCard label="Workers" value={data?.workers ?? "—"} hint="View your company's credentials" to="/subcontractor/workers" />
      </div>
      <div id="next-actions" className="flex scroll-mt-4 flex-wrap items-baseline justify-between gap-3">
        <SectionTitle>{FILTERS[filter] ? `Your next actions · ${FILTERS[filter]}` : "Your next actions"}</SectionTitle>
        {FILTERS[filter] ? (
          <Link to="/subcontractor" className="text-[13px] font-semibold text-[#2563eb] hover:underline">
            Show all
          </Link>
        ) : null}
      </div>
      <Panel>
        <PagedTable
          noun="actions"
          page={list.page}
          onPage={list.setPage}
          rows={actions}
          rowKey={(row) => `${row.kind}:${row.id}`}
          empty={data === undefined ? "Loading…" : FILTERS[filter] ? "Nothing here needs your action." : "Nothing needs your action."}
          columns={[
            {
              key: "requirement",
              header: "Requirement",
              render: (row) => (
                <Link
                  to={row.kind === "insurance" ? "/subcontractor/insurance/$policyId" : "/subcontractor/accreditations/$key"}
                  params={(row.kind === "insurance" ? { policyId: row.id } : { key: row.id }) as never}
                  className="font-medium text-[#111827] hover:text-[#2563eb] hover:underline"
                >
                  {row.name}
                </Link>
              ),
            },
            { key: "related", header: "Related to", render: (row) => row.related },
            { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
            {
              key: "action",
              header: "Action",
              align: "right",
              render: (row) =>
                row.kind === "insurance" ? (
                  <RowAction to="/subcontractor/insurance/$policyId/renew" params={{ policyId: row.id }}>
                    {uploadAction(row.status)}
                  </RowAction>
                ) : (
                  <RowAction to="/subcontractor/accreditations/$key/upload" params={{ key: row.id }}>
                    {uploadAction(row.status)}
                  </RowAction>
                ),
            },
          ]}
        />
      </Panel>

      <SectionTitle>Business details</SectionTitle>
      <Panel className="flex flex-col gap-4 p-6">
        <DetailGrid
          columns={3}
          items={[
            { label: "Business", value: business?.name ?? "—" },
            { label: "ABN", value: business?.abn ?? "Not recorded" },
            { label: "Primary contact", value: business?.contact_name ?? "Not recorded" },
            { label: "Contact email", value: business?.contact_email ?? "—" },
            { label: "Contact phone", value: business?.contact_phone ?? "—" },
            {
              label: "Signed subcontractor agreement",
              value:
                business === undefined ? (
                  "—"
                ) : (
                  <span className="flex flex-col items-start gap-1.5">
                    <StatusBadge status={business.agreement.status} />
                    {business.agreement.signed_on ? (
                      <span className="text-xs text-[#64748b]">
                        Signed {formatIsoDate(business.agreement.signed_on)} · review by {formatIsoDate(business.agreement.review_date)}
                      </span>
                    ) : null}
                    {business.agreement.file_url ? (
                      <a
                        href={business.agreement.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[13px] font-semibold text-[#2563eb] hover:underline"
                      >
                        Open agreement
                      </a>
                    ) : null}
                  </span>
                ),
            },
          ]}
        />
        <p className="text-xs text-[#64748b]">Western USI keeps these details. Contact your administrator if anything is out of date.</p>
      </Panel>
    </SubPage>
  );
}
