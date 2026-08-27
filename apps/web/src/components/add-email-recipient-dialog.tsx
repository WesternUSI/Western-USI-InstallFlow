import { Button } from "@usi-installer/ui/components/button";
import { Checkbox } from "@usi-installer/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@usi-installer/ui/components/dialog";
import { Input } from "@usi-installer/ui/components/input";
import { Label } from "@usi-installer/ui/components/label";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";

export interface AddableUser {
  _id: string;
  name: string;
  email: string;
  role?: "installer" | "office_staff" | "admin";
}

interface AddEmailRecipientDialogProps {
  open: boolean;
  /** Accounts not already on the list. `undefined` while loading. */
  users: AddableUser[] | undefined;
  onOpenChange: (open: boolean) => void;
  /** Rejects with a message shown inline — duplicates, bad format. */
  onSubmit: (emails: string[]) => Promise<void>;
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrator",
  office_staff: "Office Staff",
  installer: "Installer",
};

/**
 * Two ways to add a recipient, because there are two kinds.
 *
 * Most of the time the address belongs to someone who already has an account,
 * and picking them off a list beats retyping an address that is already known
 * and easy to get subtly wrong. The rest of the time it belongs to nobody in
 * the panel at all — a shared ops inbox, a manager, a client contact — so the
 * free-text field stays, underneath.
 */
export function AddEmailRecipientDialog({
  open,
  users,
  onOpenChange,
  onSubmit,
}: AddEmailRecipientDialogProps) {
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const matches = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (users === undefined) return [];
    if (term === "") return users;
    return users.filter(
      (user) =>
        user.name.toLowerCase().includes(term) || user.email.toLowerCase().includes(term),
    );
  }, [users, search]);

  const total = picked.size + (typed.trim() === "" ? 0 : 1);

  function close(next: boolean) {
    if (isSaving) return;
    if (!next) {
      setSearch("");
      setPicked(new Set());
      setTyped("");
      setError(null);
    }
    onOpenChange(next);
  }

  function toggle(email: string) {
    setPicked((previous) => {
      const next = new Set(previous);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSaving(true);

    const emails = [...picked];
    if (typed.trim() !== "") emails.push(typed.trim());

    try {
      await onSubmit(emails);
      close(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add that address");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      {/* The shared DialogContent caps width but not height, and it is centred
          with a transform — so a dialog taller than the viewport spills off
          both ends with nothing to scroll. This one is the tall one, so it
          carries its own cap. `dvh` rather than `vh` because mobile browser
          chrome makes `vh` overshoot. */}
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-xl border-slate-200 bg-white sm:max-w-lg">
        <form onSubmit={(event) => void handleSubmit(event)}>
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900">
              Add email recipients
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-slate-500">
              Everyone added here gets a completion email each time an installer marks a work order
              complete.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 flex flex-col gap-2">
            <Label className="text-sm font-medium text-slate-700">People with an account</Label>

            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="pl-9"
                placeholder="Search by name or email"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>

            {/* Viewport-relative as well as capped: on a short screen a fixed
                240px list crowds out the manual field and the footer. */}
            <div className="max-h-[min(240px,30dvh)] overflow-y-auto rounded-lg border border-slate-200">
              {users === undefined && (
                <p className="px-4 py-6 text-center text-sm text-slate-400">Loading…</p>
              )}
              {users !== undefined && matches.length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-slate-400">
                  {users.length === 0
                    ? "Everyone with an account is already on the list."
                    : "No one matches that search."}
                </p>
              )}
              {matches.map((user) => (
                <label
                  key={user._id}
                  className="flex cursor-pointer items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0 hover:bg-slate-50"
                >
                  <Checkbox
                    checked={picked.has(user.email)}
                    onCheckedChange={() => toggle(user.email)}
                    className="size-4 rounded-[4px] border-[1.5px] border-slate-300 data-checked:border-blue-600 data-checked:bg-blue-600"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-slate-800">{user.name}</span>
                    <span className="block text-xs break-all text-slate-500">{user.email}</span>
                  </span>
                  {/* Dropped on narrow phones: the name and address are what
                      identify someone, and the role would push them to wrap. */}
                  {user.role !== undefined && (
                    <span className="hidden shrink-0 text-xs text-slate-400 sm:block">
                      {ROLE_LABELS[user.role] ?? user.role}
                    </span>
                  )}
                </label>
              ))}
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-2 border-t border-slate-200 pt-5">
            <Label htmlFor="recipient-email" className="text-sm font-medium text-slate-700">
              Or add any other address
            </Label>
            <Input
              id="recipient-email"
              type="email"
              autoComplete="off"
              placeholder="ops@westernusi.com.au"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
            />
            <p className="text-xs text-slate-500">
              For an inbox or a person without a panel account.
            </p>
          </div>

          {error !== null && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}

          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              className="h-[38px] rounded-lg"
              disabled={isSaving}
              onClick={() => close(false)}
            >
              Cancel
            </Button>
            <Button type="submit" className="h-[38px] rounded-lg" disabled={isSaving || total === 0}>
              {isSaving ? "Adding…" : total === 0 ? "Add" : `Add ${total}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
