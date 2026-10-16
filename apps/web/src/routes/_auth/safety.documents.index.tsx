import { createFileRoute } from "@tanstack/react-router";

import { FilterSelect } from "@/components/filter-select";
import { PagedTable, Panel, RowAction, SafetyButton, SafetyPage, SearchBox, StatusBadge, Toolbar } from "@/components/whs/safety-ui";
import { formatIsoDate } from "@/lib/upload-file";
import { useRegister } from "@/lib/use-register";
import { useListState } from "@/lib/use-list-state";

export const Route = createFileRoute("/_auth/safety/documents/")({
  component: SafetyDocuments,
});

const ALL = "all";
const KINDS = [
  { value: "swms", label: "SWMS" },
  { value: "sds", label: "SDS" },
  { value: "document", label: "Other safety document" },
];

/** Safety Documents (framework 4A), real data, with how many workers still have to acknowledge. */
function SafetyDocuments() {
  const data = useRegister();
  const list = useListState();
  const query = list.get("q", "");
  const setQuery = (value: string) => list.set("q", value);
  const kind = list.get("kind", ALL);
  const setKind = (value: string) => list.set("kind", value);
  const needle = query.trim().toLowerCase();
  const rows = (data?.rows ?? []).filter(
    (row) =>
      (row.category === "swms" || row.category === "sds" || row.category === "document") &&
      (needle === "" || row.name.toLowerCase().includes(needle)) &&
      (kind === ALL || row.category === kind),
  );

  return (
    <SafetyPage title="Safety Documents" description="SWMS, SDS, policies and client documents, with who has acknowledged them.">
      <Panel>
        <Toolbar>
          <div className="w-full sm:flex-1">
            <SearchBox value={query} onChange={setQuery} placeholder="Search documents" />
          </div>
          <FilterSelect label="Type" value={kind} onChange={setKind} options={[{ value: ALL, label: "All" }, ...KINDS]} />
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
            { key: "doc", header: "Document", render: (row) => <span className="text-[#111827]">{row.name}</span> },
            { key: "type", header: "Type", render: (row) => KINDS.find((entry) => entry.value === row.category)?.label },
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
