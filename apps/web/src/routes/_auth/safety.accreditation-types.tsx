import { api } from "@usi-installer/backend/convex/_generated/api";
import type { Id } from "@usi-installer/backend/convex/_generated/dataModel";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";

import { ReasonDialog } from "@/components/whs/reason-dialog";
import { Notice, PagedTable, Panel, RowAction, SafetyPage } from "@/components/whs/safety-ui";
import { WESTERN_USI_ID } from "@/components/whs/subcontractor-header";
import { toUserMessage } from "@/lib/errors";

export const Route = createFileRoute("/_auth/safety/accreditation-types")({
  component: AllAccreditations,
});

type TypeRow = { id: string; name: string; required_for: string[] };

/**
 * All Accreditations (decision AD54): every accreditation in the system, which
 * companies use it, and Remove from system. Adding one and choosing who needs
 * it is done on each company's Accreditations tab (AD37, AD53).
 */
function AllAccreditations() {
  const types = useQuery(api.accreditationTypes.list);
  const subcontractors = useQuery(api.subcontractors.list);
  const remove = useMutation(api.accreditationTypes.adminRemove);
  const [removing, setRemoving] = useState<TypeRow | null>(null);

  const entities = [
    { id: WESTERN_USI_ID, name: "Western USI" },
    ...(subcontractors ?? []).map((sub) => ({ id: sub._id as string, name: sub.name })),
  ];
  const usedBy = (row: TypeRow) => {
    if (row.required_for.length === 0) return "No company";
    if (entities.length > 1 && entities.every((entity) => row.required_for.includes(entity.id))) return "Every company";
    return entities
      .filter((entity) => row.required_for.includes(entity.id))
      .map((entity) => entity.name)
      .join(", ");
  };

  const handleRemove = async (reason: string) => {
    if (removing === null) return;
    try {
      await remove({ type_id: removing.id as Id<"accreditation_types">, reason });
      toast.success(`${removing.name} removed from the system`);
    } catch (error) {
      toast.error(toUserMessage(error, "Could not remove that accreditation."));
      throw error;
    }
  };

  return (
    <SafetyPage
      title="All Accreditations"
      description="Every accreditation in the system and the companies that use it."
      back={{ to: "/safety/accreditations", label: "Worker Accreditations" }}
    >
      <Panel>
        <PagedTable
          rows={types ?? []}
          rowKey={(row) => row.id}
          empty={types === undefined ? "Loading…" : "No accreditations yet."}
          columns={[
            { key: "name", header: "Accreditation", render: (row) => <span className="text-[#111827]">{row.name}</span> },
            { key: "used", header: "Used by", render: (row) => <span className="text-[13px]">{usedBy(row)}</span> },
            {
              key: "action",
              header: "Action",
              align: "right",
              render: (row) => <RowAction onClick={() => setRemoving(row)}>Remove from system</RowAction>,
            },
          ]}
        />
      </Panel>
      <Notice tone="info">
        To add an accreditation or choose who needs it, open the company under Subcontractors (or Western USI) and use its Accreditations
        tab.
      </Notice>
      <ReasonDialog
        open={removing !== null}
        title={`Remove ${removing?.name ?? ""} from the system?`}
        description={`It comes off every company's list and everyone is unticked, so no one is asked for it and no reminders go out. Cards people already uploaded for it are hidden everywhere: the register, Worker Accreditations, the matrix, the reports and the app. Nothing is wiped: it's kept in the history with your reason, and adding an accreditation with the same name later brings it back with those cards.`}
        placeholder="e.g. We no longer work at airports"
        confirmLabel="Remove from system"
        missingMessage="Enter the reason for removing it"
        onClose={() => setRemoving(null)}
        onConfirm={handleRemove}
      />
    </SafetyPage>
  );
}
