import { api } from "@usi-installer/backend/convex/_generated/api";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "@usi-installer/ui/components/button";
import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { ExcelDropzone } from "@/components/excel-dropzone";
import { type UploadError, UploadErrorDialog } from "@/components/upload-error-dialog";
import { UPLOAD_BATCH_SIZE, chunk } from "@/lib/chunk";
import { detectWorkbookKind } from "@/lib/excelParsing";
import { ImportSummaryCard } from "@/components/import-summary-card";
import { PageHeader } from "@/components/page-header";
import type { SearchOption } from "@/components/search-input";
import { type SiteTableRow, SiteTable } from "@/components/site-table";
import { type ParsedSiteRow, parseSiteDatabase } from "@/lib/parseSiteDatabase";

export const Route = createFileRoute("/_auth/import-site-data")({
  component: ImportSiteDataPage,
});

const PAGE_SIZE = 25;

/** Turns a parse failure into something that names the actual problem. */
function describeSiteFailure(buffer: ArrayBuffer, error: unknown): UploadError {
  if (detectWorkbookKind(buffer) === "work_order") {
    return {
      title: "That's the Installation Schedule file",
      description:
        "This looks like a daily Installation Schedule, not the Go Site Database. Import it under Import Work Orders, then come back here for the site data.",
      action: { to: "/import-work-orders", label: "Import Work Orders" },
    };
  }

  return {
    title: "This isn't a Site Database",
    description: `No LOCATION and PANEL ID columns were found, so this file can't be read as site data. (${
      error instanceof Error ? error.message : "Unreadable file"
    })`,
  };
}

interface ParsedFile {
  fileName: string;
  rows: ParsedSiteRow[];
  skippedCount: number;
  uploadedAt: Date;
}

function ImportSiteDataPage() {
  const navigate = useNavigate();
  const upsertSites = useMutation(api.sites.upsertSites);
  const recordSiteImport = useMutation(api.sites.recordSiteImport);
  const user = useQuery(api.users.currentUser);

  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [uploadError, setUploadError] = useState<UploadError | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState(0);

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const tableRows: SiteTableRow[] = useMemo(() => {
    if (parsed === null) return [];

    return parsed.rows.map((row, index) => ({
      key: `${row.panel_id}-${index}`,
      area: row.area,
      site: row.site,
      panel_id: row.panel_id,
      quantity: row.quantity,
      size: row.size,
      missing_value: row.missing_value,
    }));
  }, [parsed]);

  // Built from the parsed file rather than the database — these rows have not
  // been imported yet, and suggesting from them costs nothing.
  const searchOptions = useMemo(() => {
    const seen = new Map<string, SearchOption>();
    const add = (value: string | undefined, kind: string) => {
      const trimmed = value?.trim();
      if (!trimmed) return;
      const key = `${kind}:${trimmed.toLowerCase()}`;
      if (!seen.has(key)) seen.set(key, { value: trimmed, kind });
    };

    for (const row of tableRows) {
      add(row.area, "Location");
      add(row.site, "Details");
      add(row.panel_id, "Panel ID");
    }
    return [...seen.values()];
  }, [tableRows]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (needle === "") return tableRows;

    return tableRows.filter((row) =>
      [row.area, row.site, row.panel_id, row.size]
        .filter((field): field is string => field !== undefined)
        .some((field) => field.toLowerCase().includes(needle)),
    );
  }, [tableRows, search]);

  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function handleFile(file: File) {
    setUploadError(null);
    void file.arrayBuffer().then((buffer) => {
      try {
        const result = parseSiteDatabase(buffer);
        if (result.rows.length === 0) {
          setUploadError({
            title: "That file has no sites",
            description:
              "The Site Database columns were found, but every row was empty or missing a Panel ID. Check the file and try again.",
          });
          return;
        }
        setParsed({
          fileName: file.name,
          rows: result.rows,
          skippedCount: result.skipped.length,
          uploadedAt: new Date(),
        });
        setSearch("");
        setPage(1);
      } catch (error) {
        setUploadError(describeSiteFailure(buffer, error));
      }
    });
  }

  async function handleConfirm() {
    if (parsed === null) return;

    setIsImporting(true);
    setProgress(0);
    try {
      // Applied in batches: one Convex mutation is a single transaction, and a
      // full Site Database is far too many rows for one of them.
      const batches = chunk(parsed.rows, UPLOAD_BATCH_SIZE);
      let inserted = 0;
      let updated = 0;
      let done = 0;

      for (const rows of batches) {
        const result = await upsertSites({ rows });
        inserted += result.inserted;
        updated += result.updated;
        done += rows.length;
        setProgress(done);
      }

      await recordSiteImport({
        file_name: parsed.fileName,
        total_rows: parsed.rows.length,
        inserted,
        updated,
      });

      toast.success(
        `Site database updated: ${inserted.toLocaleString()} added, ${updated.toLocaleString()} updated`,
      );
      void navigate({ to: "/dashboard" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed");
    } finally {
      setIsImporting(false);
    }
  }

  if (parsed === null) {
    return (
      <>
        <PageHeader
          title="Import Site Database"
          description="Upload site database file to import into the system."
        />
        <div className="px-4 py-6">
          <ExcelDropzone
            label="Upload File"
            dropText="Drag and drop your file here"
            onFileSelected={handleFile}
            onReject={setUploadError}
          />
        </div>
        <UploadErrorDialog error={uploadError} onClose={() => setUploadError(null)} />
      </>
    );
  }

  const uploadedOn = parsed.uploadedAt.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const lines = [`Uploaded on ${uploadedOn} · Uploaded by ${user?.name ?? "you"}`];
  if (parsed.skippedCount > 0) {
    lines.push(
      `${parsed.skippedCount} duplicate or incomplete rows were skipped while reading the file`,
    );
  }

  return (
    <>
      <PageHeader
        title="Import Site Database"
        description="Upload site database file to import into the system."
      />
      <div className="flex flex-col gap-4 px-4 py-6">
        <SiteTable
          title="Site Details"
          rows={pageRows}
          search={search}
          searchOptions={searchOptions}
          pagination={{
            shown: pageRows.length,
            total: filtered.length,
            page,
            pageSize: PAGE_SIZE,
            hasPrevious: page > 1,
            hasNext: page * PAGE_SIZE < filtered.length,
            onPrevious: () => setPage(page - 1),
            onNext: () => setPage(page + 1),
          }}
          onSearchChange={(next) => {
            setSearch(next);
            setPage(1);
          }}
        />

        <ImportSummaryCard
          name={parsed.fileName}
          badgeText={`${parsed.rows.length.toLocaleString()} Rows`}
          lines={lines}
        />

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            disabled={isImporting}
            onClick={() => {
              setParsed(null);
              setUploadError(null);
            }}
          >
            Cancel
          </Button>
          <Button disabled={isImporting} onClick={() => void handleConfirm()}>
            {isImporting
              ? `Importing… ${progress.toLocaleString()} / ${parsed.rows.length.toLocaleString()}`
              : "Confirm Import"}
          </Button>
        </div>
      </div>
    </>
  );
}
