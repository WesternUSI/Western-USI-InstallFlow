import { api } from "@usi-installer/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";

import { ResultCard } from "@/components/whs/safety-form";
import { Panel, SafetyButton, StatusBadge } from "@/components/whs/safety-ui";
import { SubPage } from "@/components/whs/subcontractor-portal";

export const Route = createFileRoute("/_subcontractor/subcontractor/insurance/$policyId/submitted")({
  component: RenewalSubmitted,
});

/** S5 Renewal Submitted: the certificate now waits for Western USI; the previous one stays until it's verified. */
function RenewalSubmitted() {
  const { policyId } = Route.useParams();
  const policy = useQuery(api.subcontractorPortal.policy, { policy_id: policyId });
  const company = useQuery(api.subcontractorPortal.company);
  const back = { to: "/subcontractor/insurance/$policyId", label: "Policy details", params: { policyId } };

  if (policy === undefined || policy === null) {
    return (
      <SubPage title="Renewal Submitted" back={back}>
        <Panel className="p-6 text-sm text-[#64748b]">{policy === undefined ? "Loading…" : "This policy could not be found."}</Panel>
      </SubPage>
    );
  }
  const certificate = policy.certificate;

  return (
    <SubPage title="Renewal Submitted" back={back}>
      <ResultCard
        title="Renewal Submitted"
        badge={<StatusBadge status="awaiting-verification" />}
        message="Your certificate is awaiting review by Western USI. The previous certificate stays on record until the new one is verified."
        items={[
          { label: "Policy", value: policy.type },
          { label: "File", value: certificate?.file_name ?? "—" },
          { label: "Business", value: company?.name ?? policy.entity },
          { label: "Submitted by", value: certificate?.uploaded_by ?? "—" },
        ]}
        actions={
          <>
            <SafetyButton to="/subcontractor/insurance/$policyId" params={{ policyId }}>
              View Policy
            </SafetyButton>
            <SafetyButton variant="secondary" to="/subcontractor">
              Our Compliance
            </SafetyButton>
          </>
        }
      />
    </SubPage>
  );
}
