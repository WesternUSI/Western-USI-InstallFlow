import { api } from "@usi-installer/backend/convex/_generated/api";
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
import { useAction } from "convex/react";
import { ChevronLeft, Dices, MailCheck, ShieldAlert, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { Credentials } from "@/components/credentials-dialog";
import { CredentialsDialog } from "@/components/credentials-dialog";
import { PageHeader } from "@/components/page-header";
import { TEAMS, type Team } from "@/lib/teams";

export const Route = createFileRoute("/_auth/users/invite")({
  component: InviteInstallerPage,
});

const NO_TEAM = "__none__";

interface FormState {
  name: string;
  personalEmail: string;
  workEmail: string;
  password: string;
  team: string;
}

/** Client-side convenience only — whatever ends up here goes to Clerk exactly as typed. */
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

/**
 * Full page, not a dialog — matches the User Details screen it hands off to
 * once the account exists.
 */
function InviteInstallerPage() {
  const navigate = useNavigate();
  const inviteInstaller = useAction(api.users.inviteInstaller);

  const [form, setForm] = useState<FormState>({
    name: "",
    personalEmail: "",
    workEmail: "",
    password: generatePassword(),
    team: NO_TEAM,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [credentials, setCredentials] = useState<Credentials | null>(null);

  function goBack() {
    void navigate({ to: "/users" });
  }

  async function handleCreate() {
    const name = form.name.trim();
    const workEmail = form.workEmail.trim();
    const password = form.password.trim();

    if (name === "") {
      toast.error("Enter the installer's full name");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(workEmail)) {
      toast.error("Enter a work email in a valid format");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    setIsSaving(true);
    try {
      const result = await inviteInstaller({
        full_name: name,
        work_email: workEmail,
        personal_email: form.personalEmail.trim() || undefined,
        team: form.team === NO_TEAM ? undefined : (form.team as Team),
        password,
      });
      setCredentials(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create that account");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Invite Installer"
        description="Create a new installer account with login credentials."
      />

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
          <h1 className="text-lg font-bold text-slate-900">{form.name.trim() || "New Installer"}</h1>
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500 ring-1 ring-inset ring-slate-200">
            Not Created Yet
          </span>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <section className="flex flex-col gap-5 rounded-xl border border-slate-200 bg-white px-6 py-5 lg:col-span-2">
            <h2 className="text-base font-bold text-slate-900">Account Information</h2>

            <Field label="Full Name">
              <Input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="John Smith"
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
                placeholder="john.smith@westernusi.com"
                className="h-[38px] rounded-lg text-sm"
              />
              <p className="mt-1.5 text-xs text-slate-400">
                This becomes the account's Clerk login email — it does not need to be a real inbox.
              </p>
            </Field>

            <Field label="Password">
              <div className="flex items-center gap-2">
                <Input
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
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
                The account is created directly with this password — no verification email is sent.
              </p>
            </Field>

            <Field label="Team">
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
                className="h-[38px] gap-1.5 rounded-lg"
                disabled={isSaving}
                onClick={() => void handleCreate()}
              >
                <UserPlus className="size-4" />
                {isSaving ? "Creating…" : "Create Account"}
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
                Available once the account has been created.
              </p>
              <Button disabled className="h-[38px] w-full gap-1.5 rounded-lg">
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
                Available once the account has been created.
              </p>
              <Button disabled variant="destructive" className="h-[38px] w-full gap-1.5 rounded-lg">
                Delete User
              </Button>
            </section>
          </div>
        </div>
      </div>

      <CredentialsDialog
        open={credentials !== null}
        title="Installer Invited"
        description="Share these credentials with the installer directly — they are not emailed automatically."
        credentials={credentials}
        onOpenChange={(open) => {
          if (open) return;
          setCredentials(null);
          goBack();
        }}
      />
    </>
  );
}
