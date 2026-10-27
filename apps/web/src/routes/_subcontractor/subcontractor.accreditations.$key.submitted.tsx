import { api } from "@usi-installer/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";

import { ResultCard } from "@/components/whs/safety-form";
import { Panel, SafetyButton, StatusBadge } from "@/components/whs/safety-ui";
import { SubPage } from "@/components/whs/subcontractor-portal";

export const Route = createFileRoute("/_subcontractor/subcontractor/accreditations/$key/submitted")({
  component: EvidenceSubmitted,
});

/** S25 Worker Evidence Submitted: the upload now waits for Western USI; earlier evidence is kept. */
function EvidenceSubmitted() {
  const { key } = Route.useParams();
  const detail = useQuery(api.subcontractorPortal.accreditation, { key });
  const back = { to: "/subcontractor/accreditations/$key", label: "Accreditation details", params: { key } };

  if (detail === undefined || detail === null) {
    return (
      <SubPage title="Worker Evidence Submitted" back={back}>
        <Panel className="p-6 text-sm text-[#64748b]">{detail === undefined ? "Loading…" : "This accreditation could not be found."}</Panel>
      </SubPage>
    );
  }

  return (
    <SubPage title="Worker Evidence Submitted" back={back}>
      <ResultCard
        title="Worker Evidence Submitted"
        badge={<StatusBadge status={detail.status} />}
        message="Your uploaded worker evidence is awaiting Western USI review. Any earlier evidence and review comments are kept."
        items={[
          { label: "Worker", value: detail.worker },
          { label: "Credential", value: detail.type },
          { label: "File", value: detail.evidence?.file_name ?? "—" },
          { label: "Submitted by", value: detail.evidence?.uploaded_by ?? "—" },
        ]}
        actions={
          <>
            <SafetyButton to="/subcontractor/workers/$workerId" params={{ workerId: detail.worker_id }}>
              Back to {detail.worker}
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
