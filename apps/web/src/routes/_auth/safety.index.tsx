import { api } from "@usi-installer/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";

import { PagedTable, Panel, RowAction, SafetyButton, SafetyPage, SectionTitle, StatCard } from "@/components/whs/safety-ui";
import { WESTERN_USI_ID } from "@/components/whs/subcontractor-header";
import { dueWithin, isOverdue, toVerify, useRegister } from "@/lib/use-register";

/** Today plus `days`, `YYYY-MM-DD`, for the "Due within" cards' date range. */
function isoDaysFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export const Route = createFileRoute("/_auth/safety/")({
  component: SafetyDashboard,
});

/**
 * A1 Safety Dashboard. Leads with exceptions, not the full register
 * (framework 9). The cards are the framework's list; the Figma's "Out of
 * service" and "Records in register" are kept as well. Sample numbers for now.
 */
function SafetyDashboard() {
  const register = useRegister();
  const rows = register?.rows ?? [];
  const count = (predicate: (row: (typeof rows)[number]) => boolean) => (register === undefined ? "—" : rows.filter(predicate).length);
  const todayIso = register?.today ?? "";
  const changesToReview = rows.reduce((total, row) => total + (row.changes_to_review ?? 0), 0);
  const today = isoDaysFromNow(0);
  const in30 = isoDaysFromNow(30);
  const in60 = isoDaysFromNow(60);
  const subcontractors = useQuery(api.subcontractors.list);
  const perEntity = (name: string, predicate: (row: (typeof rows)[number]) => boolean) =>
    register === undefined ? "—" : rows.filter((row) => row.entity === name && predicate(row)).length;
  // The real entities: Western USI, then every subcontractor on record.
  const entities: { key: string; name: string; subcontractorId?: string }[] = [
    { key: "western-usi", name: "Western USI" },
    ...(subcontractors ?? []).map((row) => ({ key: row._id, name: row.name, subcontractorId: row._id })),
  ];
  return (
    <SafetyPage
      title="Safety Dashboard"
      description="Track compliance, resolve exceptions and keep your teams ready for work."
      action={<SafetyButton to="/safety/records/new">+ Add Record</SafetyButton>}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Overdue or expired" value={count(isOverdue)} hint="Items past their due date" tone="red" to="/safety/register" search={{ status: "overdue" }} />
        <StatCard label="Due within 30 days" value={count((row) => dueWithin(row, todayIso, 30))} hint="Plan upcoming renewals" to="/safety/register" search={{ from: today, to: in30 }} />
        <StatCard label="Due within 60 days" value={count((row) => dueWithin(row, todayIso, 60))} hint="Renewals coming up next" to="/safety/register" search={{ from: today, to: in60 }} />
        <StatCard label="Missing documents" value={count((row) => row.status === "missing")} hint="Required evidence not supplied" tone="red" to="/safety/register" search={{ status: "missing" }} />
        <StatCard label="Awaiting verification" value={count((row) => row.status === "awaiting-verification")} hint="Review uploaded evidence" to="/safety/register" search={{ status: "awaiting-verification" }} />
        <StatCard label="Renewals in progress" value={count((row) => row.status === "renewal-in-progress")} hint="New evidence being checked" to="/safety/register" search={{ status: "renewal-in-progress" }} />
        <StatCard label="SWMS acknowledgements outstanding" value={count((row) => row.category === "swms" && (row.outstanding ?? 0) > 0)} hint="Documents with outstanding workers" to="/safety/register" search={{ category: "swms", status: "acks-outstanding" }} />
        <StatCard label="First-aid inspections due" value={count((row) => row.category === "first-aid" && row.status !== "current")} hint="Follow up with assigned installers" to="/safety/register" search={{ category: "first-aid", status: "needs-action" }} />
        <StatCard label="Vehicle actions required" value={count((row) => row.category === "vehicle" && row.status !== "current")} hint="Service, registration or insurance" to="/safety/register" search={{ category: "vehicle", status: "needs-action" }} />
        {changesToReview > 0 ? (
          // Only shown while there is something to review (decision D3), so the usual view keeps the framework's nine cards.
          <StatCard
            label="On-site changes to review"
            value={changesToReview}
            hint="SWMS changes recorded on site"
            tone="amber"
            to="/safety/register"
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
            { key: "verify", header: "To verify", render: (row) => perEntity(row.name, toVerify) },
            {
              key: "action",
              header: "Action",
              align: "right",
              render: (row) => (
                <RowAction to="/safety/subcontractors/$subcontractorId" params={{ subcontractorId: row.subcontractorId ?? WESTERN_USI_ID }}>
                  Open entity
                </RowAction>
              ),
            },
          ]}
        />
      </Panel>
    </SafetyPage>
  );
}
