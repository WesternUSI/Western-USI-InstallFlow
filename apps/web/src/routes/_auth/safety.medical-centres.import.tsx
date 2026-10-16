import { api } from "@usi-installer/backend/convex/_generated/api";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";

import { ExcelDropzone } from "@/components/excel-dropzone";
import { ExcelIcon } from "@/components/excel-icon";
import { UploadErrorDialog, type UploadError } from "@/components/upload-error-dialog";
import { DataTable, Notice, Panel, SafetyButton, SafetyPage, SearchBox } from "@/components/whs/safety-ui";
import { UPLOAD_BATCH_SIZE, chunk } from "@/lib/chunk";
import { toUserMessage } from "@/lib/errors";
import { parseMedicalCentres, type MedicalCentreRow } from "@/lib/parseMedicalCentres";

export const Route = createFileRoute("/_auth/safety/medical-centres/import")({
  component: ImportMedicalCentres,
});

/**
 * Med2 Import Medical Centres File and Med3 Data Imported (preview, then
 * Confirm). Reads the company's sheet in the browser. Confirming works like the
 * site and work order imports: rows already in the list are skipped, only new
 * ones are added (`medicalCentres:importRows`).
 */
function ImportMedicalCentres() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<MedicalCentreRow[] | null>(null);
  const [skipped, setSkipped] = useState(0);
  const [error, setError] = useState<UploadError | null>(null);
  const [query, setQuery] = useState("");
  const importRows = useMutation(api.medicalCentres.importRows);
  const [isImporting, setIsImporting] = useState(false);

  const handleConfirm = async () => {
    if (rows === null) return;
    setIsImporting(true);
    try {
      let added = 0;
      let existing = 0;
      for (const batch of chunk(rows, UPLOAD_BATCH_SIZE)) {
        const result = await importRows({ rows: batch });
        added += result.added;
        existing += result.existing;
      }
      toast.success(
        added === 0
          ? "Nothing new: every centre in this file is already in the list"
          : `${added} medical ${added === 1 ? "centre" : "centres"} added${existing > 0 ? `, ${existing} already in the list` : ""}`,
      );
      void navigate({ replace: true, to: "/safety/medical-centres" });
    } catch (caught) {
      toast.error(toUserMessage(caught, "Couldn't import the medical centres. Please try again."));
    } finally {
      setIsImporting(false);
    }
  };

  const handleFile = async (picked: File) => {
    try {
      const parsed = await parseMedicalCentres(picked);
      if (parsed.rows.length === 0) {
        setError({ title: "No medical centres found", description: "The sheet has the right headings but no rows under them." });
        return;
      }
      setFile(picked);
      setRows(parsed.rows);
      setSkipped(parsed.skipped.length);
    } catch (caught) {
      setError({
        title: "Couldn't read that file",
        description: caught instanceof Error ? caught.message : "Check it is the medical centres sheet and try again.",
      });
    }
  };

  const needle = query.trim().toLowerCase();
  const shown = (rows ?? []).filter((row) => needle === "" || `${row.name} ${row.listed_suburb} ${row.address}`.toLowerCase().includes(needle));

  return (
    <SafetyPage title="Medical Centres" description="Maintain the centre directory published to the installer app." back={{ to: "/safety/medical-centres", label: "Medical Centres" }}>
      {rows === null ? (
        <Panel className="p-6">
          <ExcelDropzone
            label="Upload File"
            onFileSelected={(picked) => void handleFile(picked)}
            onReject={setError}
          />
        </Panel>
      ) : (
        <>
          <Panel>
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <h2 className="text-lg font-semibold text-[#111827]">Medical Centre Details</h2>
              <SearchBox value={query} onChange={setQuery} placeholder="Search by name, suburb, address" />
            </div>
            <DataTable
              rows={shown}
              rowKey={(row) => `${row.listed_suburb}-${row.name}`}
              columns={[
                {
                  key: "centre",
                  header: "Centre / address",
                  render: (row) => (
                    <div className="flex flex-col">
                      <span className="text-[13px] text-[#111827]">{row.name}</span>
                      <span className="text-[11px] font-normal text-[#64748b]">{row.address}</span>
                    </div>
                  ),
                },
                { key: "hours", header: "Mon–Fri", render: (row) => <span className="text-xs">{row.hours_weekdays}</span> },
                { key: "phone", header: "Phone", render: (row) => <span className="text-[13px] text-[#111827]">{row.phone}</span> },
                { key: "suburb", header: "Listed suburb", render: (row) => row.listed_suburb },
                { key: "gps", header: "GPS coordinates", render: (row) => <span className="text-xs">{row.latitude}, {row.longitude}</span> },
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
          {skipped > 0 ? <Notice tone="warning">{skipped} rows were skipped because they had no practice name or no usable GPS coordinates.</Notice> : null}
          <Notice tone="info">Only centres not already in the list are added; ones already there are left as they are. The installer app shows them straight away.</Notice>
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
