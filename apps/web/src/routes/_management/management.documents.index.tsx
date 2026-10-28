import { createFileRoute } from "@tanstack/react-router";

import { FilterSelect } from "@/components/filter-select";
import { MgmtPage, MgmtRecordAction } from "@/components/whs/management";
import { OfficeOnlyTag, PagedTable, Panel, SearchBox, StatusBadge, Toolbar } from "@/components/whs/safety-ui";
import { formatIsoDate } from "@/lib/upload-file";
import { useListState } from "@/lib/use-list-state";
import { useRegister } from "@/lib/use-register";

export const Route = createFileRoute("/_management/management/documents/")({
  component: SafetyDocuments,
});

const ALL = "all";
const IN_APP = "app";
const OFFICE_ONLY = "office";

/**
 * Safety Documents for management: the admin's list, read-only, with the
 * same Type and Visibility filters and the "Office only" tag (decision AD52).
 */
function SafetyDocuments() {
  const data = useRegister();
  const list = useListState();
  const query = list.get("q", "");
  const kind = list.get("kind", ALL);
  // Office-only documents are kept off the installer app (decision AD52).
  const shown = list.get("shown", ALL);
  const needle = query.trim().toLowerCase();
  const documents = (data?.rows ?? []).filter((row) => row.category === "swms" || row.category === "sds" || row.category === "document");
  const types = [...new Set(documents.map((row) => row.type).filter((type): type is string => !!type))].sort((a, b) => a.localeCompare(b));
  const rows = documents.filter(
    (row) =>
      (needle === "" || row.name.toLowerCase().includes(needle)) &&
      (kind === ALL || row.type === kind) &&
      (shown === ALL || (shown === OFFICE_ONLY) === !!row.office_only),
  );

  return (
    <MgmtPage title="Safety Documents" description="Management · SWMS, SDS, policies and client documents, with who has acknowledged them">
      <Panel>
        <Toolbar>
          <div className="w-full sm:flex-1">
            <SearchBox value={query} onChange={(value) => list.set("q", value)} placeholder="Search documents" />
          </div>
          <FilterSelect
            label="Type"
            value={kind}
            onChange={(value) => list.set("kind", value)}
            options={[{ value: ALL, label: "All" }, ...types.map((type) => ({ value: type, label: type }))]}
          />
          <FilterSelect
            label="Visibility"
            value={shown}
            onChange={(value) => list.set("shown", value)}
            options={[
              { value: ALL, label: "All" },
              { value: IN_APP, label: "In the app" },
              { value: OFFICE_ONLY, label: "Office only" },
            ]}
          />
        </Toolbar>
        <PagedTable
          page={list.page}
          onPage={list.setPage}
          noun="documents"
          rows={rows}
          rowKey={(row) => row.id}
          empty={data === undefined ? "Loading…" : "No documents match."}
          columns={[
            {
              key: "doc",
              header: "Document",
              render: (row) => (
                <span className="text-[#111827]">
                  {row.name}
                  {row.office_only ? <OfficeOnlyTag /> : null}
                </span>
              ),
            },
            { key: "type", header: "Type", render: (row) => row.type },
            { key: "review", header: "Next review", render: (row) => formatIsoDate(row.due) },
            {
              key: "acks",
              header: "Still to acknowledge",
              render: (row) => (row.outstanding ? <span className="text-[#dc2626]">{row.outstanding}</span> : "—"),
            },
            { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
            { key: "actions", header: "Actions", align: "right", render: (row) => <MgmtRecordAction row={row} /> },
          ]}
        />
      </Panel>
    </MgmtPage>
  );
}
