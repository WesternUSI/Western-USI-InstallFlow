import { api } from "@usi-installer/backend/convex/_generated/api";
import { Button } from "@usi-installer/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@usi-installer/ui/components/dialog";
import { Input } from "@usi-installer/ui/components/input";
import { Textarea } from "@usi-installer/ui/components/textarea";
import { useMutation } from "convex/react";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { EquipmentField } from "@/components/equipment-field";

interface AddSiteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface FormState {
  area: string;
  site: string;
  panel_id: string;
  quantity: string;
  size: string;
  area_progress: string;
  install_notes: string;
  equipment_needed: string[];
  location: string;
}

const EMPTY_FORM: FormState = {
  area: "",
  site: "",
  panel_id: "",
  quantity: "",
  size: "",
  area_progress: "",
  install_notes: "",
  equipment_needed: [],
  location: "",
};

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-slate-700">{label}</p>
      {children}
      {hint && <p className="mt-1.5 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

/**
 * Adds one site by hand, for a panel the Go Site Database does not carry yet.
 * The fields mirror that sheet's own columns; images are added afterwards from
 * Edit Site Details.
 */
export function AddSiteDialog({ open, onOpenChange }: AddSiteDialogProps) {
  const addSite = useMutation(api.sites.addSite);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);

  // Reopening starts from a blank form rather than the last attempt.
  useEffect(() => {
    if (open) setForm(EMPTY_FORM);
  }, [open]);

  async function handleSave() {
    const area = form.area.trim();
    const site = form.site.trim();
    const panelId = form.panel_id.trim();

    if (area === "" || site === "" || panelId === "") {
      toast.error("Location, Details and Panel ID are required");
      return;
    }

    const quantity = form.quantity.trim() === "" ? undefined : Number(form.quantity);
    if (quantity !== undefined && Number.isNaN(quantity)) {
      toast.error("Qty must be a number");
      return;
    }

    setIsSaving(true);
    try {
      await addSite({
        area,
        site,
        panel_id: panelId,
        quantity,
        size: form.size.trim() || undefined,
        area_progress: form.area_progress.trim() || undefined,
        install_notes: form.install_notes.trim() || undefined,
        equipment_needed: form.equipment_needed,
        location: form.location.trim() || undefined,
      });
      toast.success(`${panelId} added to the site database`);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add that site");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl gap-0 overflow-y-auto rounded-xl border-slate-200 bg-white p-0">
        <DialogHeader className="border-b border-slate-200 px-6 py-5">
          <DialogTitle className="text-lg font-bold text-slate-900">Add Site</DialogTitle>
          <DialogDescription className="text-sm text-slate-500">
            Add a panel that isn't in the uploaded Site Database yet.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 px-6 py-5 sm:grid-cols-2">
          <Field label="Location">
            <Input
              value={form.area}
              onChange={(event) => setForm({ ...form, area: event.target.value })}
              placeholder="e.g. Perth Station"
              className="h-[38px] rounded-lg text-sm"
            />
          </Field>

          <Field label="Details">
            <Input
              value={form.site}
              onChange={(event) => setForm({ ...form, site: event.target.value })}
              placeholder="e.g. Walkway (2 Pack)"
              className="h-[38px] rounded-lg text-sm"
            />
          </Field>

          <Field label="Panel ID" hint="Must be unique — this is what work orders match on.">
            <Input
              value={form.panel_id}
              onChange={(event) => setForm({ ...form, panel_id: event.target.value })}
              placeholder="e.g. PPCF01"
              className="h-[38px] rounded-lg font-mono text-sm"
            />
          </Field>

          <Field label="Area">
            <Input
              value={form.area_progress}
              onChange={(event) => setForm({ ...form, area_progress: event.target.value })}
              placeholder="e.g. Yanchep"
              className="h-[38px] rounded-lg text-sm"
            />
          </Field>

          <Field label="Qty">
            <Input
              value={form.quantity}
              onChange={(event) => setForm({ ...form, quantity: event.target.value })}
              placeholder="1"
              className="h-[38px] rounded-lg text-sm"
            />
          </Field>

          <Field label="Size">
            <Input
              value={form.size}
              onChange={(event) => setForm({ ...form, size: event.target.value })}
              placeholder="e.g. 1460 x 820"
              className="h-[38px] rounded-lg text-sm"
            />
          </Field>

          <div className="sm:col-span-2">
            <Field label="GPS Co-ordinates">
              <Input
                value={form.location}
                onChange={(event) => setForm({ ...form, location: event.target.value })}
                placeholder="e.g. -31.9505, 115.8605"
                className="h-[38px] rounded-lg text-sm"
              />
            </Field>
          </div>

          <div className="sm:col-span-2">
            <Field label="Install Notes">
              <Textarea
                value={form.install_notes}
                onChange={(event) => setForm({ ...form, install_notes: event.target.value })}
                placeholder="Any important installation notes for this site."
                className="min-h-24 rounded-lg text-sm"
              />
            </Field>
          </div>

          <div className="sm:col-span-2">
            <Field label="Equipment Required">
              <EquipmentField
                items={form.equipment_needed}
                onChange={(items) => setForm({ ...form, equipment_needed: items })}
              />
            </Field>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
          <Button
            variant="outline"
            className="h-[38px] rounded-lg"
            disabled={isSaving}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            className="h-[38px] gap-1.5 rounded-lg"
            disabled={isSaving}
            onClick={() => void handleSave()}
          >
            <Plus className="size-4" />
            {isSaving ? "Saving…" : "Add Site"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
