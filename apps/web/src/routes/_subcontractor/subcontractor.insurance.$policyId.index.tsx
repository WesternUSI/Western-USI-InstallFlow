import { api } from "@usi-installer/backend/convex/_generated/api";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";

import { ACTIVITY_TEXT, ActivityPanel, ReminderScheduleCard } from "@/components/whs/management";
import { DetailsLayout, EvidencePreview, SideButton, SideCard } from "@/components/whs/record-cards";
import { DetailGrid, Notice, PagedTable, Panel, SectionTitle, StatusBadge, reminderText } from "@/components/whs/safety-ui";
import { SubPage, uploadAction } from "@/components/whs/subcontractor-portal";
import { formatIsoDate } from "@/lib/upload-file";

export const Route = createFileRoute("/_subcontractor/subcontractor/insurance/$policyId/")({
  component: OurPolicy,
});

/**
 * S3 One of the company's policies (framework 4C), with S6 Policy History as
 * its "Previous certificates" section: earlier certificates are kept, never
 * overwritten. Read-only; Upload Renewal opens S4. The contact never verifies.
 */
function OurPolicy() {
  const { policyId } = Route.useParams();
  const policy = useQuery(api.subcontractorPortal.policy, { policy_id: policyId });
  const company = useQuery(api.subcontractorPortal.company);
  const navigate = useNavigate();
  const back = { to: "/subcontractor/insurance", label: "Our Insurance" };

  if (policy === undefined || policy === null) {
    return (
      <SubPage title="Policy" back={back}>
        <Panel className="p-6 text-sm text-[#64748b]">{policy === undefined ? "Loading…" : "This policy could not be found."}</Panel>
      </SubPage>
    );
  }
  const certificate = policy.certificate;
  const waiting = policy.pending_certificate_id !== undefined;
  const action = waiting ? undefined : uploadAction(policy.status);

  return (
    <SubPage title={policy.type} back={back}>
      {policy.status === "action-required" && certificate?.rejected_reason ? (
        <Notice tone="danger">Western USI asked for a new certificate: {certificate.rejected_reason}</Notice>
      ) : null}
      {waiting ? <Notice tone="info">Your certificate is waiting for Western USI to check it. Nothing else is needed from you.</Notice> : null}
      <DetailsLayout
        main={
          <>
            <Panel className="flex flex-col gap-4 p-6">
              <div className="flex items-start justify-between gap-4">
                <h2 className="text-lg font-semibold text-[#111827]">{policy.type}</h2>
                <StatusBadge status={policy.status} />
              </div>
              <DetailGrid
                columns={2}
                items={[
                  { label: "Business", value: company?.name ?? policy.entity },
                  { label: "Policy number", value: policy.policy_number ?? "—" },
                  { label: "Insurer", value: policy.insurer },
                  { label: "Coverage", value: policy.coverage },
                  { label: "Start date", value: formatIsoDate(certificate?.start) },
                  { label: "Expiry", value: formatIsoDate(certificate?.expires) },
                ]}
              />
            </Panel>
            {action ? (
              <Panel className="flex flex-col gap-2 p-6">
                <h3 className="text-base font-semibold text-[#111827]">What happens next</h3>
                <p className="text-[13px] text-[#64748b]">
                  Upload the new certificate of currency. Western USI checks it, confirms the dates and updates the policy. The previous certificate is kept.
                </p>
              </Panel>
            ) : null}
            <ActivityPanel
              lines={policy.activity.map((entry) => ({ at: entry.at, text: ACTIVITY_TEXT[entry.action] ?? entry.action, by: entry.by, details: entry.details }))}
            />
            <SectionTitle>Previous certificates</SectionTitle>
            <Panel>
              <PagedTable
                noun="certificates"
                rows={policy.history}
                rowKey={(row) => `${row.file_name}:${row.start}:${row.expires}`}
                empty="No earlier certificates."
                columns={[
                  { key: "file", header: "Certificate", render: (row) => <span className="text-[#111827]">{row.file_name}</span> },
                  { key: "start", header: "Start", render: (row) => formatIsoDate(row.start) },
                  { key: "expires", header: "Expiry", render: (row) => formatIsoDate(row.expires) },
                ]}
              />
            </Panel>
          </>
        }
        side={
          <>
            <SideCard title="Evidence">
              <EvidencePreview fileName={certificate?.file_name ?? "No certificate"} />
              {certificate?.url ? <SideButton onClick={() => window.open(certificate.url ?? "", "_blank", "noopener")}>Open Certificate</SideButton> : null}
              {action ? (
                <SideButton filled onClick={() => void navigate({ to: "/subcontractor/insurance/$policyId/renew", params: { policyId } })}>
                  Upload Renewal
                </SideButton>
              ) : null}
            </SideCard>
            <ReminderScheduleCard text={reminderText([60, 30, 14, 7], "expiry")} />
          </>
        }
      />
    </SubPage>
  );
}
