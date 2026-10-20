import { api } from "@usi-installer/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";

import { MgmtPage, entityNeedsAction, mgmtEntityParams } from "@/components/whs/management";
import { Notice, PagedTable, Panel, RowAction, SectionTitle, StatCard, StatusBadge } from "@/components/whs/safety-ui";
import { dueWithin, isOverdue, toVerify, useRegister } from "@/lib/use-register";

export const Route = createFileRoute("/_management/management/")({
  component: ComplianceOverview,
});

/** Today plus `days`, `YYYY-MM-DD`, for the "Due within 30 days" card's range. */
function isoDaysFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * M1 Compliance Overview (framework 3 "Management view"; decision AD43): a
 * short overview that leads with exceptions. Each card opens the Exceptions
 * list filtered to it, like the admin dashboard; the Figma's three buttons are
 * left out (the cards and the sidebar already reach the same lists).
 */
function ComplianceOverview() {
  const register = useRegister();
  const subcontractors = useQuery(api.subcontractors.list);
  const agreements = useQuery(api.agreements.statuses);
  const rows = register?.rows ?? [];
  const todayIso = register?.today ?? "";
  const count = (predicate: (row: (typeof rows)[number]) => boolean) => (register === undefined ? "—" : rows.filter(predicate).length);
  const changesToReview = rows.reduce((total, row) => total + (row.changes_to_review ?? 0), 0);
  const entities = [
    { key: "western-usi", name: "Western USI", subcontractorId: undefined as string | undefined },
    ...(subcontractors ?? []).map((row) => ({ key: row._id, name: row.name, subcontractorId: row._id as string | undefined })),
  ];
  const perEntity = (name: string, predicate: (row: (typeof rows)[number]) => boolean) =>
    register === undefined ? "—" : rows.filter((row) => row.entity === name && predicate(row)).length;

  return (
    <MgmtPage title="Compliance Overview">
      <Notice tone="info">Review exceptions across all entities. You can verify evidence and approve on-site SWMS changes that are waiting.</Notice>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Overdue or expired" value={count(isOverdue)} hint="Across Western USI and subcontractors" tone="red" to="/management/exceptions" search={{ status: "overdue" }} />
        <StatCard
          label="Due within 30 days"
          value={count((row) => dueWithin(row, todayIso, 30))}
          hint="Upcoming renewals and inspections"
          to="/management/exceptions"
          search={{ status: "everything", from: isoDaysFromNow(0), to: isoDaysFromNow(30) }}
        />
        <StatCard label="Missing documents" value={count((row) => row.status === "missing")} hint="Required evidence not supplied" tone="red" to="/management/exceptions" search={{ status: "missing" }} />
        <StatCard label="Awaiting verification" value={count(toVerify)} hint="Evidence waiting for you to check" to="/management/exceptions" search={{ status: "to-verify" }} />
        <StatCard
          label="SWMS acknowledgements"
          value={count((row) => row.category === "swms" && (row.outstanding ?? 0) > 0)}
          hint="SWMS with workers still to sign"
          to="/management/exceptions"
          search={{ category: "swms", status: "acks-outstanding" }}
        />
        <StatCard
          label="Kit inspections due"
          value={count((row) => row.category === "first-aid" && row.status !== "current")}
          hint="Assigned installers complete inspections"
          to="/management/exceptions"
          search={{ category: "first-aid", status: "needs-action" }}
        />
        {changesToReview > 0 ? (
          // Only while something waits, as on the admin dashboard (decision D3); management can approve them (AD43).
          <StatCard
            label="On-site changes to review"
            value={changesToReview}
            hint="SWMS changes recorded on site"
            tone="amber"
            to="/management/exceptions"
            search={{ category: "swms", status: "changes-to-review" }}
          />
        ) : null}
      </div>

      <SectionTitle>Compliance by entity</SectionTitle>
      <Panel>
        <PagedTable
          rows={entities}
          rowKey={(row) => row.key}
          empty={subcontractors === undefined ? "Loading…" : "No entities yet."}
          columns={[
            { key: "entity", header: "Entity", render: (row) => <span className="text-[#111827]">{row.name}</span> },
            { key: "overdue", header: "Overdue", render: (row) => perEntity(row.name, isOverdue) },
            { key: "due", header: "Due soon", render: (row) => perEntity(row.name, (entry) => entry.status === "due-soon") },
            { key: "missing", header: "Missing", render: (row) => perEntity(row.name, (entry) => entry.status === "missing") },
            {
              key: "overall",
              header: "Overall",
              render: (row) =>
                register === undefined ? "—" : entityNeedsAction(rows, row.name, row.subcontractorId, agreements) ? (
                  <StatusBadge status="action-required" />
                ) : (
                  <StatusBadge status="current" label="Compliant" />
                ),
            },
            {
              key: "action",
              header: "Action",
              align: "right",
              render: (row) => (
                <RowAction to="/management/entities/$entityId" params={mgmtEntityParams(row.subcontractorId)}>
                  View entity
                </RowAction>
              ),
            },
          ]}
        />
      </Panel>
    </MgmtPage>
  );
}
