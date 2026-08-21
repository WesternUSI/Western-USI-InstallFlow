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
import { useMutation } from "convex/react";
import { Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useTeamNames } from "@/hooks/use-teams";
import { nextTeamName } from "@/lib/teams";

interface AddTeamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Creates an installation crew. The name is the team's identity, so it has to
 * be unique and cannot be changed afterwards. */
export function AddTeamDialog({ open, onOpenChange }: AddTeamDialogProps) {
  const createTeam = useMutation(api.teams.createTeam);
  const teamNames = useTeamNames();

  const [name, setName] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Prefilled with the next number in the sequence, and only on the opening
  // transition — re-running it on every render would wipe out typing.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) setName(nextTeamName(teamNames));
    wasOpen.current = open;
  });

  async function handleSave() {
    const trimmed = name.trim();
    if (trimmed === "") {
      toast.error("Enter a team name");
      return;
    }

    setIsSaving(true);
    try {
      await createTeam({ name: trimmed });
      toast.success(`${trimmed} created`);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create that team");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-xl border-slate-200 bg-white">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-slate-900">Add Team</DialogTitle>
          <DialogDescription className="text-sm text-slate-500">
            Create a new installation crew. Installers are assigned to it from Users or the team's
            own page.
          </DialogDescription>
        </DialogHeader>

        <div>
          <p className="mb-1.5 text-sm font-medium text-slate-700">Team Name</p>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void handleSave();
            }}
            placeholder={nextTeamName(teamNames)}
            className="h-[38px] rounded-lg text-sm"
          />
          <p className="mt-1.5 text-xs text-slate-400">
            Numbered on from the last team. Must be unique, and can't be changed later — work
            orders reference the name.
          </p>
        </div>

        <div className="flex justify-end gap-3">
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
            {isSaving ? "Creating…" : "Add Team"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
