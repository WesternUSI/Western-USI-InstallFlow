import { api } from "@usi-installer/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { useConvex, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";

import { Field, SelectInput, TextInput } from "@/components/whs/safety-form";
import { Panel, SafetyButton, SafetyPage } from "@/components/whs/safety-ui";
import { toUserMessage } from "@/lib/errors";
import { downloadExcel, downloadPdf } from "@/lib/report-export";
import { useRegister } from "@/lib/use-register";
import { buildReport, hasHistory, REPORTS, type ReportId } from "@/lib/whs-reports";

export const Route = createFileRoute("/_auth/safety/reports/")({
  component: ReportsAndExports,
});

/** First and last day of the month `today` (YYYY-MM-DD) falls in. */
function monthOf(today: string) {
  const [year, month] = today.split("-").map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  return { from: `${prefix}-01`, to: `${prefix}-${String(last).padStart(2, "0")}` };
}

type Errors = { from?: string; to?: string; record?: string };

/**
 * E1 Reports & Exports (framework 12: pick a report and, where needed, a date
 * range). PDF or Excel downloads straight away (decision AD27); the dates are
 * used only by the reports that say so.
 */
function ReportsAndExports() {
  const convex = useConvex();
  const register = useRegister();
  const user = useQuery(api.users.currentUser);
  const [period, setPeriod] = useState<{ from: string; to: string } | null>(null);
  const [entity, setEntity] = useState("all");
  const [recordId, setRecordId] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState<string | null>(null);

  const month = monthOf(register?.today ?? new Date().toLocaleDateString("en-CA"));
  const from = period?.from ?? month.from;
  const to = period?.to ?? month.to;

  const recordOptions = (register?.rows ?? [])
    .filter((row) => hasHistory(row) && (entity === "all" || entity === "" || row.entity === entity))
    .map((row) => ({ value: row.id, label: `${row.name}${row.person ? ` · ${row.person}` : ""} (${row.entity})` }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const download = async (id: ReportId, format: "pdf" | "excel") => {
    if (register === undefined) return;
    const definition = REPORTS.find((report) => report.id === id)!;
    const next: Errors = {};
    if (definition.period) {
      if (from === "") next.from = "Enter the start of the period";
      if (to === "") next.to = "Enter the end of the period";
      if (from !== "" && to !== "" && from > to) next.to = "The end must be on or after the start";
    }
    if (definition.record && recordId === "") next.record = "Select the record to report on";
    setErrors(next);
    const first = Object.values(next)[0];
    if (first !== undefined) {
      toast.error(first);
      return;
    }

    setBusy(`${id}:${format}`);
    try {
      const report = await buildReport(id, {
        register,
        entity: entity === "" ? "all" : entity,
        from,
        to,
        recordId,
        generatedBy: user?.name ?? user?.email ?? "an administrator",
        convex,
      });
      if (format === "pdf") downloadPdf(report);
      else downloadExcel(report);
    } catch (caught) {
      toast.error(toUserMessage(caught, "Couldn't make that report. Please try again."));
    } finally {
      setBusy(null);
    }
  };

  return (
    <SafetyPage title="Reports & Exports" description="Choose a report, then download it as PDF or Excel.">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Period from" error={errors.from} hint="Used by the reports marked “Uses the period”">
          <TextInput type="date" value={from} onChange={(value) => setPeriod({ from: value, to })} invalid={!!errors.from} />
        </Field>
        <Field label="Period to" error={errors.to}>
          <TextInput type="date" value={to} onChange={(value) => setPeriod({ from, to: value })} invalid={!!errors.to} />
        </Field>
        <Field label="Entity">
          <SelectInput
            value={entity}
            onChange={(value) => {
              setEntity(value);
              setRecordId("");
            }}
            options={[{ value: "all", label: "All entities" }, ...(register?.entities ?? []).map((name) => ({ value: name, label: name }))]}
            placeholder="All entities"
          />
        </Field>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        {REPORTS.map((report) => (
          <Panel key={report.id} className="flex flex-col gap-1.5 p-5">
            <h2 className="text-base font-semibold text-[#111827]">{report.title}</h2>
            <p className="text-xs text-[#64748b]">
              {report.text}
              {report.period ? <span className="font-medium text-[#2563eb]"> · Uses the period</span> : null}
            </p>
            {report.record ? (
              <div className="pt-2">
                <Field label="Record" error={errors.record}>
                  <SelectInput value={recordId} onChange={setRecordId} options={recordOptions} placeholder="Select a record…" invalid={!!errors.record} />
                </Field>
              </div>
            ) : null}
            <div className="flex gap-3 pt-3">
              <SafetyButton onClick={() => void download(report.id, "pdf")} disabled={register === undefined || busy !== null} className="w-[94px]">
                {busy === `${report.id}:pdf` ? "Making…" : "PDF"}
              </SafetyButton>
              <SafetyButton
                variant="secondary"
                onClick={() => void download(report.id, "excel")}
                disabled={register === undefined || busy !== null}
                className="w-[94px]"
              >
                {busy === `${report.id}:excel` ? "Making…" : "Excel"}
              </SafetyButton>
            </div>
          </Panel>
        ))}
      </div>
    </SafetyPage>
  );
}
