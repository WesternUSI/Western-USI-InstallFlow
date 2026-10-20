import type { ReactNode } from "react";

import { SideCard } from "@/components/whs/record-cards";
import { Panel, RowAction, SafetyPage } from "@/components/whs/safety-ui";
import { WESTERN_USI_ID } from "@/components/whs/subcontractor-header";
import { type RegisterRow, toVerify } from "@/lib/use-register";

/**
 * Shared pieces of the management dashboard (Figma "Management Flows",
 * decision AD43): the page frame, links that stay inside /management, the
 * status rules and the words for each recorded action.
 */

/** A management page: the Safety page frame without the notification bell. */
export function MgmtPage({
  title,
  description = "Management · All entities",
  back,
  children,
}: {
  title: string;
  description?: string;
  back?: { to: string; label: string; params?: Record<string, string>; search?: Record<string, string> };
  children: ReactNode;
}) {
  return (
    <SafetyPage title={title} description={description} back={back as never} hideBell>
      {children}
    </SafetyPage>
  );
}

/** Statuses that need someone to act (framework 6). */
export const NEEDS_ACTION = ["overdue", "expired", "missing", "action-required", "out-of-service"];

/** Anything not plainly current, or waiting on signatures or an on-site change. */
export function requiresAttention(row: RegisterRow): boolean {
  return row.status !== "current" || (row.outstanding ?? 0) > 0 || (row.changes_to_review ?? 0) > 0;
}

/** Waiting for an admin or management to verify, or an on-site change to approve (decision AD43). */
export function awaitsReview(row: RegisterRow): boolean {
  return toVerify(row) || (row.changes_to_review ?? 0) > 0;
}

/** The worst of several statuses, for one-word summaries (most urgent first). */
const URGENCY = ["out-of-service", "expired", "overdue", "missing", "action-required", "awaiting-verification", "renewal-in-progress", "due-soon", "current"];
export function worstStatus(statuses: string[]): string | undefined {
  return URGENCY.find((status) => statuses.includes(status));
}

/** Where a register row opens on the management side. */
export function mgmtRecordRoute(row: Pick<RegisterRow, "id" | "category">): { to: string; params: Record<string, string> } {
  if (row.category === "accreditation") return { to: "/management/accreditations/$key", params: { key: row.id } };
  if (row.category === "insurance") return { to: "/management/insurance/$policyId", params: { policyId: row.id } };
  if (row.category === "vehicle") return { to: "/management/vehicles/$vehicleId", params: { vehicleId: row.id } };
  if (row.category === "first-aid") return { to: "/management/kits/$kitId", params: { kitId: row.id } };
  return { to: "/management/documents/$documentId", params: { documentId: row.id } };
}

/** "Review" when something waits for management, otherwise "Open". */
export function MgmtRecordAction({ row }: { row: RegisterRow }) {
  const route = mgmtRecordRoute(row);
  return (
    <RowAction to={route.to as never} params={route.params}>
      {awaitsReview(row) ? "Review" : "Open"}
    </RowAction>
  );
}

/** An entity's page on the management side ("western-usi" or a subcontractor id). */
export const mgmtEntityParams = (subcontractorId?: string) => ({ entityId: subcontractorId ?? WESTERN_USI_ID });

/** The words for each recorded action, as on the admin record pages. */
export const ACTIVITY_TEXT: Record<string, string> = {
  added: "Added",
  uploaded: "Uploaded",
  verified: "Verified",
  rejected: "New evidence requested",
  superseded: "Replaced by a newer one",
  reminder_sent: "Reminder sent",
  escalated: "Escalated to management",
  edited: "Details changed",
  archived: "Archived",
  serviced: "Service recorded",
  out_of_service: "Set out of service",
  returned_to_service: "Returned to service",
  inspected: "Inspection submitted",
  resolved: "Corrective action completed",
};

/**
 * An entity's overall status (framework 4D), as its page header shows it:
 * Action required if anything of theirs needs action, including a subcontractor's
 * signed agreement that is missing or past its review date.
 */
export function entityNeedsAction(
  rows: RegisterRow[],
  name: string,
  subcontractorId: string | undefined,
  agreements: { subcontractor_id: string; status: string }[] | undefined,
): boolean {
  const agreement = subcontractorId === undefined ? undefined : agreements?.find((row) => row.subcontractor_id === subcontractorId)?.status;
  return rows.some((row) => row.entity === name && NEEDS_ACTION.includes(row.status)) || agreement === "missing" || agreement === "overdue";
}

/** The Figma's "Reminder schedule" side card: reminders follow the category default, set by Western USI. */
export function ReminderScheduleCard({ text }: { text: string }) {
  return (
    <SideCard title="Reminder schedule">
      <p className="text-[13px] font-medium text-[#111827]">{text}</p>
      <p className="text-xs text-[#64748b]">Automatic reminders follow the category default, managed by Western USI. Contact your administrator for changes.</p>
    </SideCard>
  );
}

/** "Recent activity" lines, newest first. */
export function ActivityPanel({ lines }: { lines: { at: number; text: string; by?: string; details?: string }[] }) {
  return (
    <Panel className="flex flex-col gap-4 p-6">
      <h3 className="text-base font-semibold text-[#111827]">Recent activity</h3>
      {lines.length === 0 ? <p className="text-xs text-[#64748b]">Nothing recorded yet.</p> : null}
      {lines.map((entry, index) => (
        <p key={`${entry.at}-${index}`} className="text-xs text-[#64748b]">
          {new Date(entry.at).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" })} · {entry.text}
          {entry.by ? ` by ${entry.by}` : ""}
          {entry.details ? ` · ${entry.details}` : ""}
        </p>
      ))}
    </Panel>
  );
}
