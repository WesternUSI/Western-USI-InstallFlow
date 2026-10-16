import { api } from "@usi-installer/backend/convex/_generated/api";
import type { Id } from "@usi-installer/backend/convex/_generated/dataModel";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";

import { Field, FieldRow, FormCard, TextArea, TextInput } from "@/components/whs/safety-form";
import { Notice, Panel, SafetyButton, SafetyPage } from "@/components/whs/safety-ui";
import { toUserMessage } from "@/lib/errors";
import { KIT_CHECKS } from "@/lib/kit-checks";
import { formatIsoDate } from "@/lib/upload-file";

export const Route = createFileRoute("/_auth/safety/kits/$kitId/corrective-action")({
  component: CorrectiveAction,
});

/**
 * FA3 Inspection & Corrective Action, real: the admin records what was done,
 * which ends Action required. The next inspection date doesn't change (K3);
 * no review step (K1).
 */
function CorrectiveAction() {
  const { kitId } = Route.useParams();
  const kit = useQuery(api.kits.adminDetail, { kit_id: kitId });
  const resolve = useMutation(api.kits.resolveIssue);
  const navigate = useNavigate();
  const [resolution, setResolution] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  if (kit === undefined || kit === null) {
    return (
      <SafetyPage title="Inspection & Corrective Action" description="" back={{ to: "/safety/kits", label: "First-Aid Kits" }}>
        <Panel className="p-6 text-sm text-[#64748b]">{kit === undefined ? "Loading…" : "This kit could not be found."}</Panel>
      </SafetyPage>
    );
  }

  const save = async () => {
    if (resolution.trim() === "") {
      setError("Describe what was done to fix it, e.g. the items replaced.");
      toast.error("Describe what was done to fix it, e.g. the items replaced.");
      return;
    }
    setSaving(true);
    try {
      await resolve({ kit_id: kitId as Id<"first_aid_kits">, resolution: resolution.trim() });
      toast.success("Corrective action completed", { description: `Next inspection still due ${formatIsoDate(kit.next_inspection)}.` });
      void navigate({ replace: true, to: "/safety/kits/$kitId", params: { kitId } });
    } catch (caught) {
      toast.error(toUserMessage(caught, "Could not save that."));
    } finally {
      setSaving(false);
    }
  };

  const open = kit.open_issue;
  return (
    <SafetyPage
      title="Inspection & Corrective Action"
      description={`Kit ${kit.code} · Inspection submitted by ${kit.latest?.inspected_by ?? "—"}`}
      back={{ to: "/safety/kits/$kitId", label: "Kit details", params: { kitId } }}
    >
      {open === null ? (
        <Notice tone="success">This kit has no open corrective action.</Notice>
      ) : (
        <FormCard title="Resolve the reported issues">
          <FieldRow>
            <Field label="Inspection date">
              <TextInput value={formatIsoDate(open.date)} onChange={() => undefined} />
            </Field>
            <Field label="Inspector">
              <TextInput value={kit.latest?.inspected_by ?? "—"} onChange={() => undefined} />
            </Field>
          </FieldRow>
          <Field label="Finding">
            <TextInput value={open.checks.map((check) => KIT_CHECKS[check] ?? check).join("; ")} onChange={() => undefined} />
          </Field>
          <Field label="Corrective action needed">
            <TextInput value={open.corrective_action ?? "—"} onChange={() => undefined} />
          </Field>
          <Field label="What was done" required error={error}>
            <TextArea
              value={resolution}
              onChange={(value) => {
                setResolution(value);
                setError(undefined);
              }}
              placeholder="e.g. Replaced the burn gel and restocked the eye wash."
              invalid={!!error}
            />
          </Field>
          <Notice tone="info">Marking it completed ends Action required. The next inspection date doesn't change. Inspection and resolution history are kept.</Notice>
          <div className="flex flex-wrap gap-3">
            <SafetyButton variant="secondary" to="/safety/kits/$kitId" params={{ kitId }}>
              Cancel
            </SafetyButton>
            <SafetyButton onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : "Mark Completed"}
            </SafetyButton>
          </div>
        </FormCard>
      )}
    </SafetyPage>
  );
}
