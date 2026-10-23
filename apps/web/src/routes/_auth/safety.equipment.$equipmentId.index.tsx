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
import { DetailGrid, Panel, SafetyButton, SafetyPage, StatusBadge } from "@/components/whs/safety-ui";
import { toUserMessage } from "@/lib/errors";
import { formatIsoDate, formatTime } from "@/lib/upload-file";

export const Route = createFileRoute("/_auth/safety/equipment/$equipmentId/")({
  component: EquipmentDetails,
});

const ANSWER: Record<string, { label: string; className: string }> = {
  pass: { label: "Pass", className: "bg-[#f0fdf4] text-[#16a34a]" },
  action: { label: "Action", className: "bg-[#fef7ee] text-[#d97706]" },
};

const OUTCOMES = [
  { value: "repaired", label: "Repaired" },
  { value: "out-of-service", label: "Take it out of service" },
  { value: "no-action", label: "No action needed" },
];

const OUTCOME_TEXT: Record<string, string> = { repaired: "Repaired", "out-of-service": "Taken out of service", "no-action": "No action needed" };

/** A sheet value: a `YYYY-MM-DD` date shown as a date, anything else as written. */
const asDate = (value: string | undefined) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? formatIsoDate(value) : (value ?? "—"));

/** One item (decision AD49): details, its open check, the latest result and the admin's review of it. */
function EquipmentDetails() {
  const { equipmentId } = Route.useParams();
  const item = useQuery(api.equipment.adminDetail, { equipment_id: equipmentId });
  const archive = useMutation(api.equipment.adminArchive);
  const [editing, setEditing] = useState(false);

  if (item === undefined || item === null) {
    return (
      <SafetyPage title="Equipment" description="" back={{ to: "/safety/equipment", label: "Height & Safety Equipment" }}>
        <Panel className="p-6 text-sm text-[#64748b]">{item === undefined ? "Loading…" : "This item could not be found."}</Panel>
      </SafetyPage>
    );
  }
  const latest = item.latest;

  return (
    <SafetyPage title={item.name} description={[item.brand, item.type].filter(Boolean).join(" · ")} back={{ to: "/safety/equipment", label: "Height & Safety Equipment" }}>
      {item.archived ? <ArchivedNotice noun="item" /> : null}
      <DetailsLayout
        main={
          <>
            <Panel className="flex flex-col gap-4 p-6">
              <div className="flex items-start justify-between gap-4">
                <h2 className="text-lg font-semibold text-[#111827]">Item details</h2>
                <StatusBadge status={item.status} />
              </div>
              <DetailGrid
                columns={2}
                items={[
                  { label: "Type", value: item.type },
                  { label: "Brand", value: item.brand || "—" },
                  { label: "Name / Number", value: item.name },
                  { label: "Damage", value: item.damage ?? "—" },
                  { label: "Repair history", value: item.repair_history ?? "—" },
                  { label: "Out of service date", value: asDate(item.out_of_service_date) },
                  { label: "Last updated (sheet)", value: asDate(item.last_updated) },
                ]}
              />
            </Panel>

            {latest?.needs_review && item.can_manage ? <ReviewPanel equipmentId={item.id} /> : null}

            {latest ? (
              <Panel className="flex flex-col gap-4 p-6">
                <h3 className="text-base font-semibold text-[#111827]">
                  Last check · {formatIsoDate(latest.done_on)} by {latest.by}
                </h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {latest.answers.map((entry) => (
                    <div key={entry.label} className="flex items-center justify-between gap-3 rounded-[8px] border border-[#f1f5f9] px-3 py-2">
                      <span className="text-[13px] text-[#111827]">{entry.label}</span>
                      <span className={cn("rounded-[4px] px-2 py-0.5 text-[11px] font-semibold", ANSWER[entry.answer]?.className)}>{ANSWER[entry.answer]?.label}</span>
                    </div>
                  ))}
                </div>
                <DetailGrid
                  columns={2}
                  items={[
                    ...(latest.problem ? [{ label: "What's wrong", value: latest.problem }] : []),
                    { label: "Damage found", value: latest.damage_found ? (latest.damage_description ?? "Yes") : "No" },
                    { label: "Notes", value: latest.notes ?? "—" },
                    ...(latest.reviewed_at
                      ? [{ label: "Reviewed", value: `${formatTime(latest.reviewed_at)} by ${latest.reviewed_by}: ${OUTCOME_TEXT[latest.outcome ?? ""] ?? ""}. ${latest.review_note ?? ""}` }]
                      : []),
                  ]}
                />
                {latest.photo_url ? <img src={latest.photo_url} alt="Damage" className="max-h-64 w-fit rounded-[8px] border border-[#e5e7eb]" /> : null}
              </Panel>
            ) : null}

            <Panel className="flex flex-col gap-4 p-6">
              <h3 className="text-base font-semibold text-[#111827]">Activity</h3>
              {item.activity.length === 0 ? <p className="text-xs text-[#64748b]">Nothing yet.</p> : null}
              {item.activity.map((entry) => (
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
            <SideCard title="Check">
              <p className="text-[13px] text-[#64748b]">
                {item.open_check
                  ? `${item.open_check.assigned_to} checks this item in the installer app, by ${formatIsoDate(item.open_check.due)}.`
                  : "No check is assigned."}
              </p>
              {item.can_manage ? (
                <SafetyButton
                  variant="secondary"
                  to="/safety/equipment/$equipmentId/assign"
                  params={{ equipmentId }}
                  className="w-full rounded-[8px] border-[#3b82f6] text-xs"
                >
                  {item.open_check ? "Change Check" : "Assign Check"}
                </SafetyButton>
              ) : null}
            </SideCard>
            {item.can_manage ? (
              <ManageRecordCard
                noun="item"
                onEdit={() => setEditing(true)}
                onArchive={async (reason) => {
                  try {
                    await archive({ equipment_id: item.id, reason });
                    toast.success(`${item.name} archived`);
                  } catch (error) {
                    toast.error(toUserMessage(error, "Could not archive that item."));
                    throw error;
                  }
                }}
              />
            ) : null}
          </>
        }
      />
      {item.can_manage ? <EditEquipmentDialog item={item} open={editing} onClose={() => setEditing(false)} /> : null}
    </SafetyPage>
  );
}

/** The admin decides what happens after a check found a problem or damage. */
function ReviewPanel({ equipmentId }: { equipmentId: Item["id"] }) {
  const review = useMutation(api.equipment.adminReview);
  const [outcome, setOutcome] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<{ outcome?: string; note?: string }>({});
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const found: typeof errors = {};
    if (outcome === "") found.outcome = "Choose what happens to the item.";
    if (note.trim() === "") found.note = outcome === "repaired" ? "Describe the repair." : "Add a note about your decision.";
    setErrors(found);
    const first = Object.values(found)[0];
    if (first) {
      toast.error(first);
      return;
    }
    setSaving(true);
    try {
      await review({ equipment_id: equipmentId, outcome: outcome as "repaired" | "out-of-service" | "no-action", note: note.trim() });
      toast.success("Review saved");
      setOutcome("");
      setNote("");
    } catch (error) {
      toast.error(toUserMessage(error, "Could not save the review."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel className="flex flex-col gap-4 p-6">
      <h3 className="text-base font-semibold text-[#111827]">Review the check</h3>
      <p className="text-[13px] text-[#64748b]">
        The last check found a problem or damage. The item stays Action required until you decide. Repaired adds your note to the repair history and sets Damage
        back to Nil; out of service sets today's date.
      </p>
      <FieldRow>
        <Field label="Outcome" required error={errors.outcome}>
          <SelectInput value={outcome} onChange={setOutcome} options={OUTCOMES} invalid={!!errors.outcome} />
        </Field>
      </FieldRow>
      <Field label={outcome === "repaired" ? "What was repaired" : "Note"} required error={errors.note}>
        <TextArea value={note} onChange={setNote} placeholder={outcome === "repaired" ? "e.g. Rope replaced" : "Optional details"} />
      </Field>
      <div>
        <SafetyButton onClick={() => void save()} disabled={saving}>
          {saving ? "Saving…" : "Save Review"}
        </SafetyButton>
      </div>
    </Panel>
  );
}

type Item = NonNullable<FunctionReturnType<typeof api.equipment.adminDetail>>;

/** Edit Details for an item (decision AD32). */
function EditEquipmentDialog({ item, open, onClose }: { item: Item; open: boolean; onClose: () => void }) {
  const edit = useMutation(api.equipment.adminEdit);
  const isDate = (value: string | undefined) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "");
  const initial = () => ({
    type: item.type,
    brand: item.brand,
    name: item.name,
    damage: item.damage ?? "",
    repair: item.repair_history ?? "",
    outOfService: isDate(item.out_of_service_date),
  });
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<{ type?: string; name?: string }>({});
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
    const found: typeof errors = {};
    if (form.type.trim() === "") found.type = "Enter the type";
    if (form.name.trim() === "") found.name = "Enter the name or number";
    setErrors(found);
    const first = Object.values(found)[0];
    if (first) {
      toast.error(first);
      return false;
    }
    try {
      await edit({
        equipment_id: item.id,
        type: form.type,
        brand: form.brand,
        name: form.name,
        damage: form.damage.trim() || undefined,
        repair_history: form.repair.trim() || undefined,
        out_of_service_date: form.outOfService || undefined,
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
    <EditRecordDialog open={open} title={`Edit ${item.name}`} onClose={onClose} onSave={save}>
      <FieldRow>
        <Field label="Type" required error={errors.type}>
          <TextInput value={form.type} onChange={set("type")} invalid={!!errors.type} />
        </Field>
        <Field label="Brand">
          <TextInput value={form.brand} onChange={set("brand")} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Name / Number" required error={errors.name}>
          <TextInput value={form.name} onChange={set("name")} invalid={!!errors.name} />
        </Field>
        <Field label="Damage">
          <TextInput value={form.damage} onChange={set("damage")} />
        </Field>
      </FieldRow>
      <Field label="Repair history">
        <TextArea value={form.repair} onChange={set("repair")} />
      </Field>
      <Field label="Out of service date" hint="Clear it to put the item back in use.">
        <TextInput type="date" value={form.outOfService} onChange={set("outOfService")} />
      </Field>
    </EditRecordDialog>
  );
}
