import { api } from "@usi-installer/backend/convex/_generated/api";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@usi-installer/ui/components/dialog";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";

import { Field, TextInput } from "@/components/whs/safety-form";
import { Panel, SafetyButton } from "@/components/whs/safety-ui";
import { toUserMessage } from "@/lib/errors";

/**
 * "Escalation to management" on the Safety Dashboard (framework 7 "escalate to
 * management after a configurable period", decision AD47): one number of
 * days for everything, which the admin can change.
 */
export function EscalationSetting() {
  const settings = useQuery(api.whsSettings.get);
  const save = useMutation(api.whsSettings.setEscalateAfterDays);
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const current = settings?.escalate_after_days;

  const submit = async () => {
    const value = Number(days);
    if (days.trim() === "" || !Number.isInteger(value) || value < 1 || value > 90) {
      setError("Enter a whole number of days from 1 to 90");
      toast.error("Enter a whole number of days from 1 to 90");
      return;
    }
    setBusy(true);
    try {
      await save({ days: value });
      toast.success(`Management is now emailed after ${value} ${value === 1 ? "day" : "days"} overdue`);
      setOpen(false);
    } catch (caught) {
      toast.error(toUserMessage(caught, "Could not save that setting."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel className="flex flex-wrap items-center justify-between gap-4 p-5">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-bold text-[#111827]">Escalation to management</h3>
        <p className="text-[13px] text-[#64748b]">
          Anything still overdue <span className="font-semibold text-[#111827]">{current ?? "…"} days</span> after its due date is emailed once to
          management: worker cards, insurance, vehicles, first-aid kits and safety documents.
        </p>
      </div>
      <SafetyButton
        variant="secondary"
        disabled={current === undefined}
        onClick={() => {
          setDays(String(current ?? ""));
          setError(undefined);
          setOpen(true);
        }}
      >
        Change
      </SafetyButton>
      <Dialog open={open} onOpenChange={(next) => !next && !busy && setOpen(false)}>
        <DialogContent className="rounded-xl border-slate-200 bg-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900">Escalation to management</DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-slate-500">
              How many days an item can stay overdue before management is emailed once. Weekly reminders to the responsible person carry on as
              before.
            </DialogDescription>
          </DialogHeader>
          <Field label="Days overdue" required error={error}>
            <TextInput
              type="number"
              value={days}
              onChange={(value) => {
                setDays(value);
                setError(undefined);
              }}
              invalid={!!error}
            />
          </Field>
          <DialogFooter>
            <SafetyButton variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </SafetyButton>
            <SafetyButton onClick={() => void submit()} disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </SafetyButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}
