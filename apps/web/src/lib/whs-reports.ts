import { api } from "@usi-installer/backend/convex/_generated/api";
import type { ConvexReactClient } from "convex/react";
import { ConvexError } from "convex/values";

import { statusText } from "@/components/whs/safety-ui";
import type { Report, ReportTable } from "@/lib/report-export";
import { KIT_CHECKS } from "@/lib/kit-checks";
import { formatIsoDate } from "@/lib/upload-file";
import type { RegisterData, RegisterRow } from "@/lib/use-register";

export type ReportId =
  | "register"
  | "expiring"
  | "subcontractors"
  | "matrix"
  | "insurance"
  | "vehicles"
  | "kits"
  | "swms"
  | "missing"
  | "audit";

/** The ten reports of framework 12. `period`: it uses the dates; `record`: it needs a record chosen. */
export const REPORTS: { id: ReportId; title: string; text: string; period?: boolean; record?: boolean }[] = [
  { id: "register", title: "Full WHS compliance register", text: "Every record and its current status" },
  { id: "expiring", title: "Items expiring within period", text: "Records due between the two dates", period: true },
  { id: "subcontractors", title: "Subcontractor compliance", text: "Each subcontractor's overall status and what needs action" },
  { id: "matrix", title: "Worker accreditation matrix", text: "Each worker against each accreditation" },
  { id: "insurance", title: "Western USI insurance register", text: "Western USI's own policies" },
  { id: "vehicles", title: "Vehicle service report", text: "Vehicles, and services recorded between the two dates", period: true },
  { id: "kits", title: "First-aid inspection history", text: "Inspections between the two dates, with corrective actions", period: true },
  { id: "swms", title: "SWMS acknowledgements", text: "Who has signed the current version of each SWMS" },
  { id: "missing", title: "Missing or overdue documents", text: "Everything missing, overdue, expired or needing action" },
  { id: "audit", title: "Audit history for a record", text: "Everything recorded against one record", record: true },
];

const CATEGORY_LABELS: Record<string, string> = {
  insurance: "Insurance",
  vehicle: "Vehicle",
  accreditation: "Accreditation",
  swms: "SWMS",
  sds: "SDS",
  document: "Other safety document",
  "first-aid": "First aid",
};

const NEEDS_ACTION = ["missing", "overdue", "expired", "action-required", "out-of-service"];

export interface ReportInput {
  register: RegisterData;
  /** "all" or an entity's name. */
  entity: string;
  from: string;
  to: string;
  /** For the audit report: a register row's id. */
  recordId: string;
  generatedBy: string;
  convex: ConvexReactClient;
}

/** A register row's id for the audit report: rows with evidence or a record behind them (not a Missing one). */
export const hasHistory = (row: RegisterRow) => !row.id.includes(":");

const status = (row: RegisterRow) => statusText(row.status, row.label);
const date = (iso: string | undefined) => (iso ? formatIsoDate(iso) : "");
const time = (at: number) =>
  new Date(at).toLocaleString("en-AU", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

function notes(row: RegisterRow) {
  return [
    row.outstanding ? `${row.outstanding} to acknowledge` : "",
    row.changes_to_review ? `${row.changes_to_review} on-site ${row.changes_to_review === 1 ? "change" : "changes"} to review` : "",
  ]
    .filter(Boolean)
    .join("; ");
}

function registerTable(heading: string, rows: RegisterRow[]): ReportTable {
  return {
    heading,
    columns: ["Record", "Category", "Entity", "Person / vehicle", "Status", "Due", "Responsible", "Notes"],
    rows: rows.map((row) => [
      row.name,
      CATEGORY_LABELS[row.category] ?? row.category,
      row.entity,
      row.person ?? row.vehicle ?? "",
      status(row),
      date(row.due),
      row.responsible ?? "",
      notes(row),
    ]),
  };
}

const byCategoryThenName = (a: RegisterRow, b: RegisterRow) =>
  (CATEGORY_LABELS[a.category] ?? "").localeCompare(CATEGORY_LABELS[b.category] ?? "") || a.name.localeCompare(b.name);

/** Gathers the data and lays the report out as tables. Throws a ConvexError with a plain message when there is nothing to report. */
export async function buildReport(id: ReportId, input: ReportInput): Promise<Report> {
  const definition = REPORTS.find((report) => report.id === id)!;
  const { register, entity, from, to, convex } = input;
  const inEntity = (name: string) => entity === "all" || name === entity;
  const rows = register.rows.filter((row) => inEntity(row.entity));
  const period = `${formatIsoDate(from)} to ${formatIsoDate(to)}`;
  let title = definition.title;
  let entityLine = entity === "all" ? "All entities" : entity;
  let tables: ReportTable[];

  switch (id) {
    case "register":
      tables = [registerTable("Register", [...rows].sort(byCategoryThenName))];
      break;

    case "expiring":
      tables = [
        registerTable(
          "Expiring",
          rows.filter((row) => row.due !== undefined && row.due >= from && row.due <= to).sort((a, b) => (a.due ?? "").localeCompare(b.due ?? "")),
        ),
      ];
      break;

    case "subcontractors": {
      if (entity === "Western USI") throw new ConvexError("This report covers subcontractors. Choose All entities or a subcontractor.");
      const subcontractors = (await convex.query(api.subcontractors.list, {})).filter((sub) => inEntity(sub.name));
      const theirs = (name: string) => rows.filter((row) => row.entity === name);
      const count = (list: RegisterRow[], statuses: string[]) => list.filter((row) => statuses.includes(row.status)).length;
      tables = [
        {
          heading: "Summary",
          columns: ["Subcontractor", "ABN", "Primary contact", "Overall status", "Insurance current", "Accreditations current", "Missing", "Overdue or expired", "Awaiting verification"],
          rows: subcontractors.map((sub) => {
            const list = theirs(sub.name);
            const insurance = list.filter((row) => row.category === "insurance");
            const accreditations = list.filter((row) => row.category === "accreditation");
            return [
              sub.name,
              sub.abn ?? "",
              [sub.contact_name, sub.contact_email, sub.contact_phone].filter(Boolean).join(", "),
              list.some((row) => NEEDS_ACTION.includes(row.status)) ? "Action required" : "Compliant",
              `${count(insurance, ["current", "due-soon"])} of ${insurance.length}`,
              `${count(accreditations, ["current", "due-soon"])} of ${accreditations.length}`,
              count(list, ["missing"]),
              count(list, ["overdue", "expired"]),
              count(list, ["awaiting-verification", "renewal-in-progress"]),
            ];
          }),
        },
        registerTable(
          "Needs action",
          subcontractors.flatMap((sub) => theirs(sub.name).filter((row) => row.status !== "current")).sort((a, b) => a.entity.localeCompare(b.entity) || byCategoryThenName(a, b)),
        ),
      ];
      break;
    }

    case "matrix": {
      const accreditations = rows.filter((row) => row.category === "accreditation");
      const types = [...new Set(accreditations.map((row) => row.name))].sort();
      const workers = [...new Set(accreditations.map((row) => `${row.entity}\u0000${row.person ?? ""}`))].sort();
      tables = [
        {
          heading: "Matrix",
          columns: ["Worker", "Entity", ...types],
          rows: workers.map((key) => {
            const [workerEntity, person] = key.split("\u0000");
            const own = accreditations.filter((row) => row.entity === workerEntity && row.person === person);
            return [
              person,
              workerEntity,
              ...types.map((type) => {
                const row = own.find((entry) => entry.name === type);
                if (row === undefined) return "Not required";
                return row.due ? `${status(row)} · ${date(row.due)}` : status(row);
              }),
            ];
          }),
        },
      ];
      break;
    }

    case "insurance": {
      entityLine = "Western USI";
      const policies = new Map((await convex.query(api.insurance.list, {})).map((policy) => [policy.id as string, policy]));
      tables = [
        {
          heading: "Policies",
          columns: ["Policy", "Insurer", "Coverage", "Expires", "Status", "Responsible"],
          rows: register.rows
            .filter((row) => row.category === "insurance" && row.entity === "Western USI")
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((row) => [row.name, policies.get(row.id)?.insurer ?? "", policies.get(row.id)?.coverage ?? "", date(row.due), status(row), row.responsible ?? ""]),
        },
      ];
      break;
    }

    case "vehicles": {
      entityLine = "Western USI";
      const [vehicles, services] = await Promise.all([
        convex.query(api.vehicles.list, {}),
        convex.query(api.whsReports.vehicleServices, { from, to }),
      ]);
      tables = [
        {
          heading: "Vehicles",
          columns: ["Registration", "Make / model", "Status", "Registration expiry", "Insurance expiry", "Last service", "Next service", "Service provider"],
          rows: vehicles.map((vehicle) => [
            vehicle.registration,
            vehicle.make_model,
            vehicle.out_of_service && vehicle.out_of_service_reason ? `${vehicle.status_label}: ${vehicle.out_of_service_reason}` : vehicle.status_label,
            date(vehicle.registration_expiry),
            date(vehicle.insurance_expiry),
            date(vehicle.last_service),
            date(vehicle.next_service),
            vehicle.service_provider ?? "",
          ]),
        },
        {
          heading: "Services in period",
          columns: ["Date", "Registration", "Make / model", "Provider", "Odometer", "Notes", "Recorded by"],
          rows: services.map((service) => [date(service.date), service.registration, service.make_model, service.provider, service.odometer, service.notes, service.recorded_by]),
        },
      ];
      break;
    }

    case "kits": {
      const inspections = (await convex.query(api.whsReports.kitInspections, { from, to })).filter((row) => inEntity(row.entity));
      tables = [
        {
          heading: "Inspections",
          columns: ["Date", "Kit", "Location", "Entity", "Inspected by", "Result", "Items replaced", "Earliest expiry", "Corrective action", "Resolved"],
          rows: inspections.map((row) => [
            date(row.date),
            `${row.kit} (${row.kit_type})`,
            row.location,
            row.entity,
            row.inspected_by,
            row.needs_action.length === 0 ? "All checks passed" : `Needs action: ${row.needs_action.map((check) => KIT_CHECKS[check] ?? check).join("; ")}`,
            row.items_replaced,
            date(row.earliest_expiry),
            row.corrective_action,
            row.resolved,
          ]),
        },
      ];
      break;
    }

    case "swms": {
      const signoffs = (await convex.query(api.whsReports.swmsAcknowledgements, {})).filter((row) => inEntity(row.entity));
      const documents = [...new Set(signoffs.map((row) => `${row.document}\u0000${row.version}`))];
      tables = [
        {
          heading: "Summary",
          columns: ["SWMS", "Version", "Issued", "Signed", "Not signed yet"],
          rows: documents.map((key) => {
            const list = signoffs.filter((row) => `${row.document}\u0000${row.version}` === key);
            const signed = list.filter((row) => row.signed_at !== undefined).length;
            return [list[0].document, list[0].version, date(list[0].issued), `${signed} of ${list.length}`, list.length - signed];
          }),
        },
        {
          heading: "By worker",
          columns: ["SWMS", "Version", "Worker", "Entity", "Signed on"],
          rows: signoffs.map((row) => [row.document, row.version, row.worker, row.entity, row.signed_at === undefined ? "Not signed yet" : time(row.signed_at)]),
        },
      ];
      break;
    }

    case "missing":
      tables = [
        registerTable(
          "Needs action",
          rows.filter((row) => NEEDS_ACTION.includes(row.status)).sort((a, b) => a.entity.localeCompare(b.entity) || byCategoryThenName(a, b)),
        ),
      ];
      break;

    case "audit": {
      const row = register.rows.find((entry) => entry.id === input.recordId);
      if (row === undefined) throw new ConvexError("Select the record to report on.");
      const events = await convex.query(api.whsReports.recordHistory, { category: row.category, id: row.id });
      title = `Audit history: ${row.name}${row.person ? ` · ${row.person}` : ""}`;
      entityLine = row.entity;
      tables = [{ heading: "History", columns: ["Date and time", "What happened", "By", "Details"], rows: events.map((event) => [time(event.at), event.what, event.by, event.details]) }];
      break;
    }
  }

  if (tables.every((table) => table.rows.length === 0)) {
    throw new ConvexError(
      definition.period ? `Nothing to report for ${entityLine} between ${period}.` : `Nothing to report for ${entityLine}.`,
    );
  }

  const today = new Date();
  const stamp = today.toLocaleDateString("en-CA");
  return {
    title,
    lines: [
      `Entity: ${entityLine}`,
      ...(definition.period ? [`Period: ${period}`] : []),
      `Generated ${time(today.getTime())} by ${input.generatedBy}`,
    ],
    tables,
    fileName: `${definition.title} - ${entityLine} - ${stamp}`.replace(/[\\/:*?"<>|]/g, " "),
  };
}
