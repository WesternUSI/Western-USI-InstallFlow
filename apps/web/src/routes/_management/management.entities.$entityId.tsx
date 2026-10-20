import { api } from "@usi-installer/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import type { ReactNode } from "react";

import { MgmtPage, NEEDS_ACTION, mgmtRecordRoute } from "@/components/whs/management";
import { Notice, PagedTable, Panel, RowAction, type SafetyStatus, SectionTitle, StatCard, StatusBadge } from "@/components/whs/safety-ui";
import { WESTERN_USI_ID, useAgreement, useSubcontractor } from "@/components/whs/subcontractor-header";
import { formatIsoDate } from "@/lib/upload-file";
import { toVerify, useRegister } from "@/lib/use-register";

export const Route = createFileRoute("/_management/management/entities/$entityId")({
  component: EntityCompliance,
});

interface RequirementRow {
  key: string;
  requirement: string;
  details: string;
  status: SafetyStatus;
  statusLabel?: string;
  action: ReactNode;
}

/**
 * M4 One entity for management (framework 4D, decision AD43): its overall
 * status, the business requirements (insurance, signed agreement, SWMS
 * signatures) and each worker's accreditations. Read-only; each line opens
 * its record.
 */
function EntityCompliance() {
  const { entityId } = Route.useParams();
  const { subcontractor, isWesternUsi, loading } = useSubcontractor(entityId);
  const register = useRegister();
  const policies = useQuery(api.insurance.list);
  const agreement = useAgreement(entityId);
  const documents = useQuery(api.documents.forEntity, { entity: entityId === WESTERN_USI_ID ? "western-usi" : entityId });
  const name = subcontractor?.name ?? "Entity";
  const rows = (register?.rows ?? []).filter((row) => row.entity === name);
  const back = { to: "/management/entities", label: "Entities" };

  if (subcontractor === undefined) {
    return (
      <MgmtPage title="Entity" back={back}>
        <Panel className="p-6 text-sm text-[#64748b]">{loading ? "Loading…" : "This entity could not be found."}</Panel>
      </MgmtPage>
    );
  }

  // Business requirements: insurance, the signed agreement, SWMS signatures.
  const requirements: RequirementRow[] = [];
  for (const row of rows.filter((entry) => entry.category === "insurance")) {
    const policy = policies?.find((entry) => entry.id === row.id);
    const route = mgmtRecordRoute(row);
    requirements.push({
      key: row.id,
      requirement: row.name,
      details: policy ? `${policy.insurer} · ${policy.coverage}` : "—",
      status: row.status,
      action: (
        <RowAction to={route.to as never} params={route.params}>
          {toVerify(row) ? "Review" : "View policy"}
        </RowAction>
      ),
    });
  }
  if (!isWesternUsi && agreement !== undefined) {
    requirements.push({
      key: "agreement",
      requirement: "Signed subcontractor agreement",
      details:
        agreement.current === null
          ? "Not on file"
          : `Signed ${formatIsoDate(agreement.current.signed_on)} · review ${formatIsoDate(agreement.current.review_date)}`,
      status: agreement.status,
      statusLabel: agreement.status === "missing" ? "Not on file" : undefined,
      action: agreement.current?.file_url ? (
        <RowAction onClick={() => window.open(agreement.current?.file_url ?? "", "_blank", "noopener")}>Open file</RowAction>
      ) : (
        <span className="text-[13px] text-[#64748b]">Admin uploads it</span>
      ),
    });
  }
  for (const document of (documents?.assigned ?? []).filter((entry) => entry.kind === "swms" && entry.acknowledgement_required)) {
    requirements.push({
      key: document.id,
      requirement: "SWMS acknowledgements",
      details: `${document.title}${document.version ? ` · ${document.version}` : ""}`,
      status: document.asked > 0 && document.signed < document.asked ? "action-required" : "current",
      statusLabel: document.asked === 0 ? "No installers" : `${document.signed} of ${document.asked} signed`,
      action: (
        <RowAction to="/management/documents/$documentId" params={{ documentId: document.id }}>
          View progress
        </RowAction>
      ),
    });
  }

  // Workers and their accreditations.
  const accreditations = rows.filter((row) => row.category === "accreditation");
  const workers = [...new Set(accreditations.map((row) => row.worker_id).filter((id): id is string => !!id))].map((workerId) => {
    const own = accreditations.filter((row) => row.worker_id === workerId);
    return {
      workerId,
      name: own[0]?.person ?? "Worker",
      current: own.filter((row) => row.status === "current" || row.status === "due-soon").map((row) => row.name),
      problems: own
        .filter((row) => row.status === "missing" || row.status === "expired" || row.status === "overdue" || row.status === "action-required")
        .map((row) => `${row.name} ${row.status === "missing" ? "missing" : row.status === "action-required" ? "needs new evidence" : "expired"}`),
    };
  });

  const businessProblems = requirements.filter((row) => NEEDS_ACTION.includes(row.status)).length;
  const toCheck = rows.filter(toVerify).length;
  const problems = [
    ...requirements
      .filter((row) => NEEDS_ACTION.includes(row.status))
      .map((row) => `${row.requirement === "SWMS acknowledgements" ? row.details : row.requirement}: ${(row.statusLabel ?? row.status.replace("-", " ")).toLowerCase()}`),
    ...workers.flatMap((worker) => worker.problems.map((problem) => `${worker.name}: ${problem}`)),
  ];

  return (
    <MgmtPage title={name} description={`Management · ${isWesternUsi ? "The company itself" : subcontractor.abn ? `ABN ${subcontractor.abn}` : "No ABN recorded"}`} back={back}>
      {register === undefined ? null : problems.length > 0 ? (
        <Notice tone="warning">
          Action required · {problems.slice(0, 4).join(", ")}
          {problems.length > 4 ? ` and ${problems.length - 4} more` : ""}.
        </Notice>
      ) : (
        <Notice tone="success">Everything recorded for {name} is current.</Notice>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Business requirements" value={businessProblems} hint="Needing action" tone={businessProblems > 0 ? "red" : "green"} />
        <StatCard label="Workers" value={workers.length} hint={workers.length === 0 ? "No workers yet" : workers.map((worker) => worker.name).slice(0, 3).join(", ")} />
        <StatCard
          label="Awaiting verification"
          value={toCheck}
          hint="Evidence waiting for you to check"
          to="/management/exceptions"
          search={{ entity: name, status: "to-verify" }}
        />
      </div>

      <SectionTitle>Business requirements</SectionTitle>
      <Panel>
        <PagedTable
          noun="requirements"
          rows={requirements}
          rowKey={(row) => row.key}
          empty={register === undefined ? "Loading…" : "No business requirements recorded."}
          columns={[
            { key: "requirement", header: "Requirement", render: (row) => <span className="text-[#111827]">{row.requirement}</span> },
            { key: "details", header: "Details", render: (row) => <span className="text-[13px]">{row.details}</span> },
            { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} label={row.statusLabel} /> },
            { key: "action", header: "Action", align: "right", render: (row) => row.action },
          ]}
        />
      </Panel>

      <SectionTitle>Workers and accreditations</SectionTitle>
      <Panel>
        <PagedTable
          noun="workers"
          rows={workers}
          rowKey={(row) => row.workerId}
          empty={register === undefined ? "Loading…" : "No workers yet."}
          columns={[
            { key: "worker", header: "Worker", render: (row) => <span className="text-[#111827]">{row.name}</span> },
            { key: "current", header: "Current", render: (row) => <span className="text-[13px]">{row.current.join(", ") || "—"}</span> },
            {
              key: "problems",
              header: "Expired / missing",
              render: (row) => <span className={row.problems.length > 0 ? "text-[13px] text-[#dc2626]" : "text-[13px] text-[#64748b]"}>{row.problems.join(", ") || "None"}</span>,
            },
            {
              key: "action",
              header: "Action",
              align: "right",
              render: (row) => (
                <RowAction to="/management/workers/$workerId" params={{ workerId: row.workerId }}>
                  View worker
                </RowAction>
              ),
            },
          ]}
        />
      </Panel>
    </MgmtPage>
  );
}
