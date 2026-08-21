import { api } from "@usi-installer/backend/convex/_generated/api";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "@usi-installer/ui/components/button";
import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { ExcelDropzone } from "@/components/excel-dropzone";
import type { SearchOption } from "@/components/search-input";
import { SiteDataRequiredDialog } from "@/components/site-data-required-dialog";
import { type UploadError, UploadErrorDialog } from "@/components/upload-error-dialog";
import { UPLOAD_BATCH_SIZE, chunk } from "@/lib/chunk";
import { ImportSummaryCard } from "@/components/import-summary-card";
import { PageHeader } from "@/components/page-header";
import {
  type WorkOrderCounts,
  type WorkOrderTableRow,
  WorkOrderTable,
} from "@/components/work-order-table";
import { detectWorkbookKind, todayIsoDate } from "@/lib/excelParsing";
import { type ParsedWorkOrderRow, parseWorkOrder } from "@/lib/parseWorkOrder";
import type { WorkOrderStatusTab } from "@/lib/workOrderStatus";

export const Route = createFileRoute("/_auth/import-work-orders")({
  component: ImportWorkOrdersPage,
});

const PAGE_SIZE = 25;

interface ParsedFile {
  fileName: string;
  rows: ParsedWorkOrderRow[];
  skippedCount: number;
}

/** Turns a parse failure into something that names the actual problem. */
function describeWorkOrderFailure(buffer: ArrayBuffer, error: unknown): UploadError {
  if (detectWorkbookKind(buffer) === "site_database") {
    return {
      title: "That's the Site Database file",
      description:
        "This looks like the Go Site Database, not an Installation Schedule. Import it under Import Site Data, then come back here for the work orders.",
      action: { to: "/import-site-data", label: "Import Site Data" },
    };
  }

  return {
    title: "This isn't an Installation Schedule",
    description: `No CONTRACTED PANEL ID column was found, so this file can't be read as a work order schedule. (${
      error instanceof Error ? error.message : "Unreadable file"
    })`,
  };
}

function ImportWorkOrdersPage() {
  const navigate = useNavigate();
  const createImport = useMutation(api.imports.createImport);
  const addWorkOrders = useMutation(api.imports.addWorkOrders);
  const finalizeImport = useMutation(api.imports.finalizeImport);
  const deleteImport = useMutation(api.imports.deleteImport);

  // Work orders are matched to sites by panel id, so importing them into an
  // empty Site Database would flag every row as a missing site.
  const hasSites = useQuery(api.sites.hasSites);

  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [uploadError, setUploadError] = useState<UploadError | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showSiteDataGate, setShowSiteDataGate] = useState(false);

  const [status, setStatus] = useState<WorkOrderStatusTab>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const panelSplits = useMemo(
    () => (parsed === null ? [] : [...new Set(parsed.rows.map((row) => row.panel_split))]),
    [parsed],
  );

  // Resolved server-side with the same two-pass lookup the import itself uses,
  // so the preview cannot disagree with what gets written.
  const siteMatches = useQuery(
    api.sites.resolveByPanelSplits,
    parsed === null ? "skip" : { panel_splits: panelSplits },
  );

  const previewRows: WorkOrderTableRow[] = useMemo(() => {
    if (parsed === null || siteMatches === undefined) return [];

    return parsed.rows.map((row, index) => {
      const match = siteMatches[row.panel_split] ?? null;
      return {
        key: `${row.panel_split}-${index}`,
        // Nothing is allocated or completed before the rows exist, so the only
        // meaningful distinction at preview time is whether a site matched.
        status: match === null ? ("missing_site" as const) : ("not_allocated" as const),
        contract_id: row.contract_id,
        advertiser_campaign: row.advertiser_campaign,
        contracted_panel_id: row.contracted_panel_id,
        panel_split: row.panel_split,
        site: row.site,
        panel_name: row.panel_name,
        quantity: row.quantity,
        format: row.format,
        size: row.size,
        proposed_install_date: row.proposed_install_date,
        end_date: row.end_date,
        comments: row.comments,
        existing_advertiser: row.existing_advertiser,
        area_progress: row.area_progress,
        schedule: row.schedule,
        train_line: match?.train_line,
      };
    });
  }, [parsed, siteMatches]);

  // Built from the parsed file rather than the database — these rows do not
  // exist server-side yet, and suggesting from them costs nothing.
  const searchOptions = useMemo(() => {
    const seen = new Map<string, SearchOption>();
    const add = (value: string | undefined, kind: string) => {
      const trimmed = value?.trim();
      if (!trimmed) return;
      const key = `${kind}:${trimmed.toLowerCase()}`;
      if (!seen.has(key)) seen.set(key, { value: trimmed, kind });
    };

    for (const row of previewRows) {
      add(row.site, "Location");
      add(row.panel_split, "Panel ID");
      add(row.advertiser_campaign, "Advertiser");
    }
    return [...seen.values()];
  }, [previewRows]);

  const searched = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (needle === "") return previewRows;

    return previewRows.filter((row) =>
      [row.site, row.panel_split, row.advertiser_campaign, row.existing_advertiser, row.train_line]
        .filter((field): field is string => field !== undefined)
        .some((field) => field.toLowerCase().includes(needle)),
    );
  }, [previewRows, search]);

  const counts: WorkOrderCounts = useMemo(() => {
    const next = { all: 0, completed: 0, allocated: 0, not_allocated: 0, missing_site: 0 };
    for (const row of searched) {
      next.all++;
      if (row.status === "missing_site") next.missing_site++;
      if (row.status === "not_allocated") next.not_allocated++;
    }
    return next;
  }, [searched]);

  const filtered = useMemo(
    () => (status === "all" ? searched : searched.filter((row) => row.status === status)),
    [searched, status],
  );

  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const missingSites = counts.missing_site;

  function handleFile(file: File) {
    if (hasSites === false) {
      setShowSiteDataGate(true);
      return;
    }

    setUploadError(null);
    void file.arrayBuffer().then((buffer) => {
      try {
        const result = parseWorkOrder(buffer);
        if (result.rows.length === 0) {
          setUploadError({
            title: "That file has no work orders",
            description:
              "The Installation Schedule columns were found, but every row was empty or incomplete. Check the file and try again.",
          });
          return;
        }
        setParsed({
          fileName: file.name,
          rows: result.rows,
          skippedCount: result.skipped.length,
        });
        setStatus("all");
        setSearch("");
        setPage(1);
      } catch (error) {
        setUploadError(describeWorkOrderFailure(buffer, error));
      }
    });
  }

  async function handleConfirm() {
    if (parsed === null) return;

    setIsImporting(true);
    setProgress(0);

    const importId = await createImport({
      file_name: parsed.fileName,
      upload_date: todayIsoDate(),
    });

    try {
      // Written in batches: one Convex mutation is a single transaction, so a
      // long schedule is spread across several of them.
      let missing = 0;
      let done = 0;

      for (const rows of chunk(parsed.rows, UPLOAD_BATCH_SIZE)) {
        const result = await addWorkOrders({ import_id: importId, rows });
        missing += result.missing_sites;
        done += rows.length;
        setProgress(done);
      }

      await finalizeImport({
        import_id: importId,
        total_rows: parsed.rows.length,
        missing_sites: missing,
      });

      toast.success(
        `Imported ${parsed.rows.length.toLocaleString()} work orders` +
          (missing > 0 ? `, ${missing} without a matching site` : ""),
      );
      void navigate({ to: "/dashboard" });
    } catch (error) {
      // Roll the half-written import back so it never shows on the dashboard.
      try {
        let remaining = 1;
        while (remaining > 0) {
          remaining = (await deleteImport({ import_id: importId })).remaining;
        }
      } catch {
        // The rollback is best effort; the original failure is what matters.
      }
      toast.error(error instanceof Error ? error.message : "Import failed");
    } finally {
      setIsImporting(false);
    }
  }

  if (parsed === null) {
    return (
      <>
        <PageHeader
          title="Import Work Orders"
          description="Upload daily Excel file to import work orders into the system."
        />
        <div className="px-4 py-6">
          <ExcelDropzone onFileSelected={handleFile} onReject={setUploadError} />
        </div>
        <SiteDataRequiredDialog open={showSiteDataGate} onOpenChange={setShowSiteDataGate} />
        <UploadErrorDialog error={uploadError} onClose={() => setUploadError(null)} />
      </>
    );
  }

  const isResolving = siteMatches === undefined;

  return (
    <>
      <PageHeader
        title="Import Work Orders"
        description="Review import summary and confirm to import work orders."
      />
      <div className="flex flex-col gap-4 px-4 py-6">
        {isResolving ? (
          <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-400 shadow-sm">
            Matching {parsed.rows.length.toLocaleString()} rows against the Site Database…
          </div>
        ) : (
          <WorkOrderTable
            title="Details by Status"
            rows={pageRows}
            counts={counts}
            status={status}
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
            onStatusChange={(next) => {
              setStatus(next);
              setPage(1);
            }}
            onSearchChange={(next) => {
              setSearch(next);
              setPage(1);
            }}
          />
        )}

        <ImportSummaryCard
          name={parsed.fileName}
          badgeText={`${parsed.rows.length.toLocaleString()} Orders`}
          lines={
            parsed.skippedCount > 0
              ? [
                  `${parsed.skippedCount} duplicate or incomplete rows were skipped while reading the file`,
                ]
              : undefined
          }
          stats={{ totalRows: parsed.rows.length, missingSites }}
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
          <Button disabled={isImporting || isResolving} onClick={() => void handleConfirm()}>
            {isImporting
              ? `Importing… ${progress.toLocaleString()} / ${parsed.rows.length.toLocaleString()}`
              : "Confirm Import"}
          </Button>
        </div>
      </div>
    </>
  );
}
