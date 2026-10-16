import { api } from "@usi-installer/backend/convex/_generated/api";
import type { Id } from "@usi-installer/backend/convex/_generated/dataModel";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { toast } from "sonner";

import { DetailsLayout, EvidencePreview, SideButton, SideCard } from "@/components/whs/record-cards";
import { ArchivedNotice, EditRecordDialog, ManageRecordCard } from "@/components/whs/record-admin";
import { Field, FieldRow, SelectInput, TextArea, TextInput } from "@/components/whs/safety-form";
import { DetailGrid, Notice, Panel, SafetyButton, SafetyPage, StatusBadge, reminderText } from "@/components/whs/safety-ui";
import { toUserMessage } from "@/lib/errors";
import { formatIsoDate, formatTime } from "@/lib/upload-file";
import { useResponsiblePeople } from "@/lib/use-people";

export const Route = createFileRoute("/_auth/safety/insurance/$policyId/")({
  validateSearch: (search: Record<string, unknown>): { renewed?: boolean } => ({
    renewed: search.renewed === true || search.renewed === "true" ? true : undefined,
  }),
  component: PolicyDetails,
});

const ACTION_TEXT: Record<string, string> = {
  added: "Policy added",
  uploaded: "Certificate uploaded",
  verified: "Verified",
  rejected: "Replacement requested",
  superseded: "Previous certificate retained",
  reminder_sent: "Reminder sent",
  escalated: "Escalated to management",
  edited: "Details changed",
  archived: "Archived",
};

/** SC04/SC08 Policy details, real (framework 4C). Previous certificates are kept, never overwritten. */
function PolicyDetails() {
  const { policyId } = Route.useParams();
  const { renewed } = Route.useSearch();
  const policy = useQuery(api.insurance.adminDetail, { policy_id: policyId });
  const archive = useMutation(api.insurance.adminArchive);
  const [editing, setEditing] = useState(false);

  if (policy === undefined || policy === null) {
    return (
      <SafetyPage title="Policy" description="" back={{ to: "/safety/insurance", label: "Insurance Register" }}>
        <Panel className="p-6 text-sm text-[#64748b]">{policy === undefined ? "Loading…" : "This policy could not be found."}</Panel>
      </SafetyPage>
    );
  }
  const certificate = policy.certificate;
  const waiting = policy.pending_certificate_id !== undefined;

  return (
    <SafetyPage title={policy.type} description={policy.entity} back={{ to: "/safety/insurance", label: "Insurance Register" }}>
      {policy.archived ? <ArchivedNotice noun="policy" /> : null}
      {renewed ? <Notice tone="success">Renewal verified · Previous certificate retained; future reminders scheduled automatically.</Notice> : null}
      <DetailsLayout
        main={
          <>
            <Panel className="flex flex-col gap-4 p-6">
              <div className="flex items-start justify-between gap-4">
                <h2 className="text-lg font-semibold text-[#111827]">Record details</h2>
                <StatusBadge status={policy.status} />
              </div>
              <DetailGrid
                columns={2}
                items={[
                  { label: "Insured entity", value: policy.entity },
                  { label: "Policy number", value: policy.policy_number ?? "—" },
                  { label: "Insurer", value: policy.insurer },
                  { label: "Coverage", value: policy.coverage },
                  { label: "Policy start", value: formatIsoDate(certificate?.start) },
                  { label: "Expiry", value: formatIsoDate(certificate?.expires) },
                  { label: "Responsible person", value: policy.responsible ?? "The admin list" },
                  { label: "Reminders", value: reminderText([60, 30, 14, 7], "expiry") },
                  { label: "Verification", value: certificate?.verified_by ? `${certificate.verified_by} · ${formatTime(certificate.verified_at)}` : waiting ? "Waiting to be checked" : "—" },
                ]}
              />
            </Panel>
            {policy.status === "expired" ? (
              <Notice tone="danger">This policy has expired. Upload the renewed certificate of currency.</Notice>
            ) : null}
            {policy.status === "action-required" && certificate?.rejected_reason ? (
              <Notice tone="danger">Replacement requested: {certificate.rejected_reason}</Notice>
            ) : null}
            {policy.history.length > 0 ? (
              <Panel className="flex flex-col gap-2 p-6">
                <h3 className="text-base font-semibold text-[#111827]">Previous certificates</h3>
                {policy.history.map((entry) => (
                  <p key={`${entry.start}-${entry.expires}`} className="text-xs text-[#64748b]">
                    {formatIsoDate(entry.start)} – {formatIsoDate(entry.expires)} · {entry.file_name}
                  </p>
                ))}
              </Panel>
            ) : null}
            <Panel className="flex flex-col gap-4 p-6">
              <h3 className="text-base font-semibold text-[#111827]">Recent activity</h3>
              {policy.activity.map((entry) => (
                <p key={`${entry.at}-${entry.action}`} className="text-xs text-[#64748b]">
                  {formatTime(entry.at)} · {ACTION_TEXT[entry.action] ?? entry.action}
                  {entry.by ? ` by ${entry.by}` : ""}
                  {entry.details ? ` · ${entry.details}` : ""}
                </p>
              ))}
            </Panel>
          </>
        }
        side={
          <>
            <SideCard title="Evidence">
              <EvidencePreview fileName={certificate?.file_name ?? "No certificate"} />
              {certificate?.url ? <SideButton onClick={() => window.open(certificate.url ?? "", "_blank", "noopener")}>Open Document</SideButton> : null}
              {waiting && policy.can_manage ? (
                <SafetyButton to="/safety/insurance/$policyId/verify" params={{ policyId }} className="w-full rounded-[8px] text-xs">
                  Verify Evidence
                </SafetyButton>
              ) : null}
              {!waiting && policy.can_manage ? (
                <SafetyButton
                  to="/safety/insurance/$policyId/renew"
                  params={{ policyId }}
                  className={policy.status === "current" ? "w-full rounded-[8px] text-xs" : "w-full rounded-[8px] bg-[#dc2626] text-xs hover:bg-[#b91c1c]"}
                >
                  Upload Renewal
                </SafetyButton>
              ) : null}
            </SideCard>
            {policy.can_manage ? (
              <ManageRecordCard
                noun="policy"
                onEdit={() => setEditing(true)}
                onArchive={async (reason) => {
                  try {
                    await archive({ policy_id: policy.id, reason });
                    toast.success(`${policy.type} archived`);
                  } catch (error) {
                    toast.error(toUserMessage(error, "Could not archive that policy."));
                    throw error;
                  }
                }}
              />
            ) : null}
          </>
        }
      />
      {policy.can_manage && certificate ? <EditPolicyDialog policy={policy} open={editing} onClose={() => setEditing(false)} /> : null}
    </SafetyPage>
  );
}

type PolicyDetail = NonNullable<FunctionReturnType<typeof api.insurance.adminDetail>>;
type PolicyErrors = Partial<Record<"insurer" | "coverage" | "start" | "expires", string>>;

/** Edit Details for a policy and its current certificate's dates (decision AD32). A new certificate is a renewal instead. */
function EditPolicyDialog({ policy, open, onClose }: { policy: PolicyDetail; open: boolean; onClose: () => void }) {
  const edit = useMutation(api.insurance.adminEdit);
  const people = useResponsiblePeople();
  const initial = () => ({
    insurer: policy.insurer,
    number: policy.policy_number ?? "",
    coverage: policy.coverage,
    start: policy.certificate?.start ?? "",
    expires: policy.certificate?.expires ?? "",
    responsible: (policy.responsible_id as string | undefined) ?? "",
    notes: policy.notes ?? "",
  });
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<PolicyErrors>({});
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setForm(initial());
      setErrors({});
    }
  }
  const set = (key: keyof ReturnType<typeof initial>) => (value: string) => setForm((current) => ({ ...current, [key]: value }));

  const save = async (reason: string) => {
    const found: PolicyErrors = {};
    if (form.insurer.trim() === "") found.insurer = "Enter the insurer";
    if (form.coverage.trim() === "") found.coverage = "Enter the coverage";
    if (form.start === "") found.start = "Select the policy start date";
    if (form.expires === "") found.expires = "Select the expiry date";
    else if (form.start !== "" && form.expires <= form.start) found.expires = "The expiry date must be after the start date";
    setErrors(found);
    const first = Object.values(found)[0];
    if (first) {
      toast.error(first);
      return false;
    }
    try {
      await edit({
        policy_id: policy.id,
        insurer: form.insurer.trim(),
        policy_number: form.number.trim() || undefined,
        coverage: form.coverage.trim(),
        responsible_user_id: form.responsible === "" ? null : (form.responsible as Id<"users">),
        notes: form.notes.trim() || undefined,
        start: form.start,
        expires: form.expires,
        reason,
      });
      toast.success("Changes saved");
      return true;
    } catch (error) {
      toast.error(toUserMessage(error, "Could not save those changes."));
      return false;
    }
  };

  return (
    <EditRecordDialog open={open} title={`Edit ${policy.type}`} onClose={onClose} onSave={save}>
      <FieldRow>
        <Field label="Insurer" required error={errors.insurer}>
          <TextInput value={form.insurer} onChange={set("insurer")} invalid={!!errors.insurer} />
        </Field>
        <Field label="Policy number">
          <TextInput value={form.number} onChange={set("number")} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Coverage" required error={errors.coverage}>
          <TextInput value={form.coverage} onChange={set("coverage")} invalid={!!errors.coverage} />
        </Field>
        <Field label="Responsible person">
          <SelectInput value={form.responsible} onChange={set("responsible")} options={people} placeholder="The admin list" />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Policy start date" required error={errors.start}>
          <TextInput type="date" value={form.start} onChange={set("start")} invalid={!!errors.start} />
        </Field>
        <Field label="Expiry date" required error={errors.expires}>
          <TextInput type="date" value={form.expires} onChange={set("expires")} invalid={!!errors.expires} />
        </Field>
      </FieldRow>
      <Field label="Notes">
        <TextArea value={form.notes} onChange={set("notes")} placeholder="Optional" />
      </Field>
    </EditRecordDialog>
  );
}
