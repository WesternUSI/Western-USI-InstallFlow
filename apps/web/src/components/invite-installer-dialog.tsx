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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@usi-installer/ui/components/select";
import { useAction } from "convex/react";
import { UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { InviteSentDialog } from "@/components/invite-sent-dialog";
import { TEAMS, type Team } from "@/lib/teams";

const NO_TEAM = "__none__";

interface InviteInstallerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** "+ Invite Installer" on Users Management: a quick create — name, email
 * and team only. The account's password is generated on the server and
 * only ever surfaced (and editable) from the User Details page. */
export function InviteInstallerDialog({ open, onOpenChange }: InviteInstallerDialogProps) {
  const inviteInstaller = useAction(api.users.inviteInstaller);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [team, setTeam] = useState(NO_TEAM);
  const [isSaving, setIsSaving] = useState(false);
  const [sent, setSent] = useState<{ name: string; email: string; team: string } | null>(null);

  function reset() {
    setName("");
    setEmail("");
    setTeam(NO_TEAM);
  }

  async function handleInvite() {
    const fullName = name.trim();
    const workEmail = email.trim();

    if (fullName === "") {
      toast.error("Enter the installer's full name");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(workEmail)) {
      toast.error("Enter a valid email address");
      return;
    }

    setIsSaving(true);
    try {
      await inviteInstaller({
        full_name: fullName,
        work_email: workEmail,
        team: team === NO_TEAM ? undefined : (team as Team),
      });
      setSent({ name: fullName, email: workEmail, team: team === NO_TEAM ? "Unassigned" : team });
      onOpenChange(false);
      reset();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create that account");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) reset();
          onOpenChange(next);
        }}
      >
        <DialogContent className="max-w-lg rounded-xl border-slate-200 bg-white">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900">Invite Installer</DialogTitle>
            <DialogDescription className="text-sm text-slate-500">
              Create a new installer account and securely share login credentials.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1.5 text-sm font-medium text-slate-700">Full Name</p>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g., John Smith"
                className="h-[38px] rounded-lg text-sm"
              />
            </div>

            <div>
              <p className="mb-1.5 text-sm font-medium text-slate-700">Email</p>
              <Input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="e.g., john.smith@westernusi.com"
                className="h-[38px] rounded-lg text-sm"
              />
            </div>

            <div className="sm:col-span-2">
              <p className="mb-1.5 text-sm font-medium text-slate-700">Primary Team</p>
              <Select value={team} onValueChange={(value) => setTeam(value as string)}>
                <SelectTrigger className="h-[38px] w-full rounded-lg border-slate-300 bg-white px-3 text-sm text-slate-800">
                  <SelectValue placeholder="Select a team" />
                </SelectTrigger>
                <SelectContent
                  alignItemWithTrigger={false}
                  className="rounded-lg border border-slate-200 bg-white shadow-lg"
                >
                  <SelectItem value={NO_TEAM} className="rounded-md px-3 py-2 text-sm text-slate-700">
                    Unassigned
                  </SelectItem>
                  {TEAMS.map((option) => (
                    <SelectItem
                      key={option}
                      value={option}
                      className="rounded-md px-3 py-2 text-sm text-slate-700"
                    >
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              className="h-[38px] gap-1.5 rounded-lg"
              disabled={isSaving}
              onClick={() => void handleInvite()}
            >
              <UserPlus className="size-4" />
              {isSaving ? "Inviting…" : "Invite Installer"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <InviteSentDialog
        open={sent !== null}
        name={sent?.name ?? ""}
        workEmail={sent?.email ?? ""}
        team={sent?.team ?? ""}
        onOpenChange={(next) => {
          if (!next) setSent(null);
        }}
      />
    </>
  );
}
