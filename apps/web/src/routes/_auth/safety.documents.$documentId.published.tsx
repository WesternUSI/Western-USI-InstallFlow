import { api } from "@usi-installer/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";

import { PublishedBadge, ResultCard } from "@/components/whs/safety-form";
import { SafetyButton, SafetyPage } from "@/components/whs/safety-ui";
import { formatIsoDate } from "@/lib/upload-file";

export const Route = createFileRoute("/_auth/safety/documents/$documentId/published")({
  validateSearch: (search: Record<string, unknown>): { version?: string } => ({
    version: typeof search.version === "string" ? search.version : undefined,
  }),
  component: VersionPublished,
});

/** A5 Document Version Published, real data. */
function VersionPublished() {
  const { documentId } = Route.useParams();
  const doc = useQuery(api.documents.adminDetail, { document_id: documentId });
  const previous = doc?.history[0]?.version;
  const acknowledged = doc?.acknowledgements.filter((ack) => ack.acknowledged_at !== undefined).length ?? 0;

  return (
    <SafetyPage title="Document Version Published" description={doc?.title ?? ""}>
      <ResultCard
        title="Document Version Published"
        badge={<PublishedBadge>Published</PublishedBadge>}
        message={`Version ${doc?.current?.version ?? ""} is now available to workers.${previous ? ` Version ${previous} has been marked Superseded and retained in history.` : ""}`}
        items={[
          { label: "New version", value: doc?.current?.version ?? "—" },
          { label: "Review due", value: formatIsoDate(doc?.current?.review_date) },
          { label: "Acknowledgements", value: doc?.acknowledgement_required ? `${acknowledged} of ${doc.acknowledgements.length} acknowledged` : "Not required" },
          { label: "Responsible person", value: doc?.responsible ?? "The admin list" },
        ]}
        actions={
          <>
            <SafetyButton to="/safety/documents/$documentId" params={{ documentId }}>
              View Document
            </SafetyButton>
            <SafetyButton variant="secondary" to="/safety/documents">
              Back to Documents
            </SafetyButton>
          </>
        }
      />
    </SafetyPage>
  );
}
