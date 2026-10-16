import { api } from "@usi-installer/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { cn } from "@usi-installer/ui/lib/utils";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { toast } from "sonner";

import { DetailsLayout, SideCard } from "@/components/whs/record-cards";
import { ArchivedNotice, EditRecordDialog, ManageRecordCard } from "@/components/whs/record-admin";
import { Field, FieldRow, SelectInput, TextArea, TextInput } from "@/components/whs/safety-form";
import { DetailGrid, Panel, SafetyButton, SafetyPage, StatusBadge, reminderText } from "@/components/whs/safety-ui";
import { toUserMessage } from "@/lib/errors";
import { KIT_CHECKS, KIT_TYPES, MONTH_CHOICES } from "@/lib/kit-checks";
import { formatIsoDate, formatTime } from "@/lib/upload-file";

export const Route = createFileRoute("/_auth/safety/kits/$kitId/")({
  component: KitDetails,
});

const ANSWER: Record<string, { label: string; className: string }> = {
  pass: { label: "Pass", className: "bg-[#f0fdf4] text-[#16a34a]" },
  action: { label: "Action", className: "bg-[#fef7ee] text-[#d97706]" },
  na: { label: "N/A", className: "bg-[#f8fafc] text-[#64748b]" },
};

/** FA2 Kit details, real data. No admin review of inspections (decision K1). */
function KitDetails() {
  const { kitId } = Route.useParams();
  const kit = useQuery(api.kits.adminDetail, { kit_id: kitId });
  const archive = useMutation(api.kits.adminArchive);
  const [editing, setEditing] = useState(false);

  if (kit === undefined || kit === null) {
    return (
      <SafetyPage title="First-Aid Kit" description="" back={{ to: "/safety/kits", label: "First-Aid Kits" }}>
        <Panel className="p-6 text-sm text-[#64748b]">{kit === undefined ? "Loading…" : "This kit could not be found."}</Panel>
      </SafetyPage>
    );
  }
  const latest = kit.latest;

  return (
    <SafetyPage title={`Kit ${kit.code} · ${kit.location}`} description={`${kit.kit_type} · ${kit.entity}`} back={{ to: "/safety/kits", label: "First-Aid Kits" }}>
      {kit.archived ? <ArchivedNotice noun="kit" /> : null}
      <DetailsLayout
        main={
          <>
            <Panel className="flex flex-col gap-4 p-6">
              <div className="flex items-start justify-between gap-4">
                <h2 className="text-lg font-semibold text-[#111827]">Kit details</h2>
                <StatusBadge status={kit.status} />
              </div>
              <DetailGrid
                columns={2}
                items={[
                  { label: "Location", value: kit.location },
                  { label: "Assigned installer", value: kit.responsible ?? "Not assigned" },
                  { label: "Last inspection", value: formatIsoDate(kit.last_inspection) },
                  { label: "Next inspection", value: formatIsoDate(kit.next_inspection) },
                  { label: "Inspection interval", value: `${kit.frequency_months} ${kit.frequency_months === 1 ? "month" : "months"}` },
                  { label: "Earliest stock expiry", value: formatIsoDate(latest?.earliest_expiry) },
                  { label: "Reminders", value: reminderText([14, 7], "the inspection") },
                ]}
              />
            </Panel>

            {kit.open_issue ? (
              <Panel className="flex flex-col gap-3 p-6">
                <h3 className="text-base font-semibold text-[#111827]">Open corrective action</h3>
                <p className="text-[13px] text-[#64748b]">
                  {kit.open_issue.checks.map((check) => KIT_CHECKS[check] ?? check).join(", ")} found on {formatIsoDate(kit.open_issue.date)}.
                  {kit.open_issue.corrective_action ? ` Action needed: ${kit.open_issue.corrective_action}` : ""} The kit stays Action required until it's marked
                  completed.
                </p>
                {kit.can_manage ? (
                  <div>
                    <SafetyButton to="/safety/kits/$kitId/corrective-action" params={{ kitId }}>
                      Resolve Action
                    </SafetyButton>
                  </div>
                ) : null}
              </Panel>
            ) : null}

            {latest ? (
              <Panel className="flex flex-col gap-4 p-6">
                <h3 className="text-base font-semibold text-[#111827]">
                  Last inspection · {formatIsoDate(latest.date)} by {latest.inspected_by}
                </h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {latest.answers.map((entry) => (
                    <div key={entry.check} className="flex items-center justify-between gap-3 rounded-[8px] border border-[#f1f5f9] px-3 py-2">
                      <span className="text-[13px] text-[#111827]">{KIT_CHECKS[entry.check] ?? entry.check}</span>
                      <span className={cn("rounded-[4px] px-2 py-0.5 text-[11px] font-semibold", ANSWER[entry.answer]?.className)}>{ANSWER[entry.answer]?.label}</span>
                    </div>
                  ))}
                </div>
                <DetailGrid
                  columns={2}
                  items={[
                    { label: "Items replaced", value: latest.items_replaced ?? "—" },
                    { label: "Notes", value: latest.notes ?? "—" },
                    ...(latest.resolved_at ? [{ label: "Resolved", value: `${formatTime(latest.resolved_at)} by ${latest.resolved_by}: ${latest.resolution}` }] : []),
                  ]}
                />
                {latest.photo_url ? <img src={latest.photo_url} alt="Kit inspection" className="max-h-64 w-fit rounded-[8px] border border-[#e5e7eb]" /> : null}
              </Panel>
            ) : null}

            <Panel className="flex flex-col gap-4 p-6">
              <h3 className="text-base font-semibold text-[#111827]">Inspection history and activity</h3>
              {kit.history.length === 0 && kit.activity.length === 0 ? <p className="text-xs text-[#64748b]">Not inspected yet.</p> : null}
              {kit.activity.map((entry) => (
                <p key={`${entry.at}-${entry.text}`} className="text-xs text-[#64748b]">
                  {formatTime(entry.at)} · {entry.text}
                  {entry.by ? ` by ${entry.by}` : ""}
                  {entry.details ? ` · ${entry.details}` : ""}
                </p>
              ))}
            </Panel>
          </>
        }
        side={
          <>
            <SideCard title="Inspection">
              <p className="text-[13px] text-[#64748b]">
                {kit.responsible ? `${kit.responsible} inspects this kit in the installer app.` : "No one is assigned to inspect this kit yet."}
              </p>
              {kit.can_manage ? (
                <SafetyButton
                  variant="secondary"
                  to="/safety/kits/$kitId/assign"
                  params={{ kitId }}
                  className="w-full rounded-[8px] border-[#3b82f6] text-xs"
                >
                  Assign Inspection
                </SafetyButton>
              ) : null}
            </SideCard>
            {kit.can_manage ? (
              <ManageRecordCard
                noun="kit"
                onEdit={() => setEditing(true)}
                onArchive={async (reason) => {
                  try {
                    await archive({ kit_id: kit.id, reason });
                    toast.success(`Kit ${kit.code} archived`);
                  } catch (error) {
                    toast.error(toUserMessage(error, "Could not archive that kit."));
                    throw error;
                  }
                }}
              />
            ) : null}
          </>
        }
      />
      {kit.can_manage ? <EditKitDialog kit={kit} open={editing} onClose={() => setEditing(false)} /> : null}
    </SafetyPage>
  );
}

type KitDetail = NonNullable<FunctionReturnType<typeof api.kits.adminDetail>>;
type KitErrors = Partial<Record<"code" | "type" | "location" | "next", string>>;

/** Edit Details for a kit (decision AD32). Who inspects it is changed with Assign Inspection. */
function EditKitDialog({ kit, open, onClose }: { kit: KitDetail; open: boolean; onClose: () => void }) {
  const edit = useMutation(api.kits.adminEdit);
  const initial = () => ({
    code: kit.code,
    type: kit.kit_type,
    location: kit.location,
    frequency: String(kit.frequency_months),
    next: kit.next_inspection,
    notes: kit.notes ?? "",
  });
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<KitErrors>({});
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setForm(initial());
      setErrors({});
    }
  }
  const set = (key: keyof ReturnType<typeof initial>) => (value: string) => setForm((current) => ({ ...current, [key]: value }));
  const frequencies = MONTH_CHOICES.some((choice) => choice.value === form.frequency)
    ? MONTH_CHOICES
    : [...MONTH_CHOICES, { value: form.frequency, label: `${form.frequency} months` }];
  const types = KIT_TYPES.some((choice) => choice.value === form.type) ? KIT_TYPES : [...KIT_TYPES, { value: form.type, label: form.type }];

  const save = async (reason: string) => {
    const found: KitErrors = {};
    if (form.code.trim() === "") found.code = "Enter the kit ID, e.g. V-12";
    if (form.type === "") found.type = "Select the kit type";
    if (form.location.trim() === "") found.location = "Enter where the kit is kept, or its vehicle";
    if (form.next === "") found.next = "Select the next inspection date";
    setErrors(found);
    const first = Object.values(found)[0];
    if (first) {
      toast.error(first);
      return false;
    }
    try {
      await edit({
        kit_id: kit.id,
        code: form.code.trim(),
        kit_type: form.type,
        location: form.location.trim(),
        frequency_months: Number(form.frequency),
        next_inspection: form.next,
        notes: form.notes.trim() || undefined,
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
    <EditRecordDialog open={open} title={`Edit kit ${kit.code}`} onClose={onClose} onSave={save}>
      <FieldRow>
        <Field label="Kit ID" required error={errors.code}>
          <TextInput value={form.code} onChange={set("code")} invalid={!!errors.code} />
        </Field>
        <Field label="Kit type" required error={errors.type}>
          <SelectInput value={form.type} onChange={set("type")} options={types} invalid={!!errors.type} />
        </Field>
      </FieldRow>
      <Field label="Location" required error={errors.location}>
        <TextInput value={form.location} onChange={set("location")} invalid={!!errors.location} />
      </Field>
      <FieldRow>
        <Field label="Inspected every" required>
          <SelectInput value={form.frequency} onChange={set("frequency")} options={frequencies} />
        </Field>
        <Field label="Next inspection" required error={errors.next}>
          <TextInput type="date" value={form.next} onChange={set("next")} invalid={!!errors.next} />
        </Field>
      </FieldRow>
      <Field label="Notes">
        <TextArea value={form.notes} onChange={set("notes")} placeholder="Optional" />
      </Field>
    </EditRecordDialog>
  );
}
