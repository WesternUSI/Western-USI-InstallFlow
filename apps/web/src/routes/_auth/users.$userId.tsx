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
import { useAction, useQuery } from "convex/react";
import { ChevronLeft, MailCheck, ShieldAlert } from "lucide-react";
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
  workEmail: string;
  team: string;
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
  const resendCredentials = useAction(api.users.resendCredentials);
  const removeUser = useAction(api.users.removeUser);

  const [form, setForm] = useState<FormState>({ name: "", workEmail: "", team: NO_TEAM });
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingCredentials, setIsSendingCredentials] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [credentialsTitle, setCredentialsTitle] = useState("");

  useEffect(() => {
    if (user == null) return;
    setForm({ name: user.name, workEmail: user.email, team: user.team ?? NO_TEAM });
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

    setIsSaving(true);
    try {
      await updateAccount({
        user_id: id,
        name: form.name.trim(),
        team: form.team === NO_TEAM ? undefined : (form.team as Team),
        work_email: workEmail,
      });
      toast.success("Account details saved");
      goBack();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save those changes");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSendCredentials() {
    if (user == null) return;
    setIsSendingCredentials(true);
    try {
      const result = await resendCredentials({ user_id: id });
      setCredentialsTitle("Credentials for " + user.name);
      setCredentials(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send those credentials");
    } finally {
      setIsSendingCredentials(false);
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
                  Generates a brand new password, sets it on this account and emails it to the
                  installer's login address.
                </p>
                <Button
                  className="h-[38px] w-full gap-1.5 rounded-lg"
                  disabled={isSendingCredentials}
                  onClick={() => void handleSendCredentials()}
                >
                  <MailCheck className="size-4" />
                  {isSendingCredentials ? "Sending…" : "Send Updated Credentials"}
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
        description={
          credentials ? `These credentials were emailed to ${credentials.email}.` : ""
        }
        credentials={credentials}
        onOpenChange={(open) => {
          if (!open) setCredentials(null);
        }}
      />
    </>
  );
}
