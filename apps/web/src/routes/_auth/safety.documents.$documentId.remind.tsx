import { api } from "@usi-installer/backend/convex/_generated/api";
import type { Id } from "@usi-installer/backend/convex/_generated/dataModel";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";

import { ResultCard } from "@/components/whs/safety-form";
import { SafetyButton, SafetyPage } from "@/components/whs/safety-ui";
import { toUserMessage } from "@/lib/errors";

export const Route = createFileRoute("/_auth/safety/documents/$documentId/remind")({
  component: SendAcknowledgementReminder,
});

/** A6 Send Acknowledgement Reminder, real: only workers who haven't acknowledged the current version. */
function SendAcknowledgementReminder() {
  const { documentId } = Route.useParams();
  const doc = useQuery(api.documents.adminDetail, { document_id: documentId });
  const sendReminder = useMutation(api.documents.adminSendReminder);
  const navigate = useNavigate();
  const [sending, setSending] = useState(false);

  const outstanding = (doc?.acknowledgements ?? []).filter((ack) => ack.acknowledged_at === undefined);
  const byEntity = new Map<string, string[]>();
  for (const ack of outstanding) byEntity.set(ack.entity, [...(byEntity.get(ack.entity) ?? []), ack.worker]);

  const send = async () => {
    setSending(true);
    try {
      const result = await sendReminder({ document_id: documentId as Id<"whs_documents"> });
      if (result.emailed) toast.success(`Reminder sent to ${result.outstanding} ${result.outstanding === 1 ? "worker" : "workers"}`);
      else toast.info("Recorded, but not emailed: reminder emails are switched off on this deployment.");
      void navigate({ replace: true, to: "/safety/documents/$documentId", params: { documentId } });
    } catch (error) {
      toast.error(toUserMessage(error, "Could not send the reminder."));
    } finally {
      setSending(false);
    }
  };

  return (
    <SafetyPage
      title="Send Acknowledgement Reminder"
      description={`${doc?.title ?? ""} · ${doc?.current?.version ?? ""}`}
      back={{ to: "/safety/documents/$documentId", label: "Document details", params: { documentId } }}
    >
      <ResultCard
        title={`Remind ${outstanding.length} outstanding ${outstanding.length === 1 ? "worker" : "workers"}?`}
        message="Only workers who have not acknowledged this document version will receive the reminder. Acknowledged workers are excluded."
        items={[
          ...[...byEntity.entries()].map(([entity, workers]) => ({ label: entity, value: workers.join(" · ") })),
          { label: "Reminder includes", value: "Document name, version and a link to it in the app" },
        ]}
        actions={
          <>
            <SafetyButton variant="secondary" to="/safety/documents/$documentId" params={{ documentId }}>
              Cancel
            </SafetyButton>
            <SafetyButton onClick={() => void send()} disabled={sending || outstanding.length === 0}>
              {sending ? "Sending…" : "Send Reminder"}
            </SafetyButton>
          </>
        }
      />
    </SafetyPage>
  );
}
