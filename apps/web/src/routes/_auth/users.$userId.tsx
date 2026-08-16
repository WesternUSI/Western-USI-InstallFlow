import { api } from "@usi-installer/backend/convex/_generated/api";
import type { Id } from "@usi-installer/backend/convex/_generated/dataModel";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "@usi-installer/ui/components/button";
import { Input } from "@usi-installer/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@usi-installer/ui/components/select";
import { useAction, useMutation, useQuery } from "convex/react";
import { ChevronLeft, Dices, MailCheck, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import type { Credentials } from "@/components/credentials-dialog";
import { CredentialsDialog } from "@/components/credentials-dialog";
import { DeleteUserDialog } from "@/components/delete-user-dialog";
import { PageHeader } from "@/components/page-header";
import { TEAMS, type Team } from "@/lib/teams";
import { USER_STATUS_CLASSES, USER_STATUS_LABELS, type UserStatus } from "@/lib/userStatus";

export const Route = createFileRoute("/_auth/users/$userId")({
  component: UserDetailPage,
});

const NO_TEAM = "__none__";

interface FormState {
  name: string;
  personalEmail: string;
  workEmail: string;
  password: string;
  team: string;
}

/** Client-side convenience only — the value the admin ends up saving either
 * way goes to Clerk exactly as typed. */
function generatePassword(): string {
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
  const bytes = new Uint32Array(14);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (n) => charset[n % charset.length]).join("");
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-slate-700">{label}</p>
      {children}
    </div>
  );
}

function UserDetailPage() {
  const { userId } = Route.useParams();
  const navigate = useNavigate();
  const id = userId as Id<"users">;

  const user = useQuery(api.users.get, { id });
  const updateAccount = useAction(api.users.updateAccount);
  const resendCredentials = useMutation(api.users.resendCredentials);
  const removeUser = useAction(api.users.removeUser);

  const [form, setForm] = useState<FormState>({
    name: "",
    personalEmail: "",
    workEmail: "",
    password: "",
    team: NO_TEAM,
  });
  // What Clerk actually has on file, so Save only sends a password change to
  // Clerk when this field was edited — not on every save.
  const [storedPassword, setStoredPassword] = useState<string | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [credentialsTitle, setCredentialsTitle] = useState("");

  useEffect(() => {
    if (user == null) return;
    setForm({
      name: user.name,
      personalEmail: user.personal_email ?? "",
      workEmail: user.email,
      password: user.password ?? "",
      team: user.team ?? NO_TEAM,
    });
    setStoredPassword(user.password);
  }, [user]);

  function goBack() {
    void navigate({ to: "/users" });
  }

  async function handleSave() {
    if (form.name.trim() === "") {
      toast.error("Full name cannot be empty");
      return;
    }
    const workEmail = form.workEmail.trim();
    if (!/^\S+@\S+\.\S+$/.test(workEmail)) {
      toast.error("Enter a work email in a valid format");
      return;
    }

    const password = form.password.trim();
    const passwordChanged = password !== "" && password !== (storedPassword ?? "");

    setIsSaving(true);
    try {
      const result = await updateAccount({
        user_id: id,
        name: form.name.trim(),
        personal_email: form.personalEmail.trim() || undefined,
        team: form.team === NO_TEAM ? undefined : (form.team as Team),
        work_email: workEmail,
        password: passwordChanged ? password : undefined,
      });

      if (result) {
        // A changed password means the old one no longer works, so the new
        // pair is shown before leaving the page rather than saved silently.
        setCredentialsTitle("Password Updated");
        setCredentials(result);
      } else {
        toast.success("Account details saved");
        goBack();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save those changes");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSendCredentials() {
    if (user == null) return;
    try {
      const result = await resendCredentials({ user_id: id });
      setCredentialsTitle("Credentials for " + user.name);
      setCredentials(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send those credentials");
    }
  }

  async function handleDelete() {
    if (user == null) return;
    try {
      await removeUser({ clerk_id: user.clerk_id });
      toast.success(`${user.name} was deleted`);
      goBack();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete that account");
    }
  }

  return (
    <>
      <PageHeader title="User Details" description="Manage user's details and credentials." />

      {user === undefined ? (
        <p className="py-16 text-center text-sm text-slate-400">Loading…</p>
      ) : user === null ? (
        <p className="py-16 text-center text-sm text-slate-400">That account no longer exists.</p>
      ) : (
        <div className="flex flex-col gap-4 px-4 py-6">
          <button
            type="button"
            onClick={goBack}
            className="flex w-fit items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            <ChevronLeft className="size-4" />
            Back to Users Management
          </button>

          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-slate-900">{user.name}</h1>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${USER_STATUS_CLASSES[user.status as UserStatus]}`}
            >
              {USER_STATUS_LABELS[user.status as UserStatus]}
            </span>
            {user.team && (
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
                {user.team}
              </span>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <section className="flex flex-col gap-5 rounded-xl border border-slate-200 bg-white px-6 py-5 lg:col-span-2">
              <h2 className="text-base font-bold text-slate-900">Account Information</h2>

              <Field label="Full Name">
                <Input
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  className="h-[38px] rounded-lg text-sm"
                />
              </Field>

              <Field label="Personal Email">
                <Input
                  value={form.personalEmail}
                  onChange={(event) => setForm({ ...form, personalEmail: event.target.value })}
                  placeholder="john.smith@gmail.com"
                  className="h-[38px] rounded-lg text-sm"
                />
              </Field>

              <Field label="Work Email">
                <Input
                  value={form.workEmail}
                  onChange={(event) => setForm({ ...form, workEmail: event.target.value })}
                  className="h-[38px] rounded-lg text-sm"
                />
                <p className="mt-1.5 text-xs text-slate-400">
                  This is the account's Clerk login email — changing it takes effect immediately on
                  Save.
                </p>
              </Field>

              <Field label="Password">
                <div className="flex items-center gap-2">
                  <Input
                    value={form.password}
                    onChange={(event) => setForm({ ...form, password: event.target.value })}
                    placeholder={storedPassword ? undefined : "No password on record"}
                    className="h-[38px] rounded-lg font-mono text-sm"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setForm({ ...form, password: generatePassword() })}
                    className="h-[38px] shrink-0 gap-1.5 rounded-lg whitespace-nowrap"
                  >
                    <Dices className="size-4" />
                    Generate
                  </Button>
                </div>
                <p className="mt-1.5 text-xs text-slate-400">
                  This is the account's current password. Edit or generate a new one — it only
                  applies to Clerk when you Save Changes.
                </p>
              </Field>

              <Field label="Current Team">
                <Select
                  value={form.team}
                  onValueChange={(value) => setForm({ ...form, team: value as string })}
                >
                  <SelectTrigger className="h-[38px] w-full rounded-lg border-slate-300 bg-white px-3 text-sm text-slate-800">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent
                    alignItemWithTrigger={false}
                    className="rounded-lg border border-slate-200 bg-white shadow-lg"
                  >
                    <SelectItem value={NO_TEAM} className="rounded-md px-3 py-2 text-sm text-slate-700">
                      Unassigned
                    </SelectItem>
                    {TEAMS.map((team) => (
                      <SelectItem
                        key={team}
                        value={team}
                        className="rounded-md px-3 py-2 text-sm text-slate-700"
                      >
                        {team}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <div className="flex justify-end gap-3 border-t border-slate-200 pt-5">
                <Button
                  variant="outline"
                  className="h-[38px] rounded-lg"
                  disabled={isSaving}
                  onClick={goBack}
                >
                  Cancel
                </Button>
                <Button
                  className="h-[38px] rounded-lg"
                  disabled={isSaving}
                  onClick={() => void handleSave()}
                >
                  {isSaving ? "Saving…" : "Save Changes"}
                </Button>
              </div>
            </section>

            <div className="flex flex-col gap-4">
              <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-6 py-5">
                <div className="flex items-center gap-2">
                  <MailCheck className="size-4 text-blue-600" />
                  <h2 className="text-sm font-bold text-slate-900">Credential Actions</h2>
                </div>
                <p className="text-sm text-slate-500">
                  Send this user updated login credentials or reset their access information.
                </p>
                <Button
                  className="h-[38px] w-full gap-1.5 rounded-lg"
                  onClick={() => void handleSendCredentials()}
                >
                  <MailCheck className="size-4" />
                  Send Updated Credentials
                </Button>
              </section>

              <section className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50/50 px-6 py-5">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="size-4 text-red-600" />
                  <h2 className="text-sm font-bold text-red-700">Danger Zone</h2>
                </div>
                <p className="text-sm text-red-600/80">
                  Deleting a user is permanent and cannot be undone. This will revoke all access
                  immediately.
                </p>
                <Button
                  variant="destructive"
                  className="h-[38px] w-full gap-1.5 rounded-lg"
                  onClick={() => setIsDeleteOpen(true)}
                >
                  Delete User
                </Button>
              </section>
            </div>
          </div>
        </div>
      )}

      {user && (
        <DeleteUserDialog
          open={isDeleteOpen}
          name={user.name}
          onOpenChange={setIsDeleteOpen}
          onConfirm={handleDelete}
        />
      )}

      <CredentialsDialog
        open={credentials !== null}
        title={credentialsTitle}
        description="Share these credentials with the installer directly — they are not emailed automatically."
        credentials={credentials}
        onOpenChange={(open) => {
          if (open) return;
          setCredentials(null);
          // The password-updated dialog is shown from Save, so dismissing it
          // finishes leaving the page; "Send Updated Credentials" opens the
          // same dialog without saving, so it should leave the admin in place.
          if (credentialsTitle === "Password Updated") goBack();
        }}
      />
    </>
  );
}
