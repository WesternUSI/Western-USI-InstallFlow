import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@usi-installer/ui/components/dialog";
import { useState } from "react";
import { toast } from "sonner";

import { ReasonDialog } from "@/components/whs/reason-dialog";
import { CheckboxRow, Field, SelectInput, TextArea, TextInput } from "@/components/whs/safety-form";
import { toUserMessage } from "@/lib/errors";

import { DetailGrid, Notice, PagedTable, Panel, RowAction, SafetyButton, SafetyPage, StatusBadge } from "@/components/whs/safety-ui";
import {
  SubcontractorHeader,
  SubcontractorTabs,
  useAgreement,
  useSubcontractor,
  WESTERN_USI_ID,
  type SubcontractorTab,
} from "@/components/whs/subcontractor-header";
import { api } from "@usi-installer/backend/convex/_generated/api";
import type { HistoryEvent } from "@usi-installer/backend/convex/whsAdmin";
import type { Id } from "@usi-installer/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";

import { useEntityRows } from "@/components/whs/subcontractor-header";
import { useListState } from "@/lib/use-list-state";
import { documentTypeLabel } from "@/lib/document-kinds";
import { formatIsoDate, formatTime } from "@/lib/upload-file";
import type { RegisterRow } from "@/lib/use-register";

const TEXT_LINK = "text-[13px] font-semibold text-[#2563eb] hover:underline";
const TAB_IDS: SubcontractorTab[] = ["overview", "business", "workers", "accreditations", "documents", "requirements", "history"];

export const Route = createFileRoute("/_auth/safety/subcontractors/$subcontractorId/")({
  validateSearch: (search: Record<string, unknown>): { tab?: SubcontractorTab; page?: string } => ({
    tab: TAB_IDS.includes(search.tab as SubcontractorTab) ? (search.tab as SubcontractorTab) : undefined,
    page: search.page === undefined || search.page === "" ? undefined : String(search.page),
  }),
  component: SubcontractorProfile,
});

/**
 * SC02 Overview, SC03 Business records, SC10 Workers, SC11 WHS requirements:
 * one subcontractor profile (framework 4D) with tabs. Header from the real
 * subcontractor; the tab contents are sample data until each is wired.
 */
function SubcontractorProfile() {
  const { subcontractorId } = Route.useParams();
  const { tab = "overview" } = Route.useSearch();
  const { subcontractor, isWesternUsi } = useSubcontractor(subcontractorId);
  const name = subcontractor?.name ?? "Subcontractor";

  return (
    <SafetyPage
      title={tab === "overview" ? name : `${name} · ${{ business: "Business Records", workers: "Workers", accreditations: "Accreditations", documents: "Documents", requirements: "WHS Requirements", history: "History", overview: "" }[tab]}`}
      description={isWesternUsi ? "Safety · Western USI" : "Safety / Subcontractors · Administrator"}
      back={isWesternUsi ? { to: "/safety", label: "Safety Dashboard" } : { to: "/safety/subcontractors", label: "Subcontractors" }}
    >
      <SubcontractorHeader subcontractorId={subcontractorId} />
      <SubcontractorTabs subcontractorId={subcontractorId} active={tab} />
      {tab === "overview" && <OverviewTab subcontractorId={subcontractorId} name={name} isWesternUsi={isWesternUsi} />}
      {tab === "business" && <BusinessTab subcontractorId={subcontractorId} isWesternUsi={isWesternUsi} />}
      {tab === "workers" && <WorkersTab subcontractorId={subcontractorId} name={name} isWesternUsi={isWesternUsi} />}
      {tab === "accreditations" && <AccreditationsTab subcontractorId={subcontractorId} name={name} />}
      {tab === "documents" && <DocumentsTab subcontractorId={subcontractorId} name={name} />}
      {tab === "requirements" && <RequirementsTab subcontractorId={subcontractorId} name={name} isWesternUsi={isWesternUsi} />}
      {tab === "history" && <HistoryTab subcontractorId={subcontractorId} isWesternUsi={isWesternUsi} />}
    </SafetyPage>
  );
}

/** SC02 Overview, real: a summary per requirement area from the register (framework 4D). */
function OverviewTab({ subcontractorId, name, isWesternUsi }: { subcontractorId: string; name: string; isWesternUsi: boolean }) {
  const rows = useEntityRows(name) ?? [];
  const count = (category: string, statuses: string[]) => rows.filter((row) => row.category === category && statuses.includes(row.status)).length;
  const insurance = rows.filter((row) => row.category === "insurance");
  const accreditations = rows.filter((row) => row.category === "accreditation");
  const workers = new Set(accreditations.map((row) => row.person)).size;
  const kits = rows.filter((row) => row.category === "first-aid");
  const agreement = useAgreement(subcontractorId);
  const swms = useSwmsSignoffs(name);
  const typeCount = new Set(accreditations.map((row) => row.name)).size;
  const notSigned = swms.filter((row) => row.signed_at === undefined).length;
  const problems = [
    agreement?.status === "missing" ? "no signed agreement on file" : "",
    agreement?.status === "overdue" ? "the agreement is past its review date" : "",
    count("insurance", ["expired", "missing", "action-required"]) > 0 ? "insurance needs renewing" : "",
    count("accreditation", ["expired"]) > 0 ? `${count("accreditation", ["expired"])} expired accreditations` : "",
    count("accreditation", ["missing"]) > 0 ? `${count("accreditation", ["missing"])} missing accreditations` : "",
    count("first-aid", ["overdue", "action-required"]) > 0 ? "a first-aid kit needs action" : "",
  ].filter(Boolean);

  const areas = [
    {
      area: "Business insurance",
      summary:
        insurance.length === 0
          ? "No policies recorded"
          : insurance.map((row) => `${row.name} ${row.status === "current" ? "current" : row.status.replace("-", " ")}`).join(" · "),
      action: "Manage policies",
      tab: "business" as const,
    },
    // Only subcontractors sign a subcontractor agreement (framework 4D).
    ...(isWesternUsi
      ? []
      : [
          {
            area: "Signed subcontractor agreement",
            summary:
              agreement === undefined
                ? "…"
                : agreement.current === null
                  ? "Not on file"
                  : `Signed ${formatIsoDate(agreement.current.signed_on)} · review ${formatIsoDate(agreement.current.review_date)}`,
            action: "View agreement",
            tab: "business" as const,
          },
        ]),
    {
      area: "Worker accreditations",
      summary: `${workers} ${workers === 1 ? "worker" : "workers"} · ${count("accreditation", ["expired"])} expired · ${count("accreditation", ["missing"])} missing · ${count("accreditation", ["awaiting-verification", "renewal-in-progress"])} awaiting verification`,
      action: "Manage workers",
      tab: "workers" as const,
    },
    { area: "First-aid kits", summary: kits.length === 0 ? "No kits assigned to their workers" : `${kits.length} kits · ${count("first-aid", ["overdue", "action-required"])} need action`, action: "View kits", tab: "kits" as const },
    {
      area: "Required inductions, SWMS and client requirements",
      summary: `${typeCount} accreditation ${typeCount === 1 ? "type" : "types"} · ${new Set(swms.map((row) => row.document_id)).size} SWMS · ${notSigned} ${notSigned === 1 ? "signature" : "signatures"} outstanding`,
      action: "View requirements",
      tab: "requirements" as const,
    },
  ];

  return (
    <>
      {problems.length > 0 ? <Notice tone="warning">Action required · {problems.join(", ")}.</Notice> : <Notice tone="success">Everything recorded for {name} is current.</Notice>}
      <Panel>
        <PagedTable
          rows={areas}
          rowKey={(row) => row.area}
          columns={[
            { key: "area", header: "Requirement area", render: (row) => <span className="text-[#111827]">{row.area}</span> },
            { key: "summary", header: "Summary", render: (row) => <span className="text-[13px] text-[#111827]">{row.summary}</span> },
            {
              key: "action",
              header: "Action",
              render: (row) =>
                row.tab === "kits" ? (
                  <Link className={TEXT_LINK} to="/safety/kits">{row.action}</Link>
                ) : (
                  <Link className={TEXT_LINK} to="/safety/subcontractors/$subcontractorId" params={{ subcontractorId }} search={{ tab: row.tab }}>
                    {row.action}
                  </Link>
                ),
            },
          ]}
        />
      </Panel>
    </>
  );
}

/** SC03 Business records, real: this subcontractor's insurance policies (framework 4C, 4D). */
function BusinessTab({ subcontractorId, isWesternUsi }: { subcontractorId: string; isWesternUsi: boolean }) {
  // Western USI's own policies have no subcontractor.
  const policies = (useQuery(api.insurance.list) ?? []).filter((policy) =>
    subcontractorId === WESTERN_USI_ID ? policy.subcontractor_id === undefined : policy.subcontractor_id === subcontractorId,
  );
  return (
    <>
      <Panel className="flex flex-wrap items-center justify-between gap-4 rounded-[12px] p-6">
        <div className="flex flex-col gap-1">
          <h3 className="text-lg font-semibold text-[#111827]">Required documents</h3>
          <p className="text-[13px] text-[#64748b]">Add the insurance policies needed from this subcontractor.</p>
        </div>
        <SafetyButton to="/safety/records/new/insurance">Add Policy</SafetyButton>
      </Panel>
      <Panel>
        <PagedTable
          rows={policies}
          rowKey={(row) => row.id}
          empty="No policies recorded for this subcontractor yet."
          columns={[
            { key: "name", header: "Business requirement", render: (row) => <span className="text-[#111827]">{row.type}</span> },
            { key: "detail", header: "Policy / coverage", render: (row) => `${row.insurer} · ${row.coverage}` },
            { key: "due", header: "Due date", render: (row) => formatIsoDate(row.expires) },
            { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
            {
              key: "action",
              header: "Action",
              render: (row) =>
                row.status === "expired" || row.status === "due-soon" ? (
                  <Link className={TEXT_LINK} to="/safety/insurance/$policyId/renew" params={{ policyId: row.id }}>Upload renewal</Link>
                ) : (
                  <Link className={TEXT_LINK} to="/safety/insurance/$policyId" params={{ policyId: row.id }}>View policy</Link>
                ),
            },
          ]}
        />
      </Panel>
      {isWesternUsi ? null : <AgreementCard subcontractorId={subcontractorId} />}
      <Notice tone="info">Business insurance and the signed agreement belong to this entity. Worker licences and accreditations are managed under Workers.</Notice>
    </>
  );
}

/** The signed subcontractor agreement (framework 4D, decision R5): the current one, then earlier ones. */
function AgreementCard({ subcontractorId }: { subcontractorId: string }) {
  const agreement = useAgreement(subcontractorId);
  if (agreement === undefined) return null;
  const current = agreement.current;
  return (
    <Panel className="flex flex-col gap-4 rounded-[12px] p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="text-lg font-semibold text-[#111827]">Signed subcontractor agreement</h3>
          <p className="text-[13px] text-[#64748b]">The contract between this subcontractor and Western USI.</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={agreement.status} label={agreement.status === "missing" ? "Not on file" : undefined} />
          <SafetyButton to="/safety/subcontractors/$subcontractorId/agreement" params={{ subcontractorId }}>
            {current === null ? "Upload Agreement" : "Upload New Agreement"}
          </SafetyButton>
        </div>
      </div>
      {current === null ? null : (
        <DetailGrid
          columns={4}
          items={[
            { label: "Signed on", value: formatIsoDate(current.signed_on) },
            { label: "Review date", value: formatIsoDate(current.review_date) },
            { label: "Responsible", value: current.responsible },
            {
              label: "File",
              value: current.file_url ? (
                <a className={TEXT_LINK} href={current.file_url} target="_blank" rel="noreferrer">
                  {current.file_name}
                </a>
              ) : (
                current.file_name
              ),
            },
          ]}
        />
      )}
      {current?.notes ? <p className="text-[13px] text-[#64748b]">{current.notes}</p> : null}
      {agreement.previous.length > 0 ? (
        <div className="flex flex-col gap-1 border-t border-[#e2e8f0] pt-3">
          <p className="text-xs font-semibold text-[#64748b]">Earlier agreements (kept on file)</p>
          {agreement.previous.map((row) => (
            <p key={row.id} className="text-xs text-[#64748b]">
              Signed {formatIsoDate(row.signed_on)} · uploaded {formatTime(row.uploaded_at)} ·{" "}
              {row.file_url ? (
                <a className="text-[#2563eb] hover:underline" href={row.file_url} target="_blank" rel="noreferrer">
                  {row.file_name}
                </a>
              ) : (
                row.file_name
              )}
            </p>
          ))}
        </div>
      ) : null}
    </Panel>
  );
}

/**
 * SC10 Workers, real: the people attached to this subcontractor. Subcontractor
 * people never join a team (decision A2); they are invited from Users.
 */
function WorkersTab({ subcontractorId, name, isWesternUsi }: { subcontractorId: string; name: string; isWesternUsi: boolean }) {
  const users = useQuery(api.users.list);
  const logins = useQuery(api.subcontractors.logins, isWesternUsi ? "skip" : { subcontractor_id: subcontractorId });
  const setSoleTrader = useMutation(api.users.setSoleTrader);
  const [saving, setSaving] = useState<string | null>(null);
  const loginOf = (id: string) => logins?.find((login) => login.id === id);

  // The sole-trader switch (decision R6): on, the login must hold its own accreditations; off always wins.
  const toggle = async (userId: string, on: boolean) => {
    setSaving(userId);
    try {
      await setSoleTrader({ user_id: userId, sole_trader: on });
      toast.success(on ? "Set as a sole trader: they must hold their own accreditations" : "No longer a worker: their accreditations aren't required");
    } catch (error) {
      toast.error(toUserMessage(error, "Could not change that. Please try again."));
    } finally {
      setSaving(null);
    }
  };
  // Western USI's workers are its installers with no subcontractor.
  const people = (users ?? []).filter((user) =>
    isWesternUsi ? user.subcontractor === undefined && user.role === "installer" : user.subcontractor === name,
  );

  return (
    <>
      <Panel className="flex flex-wrap items-center justify-between gap-4 rounded-[12px] p-6">
        <div>
          <h3 className="text-sm font-bold text-[#111827]">Invite New Worker</h3>
          <p className="text-xs text-[#64748b]">
            {isWesternUsi
              ? "Western USI installers are invited from Users."
              : `Workers for ${name} are invited from Users, with ${name} chosen as their subcontractor.`}
          </p>
        </div>
        <SafetyButton to="/users">Invite on Users</SafetyButton>
      </Panel>
      <Panel>
        <PagedTable
          rows={people}
          rowKey={(row) => row._id}
          empty={users === undefined ? "Loading…" : "No workers yet."}
          columns={[
            { key: "user", header: "User", render: (row) => <span className="font-semibold text-[#111827]">{row.name}</span> },
            { key: "email", header: "Username / email", render: (row) => row.email },
            { key: "role", header: "Role", render: (row) => (row.role === "subcontractor" ? "Subcontractor login" : "Installer") },
            {
              key: "worker",
              header: "Also a worker",
              render: (row) => {
                if (row.role !== "subcontractor") return "Yes";
                const login = loginOf(row._id);
                if (login === undefined) return "—";
                const why =
                  login.sole_trader === true
                    ? "Set as a sole trader"
                    : login.sole_trader === false
                      ? "Switched off"
                      : login.is_worker
                        ? login.opened_app
                          ? "Automatic: uses the installer app"
                          : "Automatic: has evidence on file"
                        : "Automatic: hasn't used the installer app";
                return (
                  <label className="flex cursor-pointer items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 accent-[#2563eb]"
                      checked={login.is_worker}
                      disabled={saving === row._id}
                      onChange={(event) => void toggle(row._id, event.target.checked)}
                    />
                    <span className="flex flex-col">
                      <span className="text-[13px] text-[#111827]">Sole trader</span>
                      <span className="text-[11px] text-[#64748b]">{why}</span>
                    </span>
                  </label>
                );
              },
            },
            { key: "status", header: "Status", render: (row) => <span className="text-[13px] text-[#111827]">{String(row.status).replace(/_/g, " ")}</span> },
            {
              key: "actions",
              header: "Actions",
              align: "right",
              render: (row) => (
                <RowAction to="/users/$userId" params={{ userId: row._id }}>
                  View Details
                </RowAction>
              ),
            },
          ]}
        />
      </Panel>
    </>
  );
}

/** This entity's installers against each current SWMS (decision D9), from the report data. */
function useSwmsSignoffs(name: string) {
  const all = useQuery(api.whsReports.swmsAcknowledgements);
  return (all ?? []).filter((row) => row.entity === name);
}

const NEEDS_ACTION = ["overdue", "expired", "missing", "action-required"];

interface RequirementRow {
  key: string;
  requirement: string;
  appliesTo: string;
  progress: string;
  status: "current" | "due-soon" | "overdue" | "missing" | "action-required" | "awaiting-verification";
  statusLabel?: string;
  link: { to: string; params?: Record<string, string>; search?: Record<string, string> };
  action: string;
}

/**
 * SC11 WHS requirements, real (framework 4D): everything this entity must
 * have beyond insurance, in one list: the signed agreement, and each
 * accreditation its workers must hold, which includes inductions a client
 * asks for (framework 4B, decision AD29). The documents it signs are on the
 * Documents tab (decision AD41).
 */
function RequirementsTab({ subcontractorId, name, isWesternUsi }: { subcontractorId: string; name: string; isWesternUsi: boolean }) {
  const navigate = useNavigate();
  const agreement = useAgreement(subcontractorId);
  const accreditations = (useEntityRows(name) ?? []).filter((row) => row.category === "accreditation");

  const rows: RequirementRow[] = [];
  if (!isWesternUsi && agreement !== undefined) {
    rows.push({
      key: "agreement",
      requirement: "Signed subcontractor agreement",
      appliesTo: "The company",
      progress: agreement.current === null ? "Not on file" : `Signed ${formatIsoDate(agreement.current.signed_on)} · review ${formatIsoDate(agreement.current.review_date)}`,
      status: agreement.status,
      statusLabel: agreement.status === "missing" ? "Not on file" : undefined,
      link: { to: "/safety/subcontractors/$subcontractorId", params: { subcontractorId }, search: { tab: "business" } },
      action: "View agreement",
    });
  }
  const byType = new Map<string, RegisterRow[]>();
  for (const row of accreditations) byType.set(row.name, [...(byType.get(row.name) ?? []), row]);
  for (const [type, list] of [...byType.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const count = (statuses: string[]) => list.filter((row) => statuses.includes(row.status)).length;
    const parts = [
      `${count(["current", "due-soon"])} current`,
      count(["missing"]) > 0 ? `${count(["missing"])} missing` : "",
      count(["overdue", "expired"]) > 0 ? `${count(["overdue", "expired"])} expired` : "",
      count(["awaiting-verification", "renewal-in-progress"]) > 0 ? `${count(["awaiting-verification", "renewal-in-progress"])} awaiting verification` : "",
    ].filter(Boolean);
    rows.push({
      key: `type:${type}`,
      requirement: type,
      appliesTo: `${list.length} ${list.length === 1 ? "worker" : "workers"}`,
      progress: parts.join(" · "),
      status: list.some((row) => NEEDS_ACTION.includes(row.status))
        ? "action-required"
        : count(["awaiting-verification", "renewal-in-progress"]) > 0
          ? "awaiting-verification"
          : count(["due-soon"]) > 0
            ? "due-soon"
            : "current",
      link: { to: "/safety/register", search: { category: "accreditation", entity: name, q: type } },
      action: "View workers",
    });
  }

  return (
    <>
      <Panel>
        <PagedTable
          rows={rows}
          rowKey={(row) => row.key}
          empty="Nothing required yet."
          columns={[
            { key: "requirement", header: "Requirement", render: (row) => <span className="text-[#111827]">{row.requirement}</span> },
            { key: "applies", header: "Applies to", render: (row) => row.appliesTo },
            { key: "progress", header: "Progress", render: (row) => <span className="text-[13px]">{row.progress}</span> },
            { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} label={row.statusLabel} /> },
            {
              key: "action",
              header: "Action",
              align: "right",
              render: (row) => (
                <RowAction onClick={() => void navigate({ to: row.link.to, params: row.link.params, search: row.link.search } as never)}>
                  {row.action}
                </RowAction>
              ),
            },
          ]}
        />
      </Panel>
      <Notice tone="info">
        An induction a client asks for (for example a client site induction) is an accreditation type each worker holds, like a White Card.
      </Notice>
    </>
  );
}

/** "15 Oct 2026, 9:42 am" */
function formatDateTime(time: number) {
  return new Date(time).toLocaleString("en-AU", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function HistoryRecordLink({ event }: { event: HistoryEvent }) {
  const navigate = useNavigate();
  if (event.category === "agreement") {
    return (
      <RowAction
        onClick={() =>
          void navigate({ to: "/safety/subcontractors/$subcontractorId", params: { subcontractorId: event.record_id }, search: { tab: "business" } })
        }
      >
        Open
      </RowAction>
    );
  }
  if (event.category === "accreditation") {
    return <RowAction to="/safety/accreditations/$accreditationId" params={{ accreditationId: event.record_id }}>Open</RowAction>;
  }
  if (event.category === "insurance") {
    return <RowAction to="/safety/insurance/$policyId" params={{ policyId: event.record_id }}>Open</RowAction>;
  }
  if (event.category === "vehicle") {
    return <RowAction to="/safety/vehicles/$vehicleId" params={{ vehicleId: event.record_id }}>Open</RowAction>;
  }
  if (event.category === "first-aid") {
    return <RowAction to="/safety/kits/$kitId" params={{ kitId: event.record_id }}>Open</RowAction>;
  }
  return <RowAction to="/safety/documents/$documentId" params={{ documentId: event.record_id }}>Open</RowAction>;
}

/** SC History, real: the audit trail of everything under this entity (framework 11), newest first. Read-only. */
function HistoryTab({ subcontractorId, isWesternUsi }: { subcontractorId: string; isWesternUsi: boolean }) {
  const list = useListState();
  const events = useQuery(
    api.whsAdmin.entityHistory,
    isWesternUsi ? {} : { subcontractor_id: subcontractorId as Id<"subcontractors"> },
  );

  if (events === undefined) {
    return <Panel className="p-6 text-sm text-[#64748b]">Loading history…</Panel>;
  }

  return (
    <Panel>
      <PagedTable
        rows={events}
        rowKey={(event) => `${event.at}-${event.record_id}-${event.what}-${event.by ?? ""}`}
        noun="events"
        page={list.page}
        onPage={list.setPage}
        empty="Nothing recorded yet."
        columns={[
          { key: "when", header: "When", render: (event) => <span className="text-xs whitespace-nowrap">{formatDateTime(event.at)}</span> },
          { key: "record", header: "Record", render: (event) => <span className="text-[13px] text-[#111827]">{event.record}</span> },
          {
            key: "what",
            header: "What happened",
            render: (event) => (
              <div className="flex flex-col">
                <span className="text-[13px] text-[#111827]">{event.what}</span>
                {event.details ? <span className="text-[11px] font-normal text-[#64748b]">{event.details}</span> : null}
              </div>
            ),
          },
          { key: "by", header: "By", render: (event) => <span className="text-[13px]">{event.by ?? "System"}</span> },
          { key: "open", header: "", align: "right", render: (event) => <HistoryRecordLink event={event} /> },
        ]}
      />
    </Panel>
  );
}

/**
 * The accreditations this entity's workers must hold (decisions R1, AD31,
 * AD37), with how many of them have each one, and Add / Remove for this
 * entity only. Every type, and who else needs it, is on Accreditation Types.
 */
function AccreditationsTab({ subcontractorId, name }: { subcontractorId: string; name: string }) {
  const navigate = useNavigate();
  const types = useQuery(api.accreditationTypes.list);
  const setRequired = useMutation(api.accreditationTypes.adminSetRequired);
  const createType = useMutation(api.accreditationTypes.adminCreate);
  const rows = (useEntityRows(name) ?? []).filter((row) => row.category === "accreditation");
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);
  // "Choose workers" for one accreditation (decision AD53).
  const [choosing, setChoosing] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const required = (types ?? []).filter((type) => type.required_for.includes(subcontractorId));
  const others = (types ?? []).filter((type) => !type.required_for.includes(subcontractorId));

  const change = async (typeId: string, typeName: string, on: boolean) => {
    setBusy(true);
    try {
      await setRequired({ type_id: typeId as Id<"accreditation_types">, entity: subcontractorId, required: on });
      toast.success(on ? `${typeName} added for ${name}` : `${typeName} removed for ${name}`);
      return true;
    } catch (error) {
      toast.error(toUserMessage(error, "Could not change that accreditation."));
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Panel className="flex flex-wrap items-center justify-between gap-4 rounded-[12px] p-6">
        <div>
          <h3 className="text-sm font-bold text-[#111827]">Accreditations for {name}</h3>
          <p className="text-xs text-[#64748b]">Workers at {name} are only asked for the ones they're ticked for. Use Choose workers to tick them.</p>
        </div>
        <SafetyButton onClick={() => setAdding(true)} disabled={types === undefined}>
          + Add Accreditation
        </SafetyButton>
      </Panel>
      <Panel>
        <PagedTable
          rows={required}
          rowKey={(row) => row.id}
          empty={types === undefined ? "Loading…" : `No accreditations required of ${name} yet.`}
          columns={[
            { key: "name", header: "Accreditation", render: (row) => <span className="text-[#111827]">{row.name}</span> },
            {
              key: "workers",
              header: "Workers",
              render: (row) => {
                const list = rows.filter((entry) => entry.name === row.name);
                if (list.length === 0) return <span className="text-[13px] text-[#64748b]">No one ticked</span>;
                const count = (statuses: string[]) => list.filter((entry) => statuses.includes(entry.status)).length;
                return (
                  <span className="text-[13px]">
                    {[
                      `${count(["current", "due-soon"])} of ${list.length} current`,
                      count(["missing"]) > 0 ? `${count(["missing"])} missing` : "",
                      count(["overdue", "expired"]) > 0 ? `${count(["overdue", "expired"])} expired` : "",
                      count(["awaiting-verification", "renewal-in-progress"]) > 0 ? `${count(["awaiting-verification", "renewal-in-progress"])} to verify` : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                );
              },
            },
            {
              key: "actions",
              header: "Actions",
              align: "right",
              render: (row) => (
                <div className="flex justify-end gap-2">
                  <RowAction onClick={() => setChoosing({ id: row.id, name: row.name })}>Choose workers</RowAction>
                  <RowAction
                    onClick={() =>
                      void navigate({ to: "/safety/register", search: { category: "accreditation", entity: name, q: row.name } as never })
                    }
                  >
                    View workers
                  </RowAction>
                  <RowAction onClick={() => setRemoving({ id: row.id, name: row.name })}>Remove</RowAction>
                </div>
              ),
            },
          ]}
        />
      </Panel>
      <AddAccreditationDialog
        open={adding}
        name={name}
        options={others.map((type) => ({ value: type.id, label: type.name }))}
        busy={busy}
        onClose={() => setAdding(false)}
        onAdd={async (typeId) => {
          const type = others.find((entry) => entry.id === typeId);
          if (type && (await change(type.id, type.name, true))) {
            setAdding(false);
            setChoosing({ id: type.id, name: type.name });
          }
        }}
        onCreate={async (typeName) => {
          setBusy(true);
          try {
            const typeId = await createType({ name: typeName, required_for: [subcontractorId] });
            toast.success(`${typeName} created for ${name}`);
            setAdding(false);
            setChoosing({ id: typeId, name: typeName });
          } catch (error) {
            toast.error(toUserMessage(error, "Could not create that accreditation."));
          } finally {
            setBusy(false);
          }
        }}
      />
      <Dialog open={removing !== null} onOpenChange={(next) => !next && !busy && setRemoving(null)}>
        <DialogContent className="rounded-xl border-slate-200 bg-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900">Remove {removing?.name} for {name}?</DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-slate-500">
              Everyone at {name} ticked for it is unticked: they won't be asked for it or reminded about it any more. Cards they already uploaded are kept.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <SafetyButton variant="secondary" onClick={() => setRemoving(null)} disabled={busy}>
              Cancel
            </SafetyButton>
            <SafetyButton
              onClick={() => {
                if (removing === null) return;
                void change(removing.id, removing.name, false).then((done) => done && setRemoving(null));
              }}
              disabled={busy}
            >
              {busy ? "Removing…" : "Yes, Remove"}
            </SafetyButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ChooseWorkersDialog accreditation={choosing} entity={subcontractorId} name={name} onClose={() => setChoosing(null)} />
    </>
  );
}

/** "Choose workers": tick which of the company's workers must hold one accreditation (decision AD53). */
function ChooseWorkersDialog({
  accreditation,
  entity,
  name,
  onClose,
}: {
  accreditation: { id: string; name: string } | null;
  entity: string;
  name: string;
  onClose: () => void;
}) {
  const workers = useQuery(
    api.accreditationTypes.workersForType,
    accreditation === null ? "skip" : { type_id: accreditation.id as Id<"accreditation_types">, entity },
  );
  const save = useMutation(api.accreditationTypes.adminSetWorkersForType);
  // Null until changed: start from the saved ticks each time it opens.
  const [ticked, setTicked] = useState<string[] | null>(null);
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if ((accreditation?.id ?? null) !== openFor) {
    setOpenFor(accreditation?.id ?? null);
    setTicked(null);
  }
  const current = ticked ?? (workers ?? []).filter((worker) => worker.ticked).map((worker) => worker.id as string);
  const allTicked = workers !== undefined && workers.length > 0 && current.length === workers.length;

  const submit = async () => {
    if (accreditation === null) return;
    setBusy(true);
    try {
      await save({ type_id: accreditation.id as Id<"accreditation_types">, entity, worker_ids: current as Id<"users">[] });
      toast.success(`${accreditation.name}: ${current.length} ${current.length === 1 ? "person" : "people"} ticked at ${name}`);
      onClose();
    } catch (error) {
      toast.error(toUserMessage(error, "Could not save who needs that accreditation."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={accreditation !== null} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="rounded-xl border-slate-200 bg-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-slate-900">Who needs {accreditation?.name}?</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-slate-500">
            Tick the workers at {name} who must hold it. Anyone unticked isn't asked for it.
          </DialogDescription>
        </DialogHeader>
        {workers === undefined ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : workers.length === 0 ? (
          <p className="text-sm text-slate-500">No workers at {name} yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <button
              type="button"
              className="w-fit text-xs font-medium text-[#2563eb] hover:underline"
              onClick={() => setTicked(allTicked ? [] : workers.map((worker) => worker.id as string))}
            >
              {allTicked ? "Untick all" : "Tick all"}
            </button>
            <div className="flex max-h-72 flex-col gap-2.5 overflow-y-auto">
              {workers.map((worker) => (
                <CheckboxRow
                  key={worker.id}
                  checked={current.includes(worker.id)}
                  onChange={(on) => setTicked(on ? [...current, worker.id] : current.filter((id) => id !== worker.id))}
                >
                  {worker.name}
                </CheckboxRow>
              ))}
            </div>
          </div>
        )}
        <DialogFooter>
          <SafetyButton variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </SafetyButton>
          <SafetyButton onClick={() => void submit()} disabled={busy || workers === undefined || workers.length === 0}>
            {busy ? "Saving…" : "Save"}
          </SafetyButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddAccreditationDialog({
  open,
  name,
  options,
  busy,
  onClose,
  onAdd,
  onCreate,
}: {
  open: boolean;
  name: string;
  options: { value: string; label: string }[];
  busy: boolean;
  onClose: () => void;
  onAdd: (typeId: string) => Promise<void>;
  /** Creates a new accreditation type required only of this entity (decision AD37). */
  onCreate: (typeName: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [typeId, setTypeId] = useState("");
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string>();
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setMode(options.length === 0 ? "new" : "existing");
      setTypeId("");
      setNewName("");
      setError(undefined);
    }
  }
  const choice = (value: "existing" | "new", label: string) => (
    <label className="flex w-fit cursor-pointer items-center gap-2.5 text-[13px] text-[#111827]">
      <input
        type="radio"
        checked={mode === value}
        onChange={() => {
          setMode(value);
          setError(undefined);
        }}
        className="size-4 accent-[#2563eb]"
      />
      {label}
    </label>
  );
  const submit = () => {
    if (mode === "existing") {
      if (typeId === "") {
        setError("Select the accreditation to add");
        toast.error("Select the accreditation to add");
        return;
      }
      void onAdd(typeId);
      return;
    }
    if (newName.trim() === "") {
      setError("Enter the name of the new accreditation");
      toast.error("Enter the name of the new accreditation");
      return;
    }
    void onCreate(newName.trim());
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="rounded-xl border-slate-200 bg-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-slate-900">Add an accreditation for {name}</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-slate-500">
            Every worker at {name} will be asked for it, and it shows as Missing until they upload it.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {options.length > 0 ? choice("existing", "Choose an existing one") : null}
          {choice("new", "Create a new one")}
        </div>
        {mode === "existing" ? (
          <Field label="Accreditation" required error={error}>
            <SelectInput
              value={typeId}
              onChange={(value) => {
                setTypeId(value);
                setError(undefined);
              }}
              options={options}
              placeholder="Select an accreditation…"
              invalid={!!error}
            />
          </Field>
        ) : (
          <Field label="Name" required error={error} hint={`Only ${name} is asked for it. You can add it for others later.`}>
            <TextInput
              value={newName}
              onChange={(value) => {
                setNewName(value);
                setError(undefined);
              }}
              placeholder="e.g. JCDecaux Site Induction"
              invalid={!!error}
            />
          </Field>
        )}
        <DialogFooter>
          <SafetyButton variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </SafetyButton>
          <SafetyButton onClick={submit} disabled={busy}>
            {busy ? "Saving…" : mode === "new" ? "Create" : "Add"}
          </SafetyButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The safety documents this entity's workers are asked to read and sign
 * (decision AD41), with how many have signed, and Add / Remove for this entity
 * only. A document's full "who must sign" is on its own page.
 */
function DocumentsTab({ subcontractorId, name }: { subcontractorId: string; name: string }) {
  const navigate = useNavigate();
  const entity = subcontractorId === WESTERN_USI_ID ? "western-usi" : subcontractorId;
  const data = useQuery(api.documents.forEntity, { entity });
  const setEntity = useMutation(api.documents.adminSetEntity);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<{ id: string; title: string } | null>(null);

  const kindLabel = (row: { kind: string; category?: string }) => documentTypeLabel(row.kind, row.category);
  const forText = (row: { for: "everyone" | "all" | "some"; asked: number }) =>
    row.for === "some" ? `${row.asked} ${row.asked === 1 ? "worker" : "workers"} (picked one by one)` : `All ${row.asked} ${row.asked === 1 ? "installer" : "installers"}`;

  const change = async (id: string, assigned: boolean, reason: string) => {
    try {
      await setEntity({ document_id: id as Id<"whs_documents">, entity, assigned, reason });
      return true;
    } catch (error) {
      toast.error(toUserMessage(error, "Could not change that document."));
      return false;
    }
  };

  return (
    <>
      <Panel className="flex flex-wrap items-center justify-between gap-4 rounded-[12px] p-6">
        <div>
          <h3 className="text-sm font-bold text-[#111827]">Documents for {name}</h3>
          <p className="text-xs text-[#64748b]">The safety documents {name}'s installers are asked to read and sign.</p>
        </div>
        <SafetyButton onClick={() => setAdding(true)} disabled={data === undefined}>
          + Add Document
        </SafetyButton>
      </Panel>
      <Panel>
        <PagedTable
          rows={data?.assigned ?? []}
          rowKey={(row) => row.id}
          empty={data === undefined ? "Loading…" : `No documents for ${name} yet.`}
          columns={[
            {
              key: "document",
              header: "Document",
              render: (row) => (
                <div className="flex flex-col">
                  <span className="text-[#111827]">{row.title}</span>
                  <span className="text-[11px] font-normal text-[#64748b]">
                    {kindLabel(row)}
                    {row.version ? ` · ${row.version}` : ""}
                  </span>
                </div>
              ),
            },
            { key: "for", header: "Asked of", render: (row) => <span className="text-[13px]">{forText(row)}</span> },
            {
              key: "signed",
              header: "Signed",
              render: (row) =>
                !row.acknowledgement_required ? (
                  <span className="text-[13px] text-[#64748b]">No signature needed</span>
                ) : row.asked === 0 ? (
                  <span className="text-[13px] text-[#64748b]">No installers yet</span>
                ) : (
                  <StatusBadge
                    status={row.signed === row.asked ? "current" : "action-required"}
                    label={`${row.signed} of ${row.asked} signed`}
                  />
                ),
            },
            {
              key: "actions",
              header: "Actions",
              align: "right",
              render: (row) => (
                <div className="flex justify-end gap-2">
                  {row.kind === "swms" && row.acknowledgement_required ? (
                    <RowAction
                      onClick={() =>
                        void navigate({
                          to: "/safety/subcontractors/$subcontractorId/swms",
                          params: { subcontractorId },
                          search: { document: row.id },
                        })
                      }
                    >
                      View installers
                    </RowAction>
                  ) : (
                    <RowAction to="/safety/documents/$documentId" params={{ documentId: row.id }}>
                      Open
                    </RowAction>
                  )}
                  <RowAction onClick={() => setRemoving({ id: row.id, title: row.title })}>Remove</RowAction>
                </div>
              ),
            },
          ]}
        />
      </Panel>
      <AddDocumentDialog
        open={adding}
        name={name}
        options={(data?.available ?? []).map((row) => ({ value: row.id, label: `${row.title} (${kindLabel(row)})` }))}
        onClose={() => setAdding(false)}
        onAdd={async (id, reason) => {
          const done = await change(id, true, reason);
          if (done) toast.success(`Document added for ${name}`);
          return done;
        }}
        onCreate={() => void navigate({ to: "/safety/records/new/document", search: { for: subcontractorId } })}
      />
      <ReasonDialog
        open={removing !== null}
        title={`Remove ${removing?.title ?? "this document"} for ${name}?`}
        description={`${name}'s workers won't be asked to read and sign it any more, and its reminders for them stop. Other companies are not affected.`}
        placeholder="e.g. This company doesn't do this kind of work"
        confirmLabel="Remove"
        missingMessage="Enter the reason for removing it"
        onClose={() => setRemoving(null)}
        onConfirm={async (reason) => {
          if (removing === null) return;
          if (await change(removing.id, false, reason)) toast.success(`${removing.title} removed for ${name}`);
          else throw new Error("not changed");
        }}
      />
    </>
  );
}

/** "+ Add Document" on an entity's Documents tab: pick an existing document (with a reason), or create a new one for this company (decision AD42). */
function AddDocumentDialog({
  open,
  name,
  options,
  onClose,
  onAdd,
  onCreate,
}: {
  open: boolean;
  name: string;
  options: { value: string; label: string }[];
  onClose: () => void;
  /** Resolves true when added (the dialog closes). */
  onAdd: (documentId: string, reason: string) => Promise<boolean>;
  onCreate: () => void;
}) {
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [documentId, setDocumentId] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<{ document?: string; reason?: string }>({});
  const [busy, setBusy] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setMode(options.length === 0 ? "new" : "existing");
      setDocumentId("");
      setReason("");
      setErrors({});
    }
  }
  const choice = (value: "existing" | "new", label: string) => (
    <label className="flex w-fit cursor-pointer items-center gap-2.5 text-[13px] text-[#111827]">
      <input type="radio" checked={mode === value} onChange={() => setMode(value)} className="size-4 accent-[#2563eb]" />
      {label}
    </label>
  );

  const submit = async () => {
    if (mode === "new") {
      onCreate();
      return;
    }
    const found: typeof errors = {};
    if (documentId === "") found.document = "Select the document to add";
    if (reason.trim() === "") found.reason = "Enter the reason for the change";
    setErrors(found);
    const first = Object.values(found)[0];
    if (first) {
      toast.error(first);
      return;
    }
    setBusy(true);
    try {
      if (await onAdd(documentId, reason.trim())) onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="rounded-xl border-slate-200 bg-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-slate-900">Add a document for {name}</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-slate-500">
            {name}'s installers will be asked to read and sign it, if it needs signing.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {options.length > 0 ? choice("existing", "Choose an existing one") : null}
          {choice("new", "Create a new one")}
        </div>
        {mode === "existing" ? (
          <>
            <Field label="Document" required error={errors.document}>
              <SelectInput
                value={documentId}
                onChange={(value) => {
                  setDocumentId(value);
                  setErrors((current) => ({ ...current, document: undefined }));
                }}
                options={options}
                placeholder="Select a document…"
                invalid={!!errors.document}
              />
            </Field>
            <Field label="Reason for the change" required error={errors.reason}>
              <TextArea
                value={reason}
                onChange={(value) => {
                  setReason(value);
                  setErrors((current) => ({ ...current, reason: undefined }));
                }}
                placeholder="e.g. This company now works on airport sites"
                invalid={!!errors.reason}
              />
            </Field>
          </>
        ) : (
          <p className="text-[13px] text-[#64748b]">
            This opens the Add Safety Document form with {name} already chosen as who must read and sign. When you save, you come back here.
          </p>
        )}
        <DialogFooter>
          <SafetyButton variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </SafetyButton>
          <SafetyButton onClick={() => void submit()} disabled={busy}>
            {busy ? "Adding…" : mode === "new" ? "Continue" : "Add"}
          </SafetyButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
