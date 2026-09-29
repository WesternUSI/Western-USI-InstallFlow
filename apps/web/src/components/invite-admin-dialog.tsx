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
import { useAction } from "convex/react";
import { ShieldPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface InviteAdminDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** "+ Invite Admin" on Users Management: name and email only. The password
 * is generated on the server and emailed, same as an installer invite. */
export function InviteAdminDialog({ open, onOpenChange }: InviteAdminDialogProps) {
  const inviteAdmin = useAction(api.users.inviteAdmin);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  function reset() {
    setName("");
    setEmail("");
  }

  async function handleInvite() {
    const fullName = name.trim();
    const workEmail = email.trim();

    if (fullName === "") {
      toast.error("Enter the admin's full name");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(workEmail)) {
      toast.error("Enter a valid email address");
      return;
    }

    setIsSaving(true);
    try {
      await inviteAdmin({ full_name: fullName, work_email: workEmail });
      toast.success(`Admin invite sent to ${workEmail}`);
      onOpenChange(false);
      reset();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create that account");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-lg rounded-xl border-slate-200 bg-white">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-slate-900">Invite Admin</DialogTitle>
          <DialogDescription className="text-sm text-slate-500">
            Create a new administrator account and securely share login credentials.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-1.5 text-sm font-medium text-slate-700">Full Name</p>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g., Jane Smith"
              className="h-[38px] rounded-lg text-sm"
            />
          </div>

          <div>
            <p className="mb-1.5 text-sm font-medium text-slate-700">Email</p>
            <Input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="e.g., jane.smith@westernusi.com"
              className="h-[38px] rounded-lg text-sm"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            className="h-[38px] gap-1.5 rounded-lg"
            disabled={isSaving}
            onClick={() => void handleInvite()}
          >
            <ShieldPlus className="size-4" />
            {isSaving ? "Inviting…" : "Invite Admin"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
