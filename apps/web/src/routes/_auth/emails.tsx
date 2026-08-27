import { api } from "@usi-installer/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@usi-installer/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@usi-installer/ui/components/table";
import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, Mail, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AddEmailRecipientDialog } from "@/components/add-email-recipient-dialog";
import { PageHeader } from "@/components/page-header";
import { RemoveEmailRecipientDialog } from "@/components/remove-email-recipient-dialog";

export const Route = createFileRoute("/_auth/emails")({
  component: EmailsPage,
});

/** Widths add up to 100% so the table never overflows its card. */
const COLUMNS = [
  { label: "Email Address", width: "w-[38%]", padding: "px-6" },
  { label: "Source", width: "w-[20%]", padding: "px-4" },
  { label: "Status", width: "w-[16%]", padding: "px-4" },
  { label: "Actions", width: "w-[26%]", padding: "px-4" },
] as const;

const PILL =
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset";

function EmailsPage() {
  const recipients = useQuery(api.emails.list);
  const addableUsers = useQuery(api.emails.addableUsers);
  const addRecipient = useMutation(api.emails.addRecipient);
  const setEnabled = useMutation(api.emails.setEnabled);
  const removeRecipient = useMutation(api.emails.removeRecipient);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<{ email: string; isAdmin: boolean } | null>(
    null,
  );

  const enabledCount = recipients?.filter((recipient) => recipient.enabled).length ?? 0;

  async function handleToggle(email: string, enabled: boolean) {
    try {
      await setEnabled({ email, enabled });
      toast.success(enabled ? `Emails resumed for ${email}` : `Emails paused for ${email}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update that address");
    }
  }

  async function handleRemove() {
    if (pendingRemoval === null) return;

    try {
      await removeRecipient({ email: pendingRemoval.email });
      toast.success(`Removed ${pendingRemoval.email}`);
      setPendingRemoval(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove that address");
    }
  }

  return (
    <>
      <PageHeader
        title="Emails"
        description="Choose who is told when an installer completes a work order."
      />

      <div className="flex flex-col gap-4 px-4 py-6">
        <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50/70 px-6 py-4">
          <Mail className="mt-0.5 size-5 shrink-0 text-blue-500" />
          <p className="text-sm leading-relaxed text-blue-900">
            Every address below gets an email the moment an installer marks a work order complete —
            one per work order, carrying the panel details, the notes left on site and the
            completion photo. Admin accounts are on this list by default.
          </p>
        </div>

        {/* Nothing else reports this. With no enabled address the send is
            skipped in the backend and leaves only a line in the Convex logs. */}
        {recipients !== undefined && enabledCount === 0 && (
          <div className="flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 px-6 py-4">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-red-500" />
            <p className="text-sm leading-relaxed text-red-800">
              <span className="font-semibold">No one is receiving completion emails.</span> Work
              orders will still complete normally, but nothing will be sent and nothing will warn
              you again. Turn an address back on, or add one.
            </p>
          </div>
        )}

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
            <h2 className="text-base font-bold text-gray-900">Completion Email Recipients</h2>
            <Button className="h-[38px] rounded-lg" onClick={() => setIsAddOpen(true)}>
              <Plus className="size-4" />
              Add Email
            </Button>
          </div>

          {/* Fixed layout with explicit widths so one long address cannot
              stretch a column; min-width keeps it readable on narrow screens,
              scrolling sideways instead. */}
          <Table className="min-w-[720px] table-fixed">
            <TableHeader>
              <TableRow className="border-slate-200 bg-gray-50 hover:bg-gray-50">
                {COLUMNS.map((column) => (
                  <TableHead
                    key={column.label}
                    className={`${column.width} ${column.padding} py-5 text-[11px] font-bold tracking-[0.55px] whitespace-normal text-slate-500 uppercase`}
                  >
                    {column.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {recipients === undefined && (
                <TableRow>
                  <TableCell colSpan={4} className="px-6 py-10 text-center text-sm text-slate-400">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {recipients !== undefined && recipients.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="px-6 py-10 text-center text-sm text-slate-400">
                    No one is on the list. Add an address to start sending completion emails.
                  </TableCell>
                </TableRow>
              )}
              {recipients?.map((recipient) => (
                <TableRow key={recipient.email} className="border-slate-100">
                  <TableCell className="px-6 py-4">
                    <p className="text-sm font-medium break-all text-slate-800">{recipient.email}</p>
                    {recipient.name !== undefined && (
                      <p className="mt-0.5 text-xs text-slate-500">{recipient.name}</p>
                    )}
                  </TableCell>

                  <TableCell className="px-4 py-4">
                    <span
                      className={`${PILL} ${
                        recipient.source === "admin"
                          ? "bg-blue-50 text-blue-700 ring-blue-200"
                          : "bg-slate-50 text-slate-600 ring-slate-200"
                      }`}
                    >
                      {recipient.source === "admin" ? "Admin" : "Added manually"}
                    </span>
                  </TableCell>

                  <TableCell className="px-4 py-4">
                    <span
                      className={`${PILL} ${
                        recipient.enabled
                          ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                          : "bg-slate-100 text-slate-500 ring-slate-200"
                      }`}
                    >
                      {recipient.enabled ? "Receiving" : "Paused"}
                    </span>
                  </TableCell>

                  <TableCell className="px-4 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleToggle(recipient.email, !recipient.enabled)}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium whitespace-nowrap text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50"
                      >
                        {recipient.enabled ? "Stop emails" : "Resume"}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setPendingRemoval({
                            email: recipient.email,
                            isAdmin: recipient.source === "admin",
                          })
                        }
                        className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium whitespace-nowrap text-red-600 transition-colors hover:border-red-300 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      </div>

      <AddEmailRecipientDialog
        open={isAddOpen}
        users={addableUsers}
        onOpenChange={setIsAddOpen}
        onSubmit={async (emails) => {
          // Added one at a time, and a failure part-way keeps what already
          // went in rather than pretending none of it happened — there is no
          // transaction across mutations, so claiming a rollback would be a lie.
          const failed: string[] = [];
          let added = 0;

          for (const email of emails) {
            try {
              await addRecipient({ email });
              added++;
            } catch {
              failed.push(email);
            }
          }

          if (added > 0) {
            toast.success(`Added ${added} address${added === 1 ? "" : "es"}`);
          }
          if (failed.length > 0) {
            throw new Error(`Could not add ${failed.join(", ")}`);
          }
        }}
      />

      <RemoveEmailRecipientDialog
        open={pendingRemoval !== null}
        email={pendingRemoval?.email ?? ""}
        isAdmin={pendingRemoval?.isAdmin ?? false}
        onOpenChange={(open) => {
          if (!open) setPendingRemoval(null);
        }}
        onConfirm={handleRemove}
      />
    </>
  );
}
