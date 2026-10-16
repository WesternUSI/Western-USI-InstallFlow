import { api } from "@usi-installer/backend/convex/_generated/api";
import type { Id } from "@usi-installer/backend/convex/_generated/dataModel";
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
import { Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { InviteSentDialog } from "@/components/invite-sent-dialog";
import { useTeamNames } from "@/hooks/use-teams";
import { toUserMessage } from "@/lib/errors";
import type { Team } from "@/lib/teams";

const NO_TEAM = "__none__";
const NO_SUBCONTRACTOR = "__none__";

type InviteRole = "installer" | "subcontractor" | "management" | "admin";

const ROLE_LABELS: Record<InviteRole, string> = {
  installer: "Installer",
  subcontractor: "Subcontractor",
  management: "Management",
  admin: "Admin",
};

const SELECT_TRIGGER_CLASS =
  "h-[38px] w-full rounded-lg border-slate-300 bg-white px-3 text-sm text-slate-800";
const SELECT_CONTENT_CLASS = "rounded-lg border border-slate-200 bg-white shadow-lg";
const SELECT_ITEM_CLASS = "rounded-md px-3 py-2 text-sm text-slate-700";

/** One inline invite form on Users Management: pick a role, and the same
 * name/email fields create an installer (optionally a subcontractor's worker),
 * a subcontractor's login, or an admin. */
export function InviteUserForm() {
  const inviteInstaller = useAction(api.users.inviteInstaller);
  const inviteAdmin = useAction(api.users.inviteAdmin);
  const teamNames = useTeamNames();
  const subcontractors = useQuery(api.subcontractors.list) ?? [];

  const [role, setRole] = useState<InviteRole>("installer");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [team, setTeam] = useState(NO_TEAM);
  const [subcontractor, setSubcontractor] = useState(NO_SUBCONTRACTOR);
  // The select can hand back null for "nothing chosen", so test truthiness, not just the sentinel.
  const hasSubcontractor = !!subcontractor && subcontractor !== NO_SUBCONTRACTOR;
  const [subcontractorMissing, setSubcontractorMissing] = useState(false);
  // A subcontractor's login or worker only sees the WHS side, so they never get a team.
  const whsOnly = role === "subcontractor" || (role === "installer" && hasSubcontractor);
  // Management oversees compliance rather than installing, so they have no team either.
  const noTeam = whsOnly || role === "management";
  const [isSaving, setIsSaving] = useState(false);
  const [sent, setSent] = useState<{ name: string; email: string; team: string } | null>(null);

  async function handleInvite() {
    const fullName = name.trim();
    const workEmail = email.trim();
    const label = ROLE_LABELS[role].toLowerCase();

    if (fullName === "") {
      toast.error(`Enter the ${label}'s full name`);
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(workEmail)) {
      toast.error("Enter a valid email address");
      return;
    }

    if (role === "subcontractor" && !hasSubcontractor) {
      setSubcontractorMissing(true);
      toast.error("Select the subcontractor this person belongs to");
      return;
    }

    setIsSaving(true);
    try {
      if (role === "installer" || role === "subcontractor" || role === "management") {
        await inviteInstaller({
          full_name: fullName,
          work_email: workEmail,
          team: noTeam || team === NO_TEAM ? undefined : (team as Team),
          // Management belongs to Western USI, so never to a subcontractor.
          subcontractor_id:
            role !== "management" && hasSubcontractor ? (subcontractor as Id<"subcontractors">) : undefined,
          role: role === "installer" ? undefined : role,
        });
        setSent({
          name: fullName,
          email: workEmail,
          team: role === "management" ? "None (Management)" : whsOnly ? "None (Safety only)" : team === NO_TEAM ? "Unassigned" : team,
        });
      } else {
        await inviteAdmin({
          full_name: fullName,
          work_email: workEmail,
          team: team === NO_TEAM ? undefined : (team as Team),
        });
        toast.success(`Admin invite sent to ${workEmail}`);
      }
      setName("");
      setEmail("");
      setTeam(NO_TEAM);
      setSubcontractor(NO_SUBCONTRACTOR);
      setSubcontractorMissing(false);
    } catch (error) {
      toast.error(toUserMessage(error, "Could not create that account"));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-1 px-6 pt-5">
          <h2 className="text-base font-bold text-slate-900">Invite New User</h2>
          <p className="text-sm text-slate-500">
            Create an installer, subcontractor or administrator account and share exclusive credentials.
          </p>
        </div>

        <form
          className="flex flex-wrap items-end gap-3 px-6 py-5"
          onSubmit={(event) => {
            event.preventDefault();
            void handleInvite();
          }}
        >
          <div className="min-w-44 flex-1">
            <p className="mb-1.5 text-sm font-medium text-slate-700">Full Name</p>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g., John Smith"
              className="h-[38px] rounded-lg text-sm"
            />
          </div>

          <div className="min-w-56 flex-1">
            <p className="mb-1.5 text-sm font-medium text-slate-700">Email</p>
            <Input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="e.g., john.smith@westernusi.com"
              className="h-[38px] rounded-lg text-sm"
            />
          </div>

          <div className="w-40">
            <p className="mb-1.5 text-sm font-medium text-slate-700">User Role</p>
            <Select value={role} onValueChange={(value) => setRole(value as InviteRole)}>
              <SelectTrigger className={SELECT_TRIGGER_CLASS}>
                <SelectValue placeholder="Select a role">{ROLE_LABELS[role]}</SelectValue>
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false} className={SELECT_CONTENT_CLASS}>
                {(Object.keys(ROLE_LABELS) as InviteRole[]).map((option) => (
                  <SelectItem key={option} value={option} className={SELECT_ITEM_CLASS}>
                    {ROLE_LABELS[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!noTeam && (
            <div className="w-44">
              <p className="mb-1.5 text-sm font-medium text-slate-700">Primary Team (optional)</p>
              <Select value={team} onValueChange={(value) => setTeam(value as string)}>
                <SelectTrigger className={SELECT_TRIGGER_CLASS}>
                  <SelectValue placeholder="Select a team">
                    {team === NO_TEAM ? "Unassigned" : team}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false} className={SELECT_CONTENT_CLASS}>
                  <SelectItem value={NO_TEAM} className={SELECT_ITEM_CLASS}>
                    Unassigned
                  </SelectItem>
                  {teamNames.map((option) => (
                    <SelectItem key={option} value={option} className={SELECT_ITEM_CLASS}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {(role === "installer" || role === "subcontractor") && (
            <div className="w-48">
              <p className="mb-1.5 text-sm font-medium text-slate-700">
                Subcontractor{role === "installer" && " (optional)"}
              </p>
              <Select
                value={hasSubcontractor ? subcontractor : null}
                onValueChange={(value) => {
                  setSubcontractor((value as string | null) ?? NO_SUBCONTRACTOR);
                  setSubcontractorMissing(false);
                }}
              >
                <SelectTrigger
                  className={`${SELECT_TRIGGER_CLASS} ${subcontractorMissing ? "border-red-500" : ""}`}
                  aria-invalid={subcontractorMissing}
                >
                  <SelectValue
                    placeholder={role === "installer" ? "Western USI employee" : "Select a subcontractor"}
                  >
                    {subcontractors.find((option) => option._id === subcontractor)?.name ??
                      (role === "installer" ? "None (Western USI)" : "Select a subcontractor")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false} className={SELECT_CONTENT_CLASS}>
                  {role === "installer" && (
                    <SelectItem value={NO_SUBCONTRACTOR} className={SELECT_ITEM_CLASS}>
                      None (Western USI)
                    </SelectItem>
                  )}
                  {subcontractors.map((option) => (
                    <SelectItem key={option._id} value={option._id} className={SELECT_ITEM_CLASS}>
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {subcontractorMissing && (
                <p className="mt-1 text-xs font-medium text-red-600">Select a subcontractor.</p>
              )}
            </div>
          )}

          <Button type="submit" className="h-[38px] gap-1.5 rounded-lg" disabled={isSaving}>
            {isSaving ? "Sending…" : "Send Invite"}
            <Send className="size-4" />
          </Button>
        </form>
      </section>

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
