import { api } from "@usi-installer/backend/convex/_generated/api";
import type { Id } from "@usi-installer/backend/convex/_generated/dataModel";
import { createFileRoute } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@usi-installer/ui/components/dialog";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";

import { CheckboxRow, Field, TextInput } from "@/components/whs/safety-form";
import { Notice, PagedTable, Panel, RowAction, SafetyButton, SafetyPage } from "@/components/whs/safety-ui";
import { WESTERN_USI_ID } from "@/components/whs/subcontractor-header";
import { toUserMessage } from "@/lib/errors";

export const Route = createFileRoute("/_auth/safety/accreditation-types")({
  component: AccreditationTypes,
});

type TypeRow = { id: string; name: string; required_for: string[] };
/** The dialog: adding (no id) or changing one type. */
type Editing = { id?: string; name: string; requiredFor: string[] };

/**
 * Accreditation types (decision AD31): the cards, licences and inductions
 * workers can be asked for, and which entities' workers must hold each one.
 * A client's induction is added here as a type (framework 4B, AD29).
 */
function AccreditationTypes() {
  const types = useQuery(api.accreditationTypes.list);
  const subcontractors = useQuery(api.subcontractors.list);
  const [editing, setEditing] = useState<Editing | null>(null);

  const entities = [
    { id: WESTERN_USI_ID, name: "Western USI" },
    ...(subcontractors ?? []).map((sub) => ({ id: sub._id as string, name: sub.name })),
  ];
  const requiredText = (row: TypeRow) => {
    if (row.required_for.length === 0) return "No one";
    if (entities.length > 1 && entities.every((entity) => row.required_for.includes(entity.id))) return "Everyone";
    return entities
      .filter((entity) => row.required_for.includes(entity.id))
      .map((entity) => entity.name)
      .join(", ");
  };

  return (
    <SafetyPage
      title="Accreditation Types"
      description="The cards, licences and inductions workers must hold, and who must hold each one."
      back={{ to: "/safety/accreditations", label: "Worker Accreditations" }}
      action={<SafetyButton onClick={() => setEditing({ name: "", requiredFor: [] })}>+ Add Type</SafetyButton>}
    >
      <Panel>
        <PagedTable
          rows={types ?? []}
          rowKey={(row) => row.id}
          empty={types === undefined ? "Loading…" : "No accreditation types yet."}
          columns={[
            { key: "name", header: "Accreditation", render: (row) => <span className="text-[#111827]">{row.name}</span> },
            { key: "required", header: "Required for", render: (row) => <span className="text-[13px]">{requiredText(row)}</span> },
            {
              key: "action",
              header: "Action",
              align: "right",
              render: (row) => <RowAction onClick={() => setEditing({ id: row.id, name: row.name, requiredFor: row.required_for })}>Change</RowAction>,
            },
          ]}
        />
      </Panel>
      <Notice tone="info">
        A worker is asked for every accreditation required for their company. A client's induction is added here like any other type.
      </Notice>
      <TypeDialog editing={editing} entities={entities} onClose={() => setEditing(null)} />
    </SafetyPage>
  );
}

function TypeDialog({
  editing,
  entities,
  onClose,
}: {
  editing: Editing | null;
  entities: { id: string; name: string }[];
  onClose: () => void;
}) {
  const create = useMutation(api.accreditationTypes.adminCreate);
  const update = useMutation(api.accreditationTypes.adminUpdate);
  const remove = useMutation(api.accreditationTypes.adminRemove);
  const [name, setName] = useState("");
  const [requiredFor, setRequiredFor] = useState<string[]>([]);
  const [nameError, setNameError] = useState<string>();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [openedFor, setOpenedFor] = useState<Editing | null>(null);

  // Load the type's values each time the dialog opens.
  if (editing !== openedFor) {
    setOpenedFor(editing);
    setName(editing?.name ?? "");
    setRequiredFor(editing?.requiredFor ?? []);
    setNameError(undefined);
    setConfirmRemove(false);
  }

  const toggle = (id: string, on: boolean) => setRequiredFor((list) => (on ? [...list, id] : list.filter((entry) => entry !== id)));
  const allOn = entities.length > 0 && entities.every((entity) => requiredFor.includes(entity.id));

  const save = async () => {
    if (name.trim() === "") {
      setNameError("Enter the accreditation name");
      toast.error("Enter the accreditation name");
      return;
    }
    setBusy(true);
    try {
      if (editing?.id === undefined) {
        await create({ name, required_for: requiredFor });
        toast.success(`${name.trim()} added`);
      } else {
        await update({ type_id: editing.id as Id<"accreditation_types">, name, required_for: requiredFor });
        toast.success(`${name.trim()} saved`);
      }
      onClose();
    } catch (caught) {
      toast.error(toUserMessage(caught, "Could not save that accreditation."));
    } finally {
      setBusy(false);
    }
  };

  const removeType = async () => {
    if (editing?.id === undefined) return;
    setBusy(true);
    try {
      await remove({ type_id: editing.id as Id<"accreditation_types"> });
      toast.success(`${editing.name} removed`);
      onClose();
    } catch (caught) {
      toast.error(toUserMessage(caught, "Could not remove that accreditation."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={editing !== null} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="rounded-xl border-slate-200 bg-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-slate-900">
            {editing?.id === undefined ? "Add Accreditation Type" : `Change ${editing.name}`}
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-slate-500">
            Reminders go out 60, 30, 14 and 7 days before a card expires.
          </DialogDescription>
        </DialogHeader>
        {confirmRemove ? (
          <Notice tone="warning">
            No one will be asked for {editing?.name} any more, and its reminders stop. Cards already uploaded are kept.
          </Notice>
        ) : (
          <>
            <Field label="Name" required error={nameError}>
              <TextInput
                value={name}
                onChange={(value) => {
                  setName(value);
                  setNameError(undefined);
                }}
                placeholder="e.g. JCDecaux Site Induction"
                invalid={!!nameError}
              />
            </Field>
            <Field label="Required for" hint="Workers of the ticked companies are asked for it. Tick none to keep it optional.">
              <div className="flex max-h-56 flex-col gap-2 overflow-y-auto rounded-[6px] border border-[#e5e7eb] p-3">
                <CheckboxRow checked={allOn} onChange={(on) => setRequiredFor(on ? entities.map((entity) => entity.id) : [])}>
                  <span className="font-semibold">Everyone</span>
                </CheckboxRow>
                {entities.map((entity) => (
                  <CheckboxRow key={entity.id} checked={requiredFor.includes(entity.id)} onChange={(on) => toggle(entity.id, on)}>
                    {entity.name}
                  </CheckboxRow>
                ))}
              </div>
            </Field>
          </>
        )}
        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          {editing?.id !== undefined && !confirmRemove ? (
            <SafetyButton variant="secondary" onClick={() => setConfirmRemove(true)} disabled={busy}>
              Remove Type
            </SafetyButton>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <SafetyButton variant="secondary" onClick={confirmRemove ? () => setConfirmRemove(false) : onClose} disabled={busy}>
              {confirmRemove ? "Back" : "Cancel"}
            </SafetyButton>
            {confirmRemove ? (
              <SafetyButton onClick={() => void removeType()} disabled={busy}>
                {busy ? "Removing…" : "Yes, Remove"}
              </SafetyButton>
            ) : (
              <SafetyButton onClick={() => void save()} disabled={busy}>
                {busy ? "Saving…" : "Save"}
              </SafetyButton>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
