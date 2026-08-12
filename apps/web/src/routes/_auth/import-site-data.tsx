import { api } from "@usi-installer/backend/convex/_generated/api";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "@usi-installer/ui/components/button";
import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { ExcelDropzone } from "@/components/excel-dropzone";
import { ImportSummaryCard } from "@/components/import-summary-card";
import { PageHeader } from "@/components/page-header";
import { type SiteTableRow, SiteTable } from "@/components/site-table";
import { type ParsedSiteRow, parseSiteDatabase } from "@/lib/parseSiteDatabase";

export const Route = createFileRoute("/_auth/import-site-data")({
  component: ImportSiteDataPage,
});

const PAGE_SIZE = 25;

interface ParsedFile {
  fileName: string;
  rows: ParsedSiteRow[];
  skippedCount: number;
  uploadedAt: Date;
}

function ImportSiteDataPage() {
  const navigate = useNavigate();
  const upsertSites = useMutation(api.sites.upsertSites);
  const user = useQuery(api.users.currentUser);

  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

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
    setParseError(null);
    void file.arrayBuffer().then((buffer) => {
      try {
        const result = parseSiteDatabase(buffer);
        if (result.rows.length === 0) {
          setParseError("No site rows were found in that file.");
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
        setParseError(error instanceof Error ? error.message : "Failed to read that file.");
      }
    });
  }

  async function handleConfirm() {
    if (parsed === null) return;

    setIsImporting(true);
    try {
      const { inserted, updated } = await upsertSites({
        rows: parsed.rows,
        file_name: parsed.fileName,
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
            error={parseError}
          />
        </div>
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
          total={filtered.length}
          page={page}
          pageSize={PAGE_SIZE}
          search={search}
          onSearchChange={(next) => {
            setSearch(next);
            setPage(1);
          }}
          onPageChange={setPage}
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
              setParseError(null);
            }}
          >
            Cancel
          </Button>
          <Button disabled={isImporting} onClick={() => void handleConfirm()}>
            {isImporting ? "Importing…" : "Confirm Import"}
          </Button>
        </div>
      </div>
    </>
  );
}
