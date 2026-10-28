import { createFileRoute } from "@tanstack/react-router";

import { FilterSelect } from "@/components/filter-select";
import { OfficeOnlyTag, PagedTable, Panel, RowAction, SafetyButton, SafetyPage, SearchBox, StatusBadge, Toolbar } from "@/components/whs/safety-ui";
import { formatIsoDate } from "@/lib/upload-file";
import { useRegister } from "@/lib/use-register";
import { useListState } from "@/lib/use-list-state";

export const Route = createFileRoute("/_auth/safety/documents/")({
  component: SafetyDocuments,
});

const ALL = "all";
const IN_APP = "app";
const OFFICE_ONLY = "office";

/** Safety Documents (framework 4A), real data, with how many workers still have to acknowledge. Filtered by each document's own type (decision AD48). */
function SafetyDocuments() {
  const data = useRegister();
  const list = useListState();
  const query = list.get("q", "");
  const setQuery = (value: string) => list.set("q", value);
  const kind = list.get("kind", ALL);
  const setKind = (value: string) => list.set("kind", value);
  // Office-only documents are kept off the installer app (decision AD52).
  const shown = list.get("shown", ALL);
  const setShown = (value: string) => list.set("shown", value);
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
    <SafetyPage title="Safety Documents" description="SWMS, SDS, policies and client documents, with who has acknowledged them.">
      <Panel>
        <Toolbar>
          <div className="w-full sm:flex-1">
            <SearchBox value={query} onChange={setQuery} placeholder="Search documents" />
          </div>
          <FilterSelect label="Type" value={kind} onChange={setKind} options={[{ value: ALL, label: "All" }, ...types.map((type) => ({ value: type, label: type }))]} />
          <FilterSelect
            label="Visibility"
            value={shown}
            onChange={setShown}
            options={[
              { value: ALL, label: "All" },
              { value: IN_APP, label: "In the app" },
              { value: OFFICE_ONLY, label: "Office only" },
            ]}
          />
          <SafetyButton to="/safety/records/new/document" className="h-[38px]">
            + Add Document
          </SafetyButton>
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
            {
              key: "actions",
              header: "Actions",
              align: "right",
              render: (row) => (
                <RowAction to="/safety/documents/$documentId" params={{ documentId: row.id }}>
                  Open
                </RowAction>
              ),
            },
          ]}
        />
      </Panel>
    </SafetyPage>
  );
}
