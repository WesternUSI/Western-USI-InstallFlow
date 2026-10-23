import { api } from "@usi-installer/backend/convex/_generated/api";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";

import { ExcelDropzone } from "@/components/excel-dropzone";
import { ExcelIcon } from "@/components/excel-icon";
import { UploadErrorDialog, type UploadError } from "@/components/upload-error-dialog";
import { Notice, PagedTable, Panel, SafetyButton, SafetyPage } from "@/components/whs/safety-ui";
import { UPLOAD_BATCH_SIZE, chunk } from "@/lib/chunk";
import { toUserMessage } from "@/lib/errors";
import { parseEquipment, type EquipmentRow } from "@/lib/parseEquipment";
import { formatIsoDate } from "@/lib/upload-file";

export const Route = createFileRoute("/_auth/safety/equipment/import")({
  component: ImportEquipment,
});

const asDate = (value: string | undefined) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? formatIsoDate(value) : (value ?? "—"));

/**
 * Import the height and safety equipment sheet (decision AD49): preview, then
 * Confirm. New items are added; items already there (same type, brand and
 * name/number) take the sheet's values, each change kept in their activity.
 */
function ImportEquipment() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<EquipmentRow[] | null>(null);
  const [skipped, setSkipped] = useState(0);
  const [error, setError] = useState<UploadError | null>(null);
  const importRows = useMutation(api.equipment.importRows);
  const [isImporting, setIsImporting] = useState(false);

  const handleConfirm = async () => {
    if (rows === null) return;
    setIsImporting(true);
    try {
      let added = 0;
      let updated = 0;
      for (const batch of chunk(rows, UPLOAD_BATCH_SIZE)) {
        const result = await importRows({ rows: batch });
        added += result.added;
        updated += result.updated;
      }
      toast.success(
        added === 0 && updated === 0
          ? "Nothing new: every item in this file is already in the list"
          : [added > 0 ? `${added} ${added === 1 ? "item" : "items"} added` : "", updated > 0 ? `${updated} updated` : ""].filter(Boolean).join(", "),
      );
      void navigate({ replace: true, to: "/safety/equipment" });
    } catch (caught) {
      toast.error(toUserMessage(caught, "Couldn't import the equipment. Please try again."));
    } finally {
      setIsImporting(false);
    }
  };

  const handleFile = async (picked: File) => {
    try {
      const parsed = await parseEquipment(picked);
      if (parsed.rows.length === 0) {
        setError({ title: "No equipment found", description: "The sheet has the right headings but no rows under them." });
        return;
      }
      setFile(picked);
      setRows(parsed.rows);
      setSkipped(parsed.skipped.length);
    } catch (caught) {
      setError({
        title: "Couldn't read that file",
        description: caught instanceof Error ? caught.message : "Check it is the equipment register and try again.",
      });
    }
  };

  return (
    <SafetyPage title="Import Equipment" description="Upload the height and safety equipment register." back={{ to: "/safety/equipment", label: "Height & Safety Equipment" }}>
      {rows === null ? (
        <Panel className="p-6">
          <ExcelDropzone label="Upload File" onFileSelected={(picked) => void handleFile(picked)} onReject={setError} />
        </Panel>
      ) : (
        <>
          <Panel>
            <div className="px-5 py-4">
              <h2 className="text-lg font-semibold text-[#111827]">Equipment in this file</h2>
            </div>
            <PagedTable
              rows={rows}
              rowKey={(row) => `${row.type}|${row.brand}|${row.name}`}
              columns={[
                { key: "type", header: "Type", render: (row) => row.type },
                { key: "brand", header: "Brand", render: (row) => row.brand || "—" },
                { key: "name", header: "Name / Number", render: (row) => <span className="text-[#111827]">{row.name}</span> },
                { key: "damage", header: "Damage", render: (row) => row.damage ?? "—" },
                { key: "repair", header: "Repair history", render: (row) => row.repair_history ?? "—" },
                { key: "oos", header: "Out of service", render: (row) => asDate(row.out_of_service_date) },
                { key: "updated", header: "Last updated", render: (row) => asDate(row.last_updated) },
              ]}
            />
          </Panel>
          <Panel className="flex items-center gap-4 p-6">
            <ExcelIcon />
            <div className="flex flex-col gap-1">
              <p className="flex flex-wrap items-center gap-3 text-base font-semibold text-[#111827]">
                {file?.name}
                <span className="rounded-full bg-[#dcfce7] px-3 py-0.5 text-xs font-medium text-[#166534]">{rows.length} rows</span>
              </p>
              <p className="text-[13px] text-[#64748b]">Uploaded just now</p>
            </div>
          </Panel>
          {skipped > 0 ? <Notice tone="warning">{skipped} rows were skipped because they had no type or no name / number.</Notice> : null}
          <Notice tone="info">
            New items are added. An item already in the list (same type, brand and name / number) takes this file's damage, repair history, out of service
            date and last updated where the file has a value; blank cells leave it as it is. Each change is kept in the item's activity.
          </Notice>
          <div className="flex justify-end gap-3">
            <SafetyButton
              variant="secondary"
              disabled={isImporting}
              onClick={() => {
                setRows(null);
                setFile(null);
              }}
            >
              Cancel
            </SafetyButton>
            <SafetyButton disabled={isImporting} onClick={() => void handleConfirm()}>
              {isImporting ? "Importing…" : "Confirm Import"}
            </SafetyButton>
          </div>
        </>
      )}
      <UploadErrorDialog error={error} onClose={() => setError(null)} />
    </SafetyPage>
  );
}
