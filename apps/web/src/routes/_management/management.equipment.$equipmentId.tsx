import { api } from "@usi-installer/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";

import { ActivityPanel, MgmtPage, ReminderScheduleCard } from "@/components/whs/management";
import { DetailsLayout, EvidencePreview, SideButton, SideCard } from "@/components/whs/record-cards";
import { DetailGrid, Notice, Panel, StatusBadge } from "@/components/whs/safety-ui";
import { formatIsoDate } from "@/lib/upload-file";

export const Route = createFileRoute("/_management/management/equipment/$equipmentId")({
  component: EquipmentForManagement,
});

const OUTCOME_TEXT: Record<string, string> = { repaired: "Repaired", "out-of-service": "Taken out of service", "no-action": "No action needed" };

/** A height and safety equipment item for management (decision AD57), opened from the dashboards and escalation emails. Read-only. */
function EquipmentForManagement() {
  const { equipmentId } = Route.useParams();
  const item = useQuery(api.equipment.adminDetail, { equipment_id: equipmentId });
  const back = { to: "/management/exceptions", label: "Exceptions" };

  if (item === undefined || item === null) {
    return (
      <MgmtPage title="Equipment" back={back}>
        <Panel className="p-6 text-sm text-[#64748b]">{item === undefined ? "Loading…" : "This item could not be found."}</Panel>
      </MgmtPage>
    );
  }
  const latest = item.latest;

  return (
    <MgmtPage
      title={item.name}
      description={`Management · ${[item.brand, item.type].filter(Boolean).join(" · ")}${item.open_checks.length > 0 ? ` · Checked by ${item.open_checks.map((check) => check.assigned_to).join(", ")}` : ""}`}
      back={back}
    >
      {item.archived ? <Notice tone="warning">This item is archived. It is kept with its history but no longer used.</Notice> : null}
      <DetailsLayout
        main={
          <>
            <Panel className="flex flex-col gap-4 p-6">
              <div className="flex items-start justify-between gap-4">
                <h2 className="text-lg font-semibold text-[#111827]">Item details</h2>
                <StatusBadge status={item.status} />
              </div>
              <DetailGrid
                columns={2}
                items={[
                  { label: "Type", value: item.type },
                  { label: "Brand", value: item.brand || "—" },
                  { label: "Damage", value: item.damage ?? "—" },
                  {
                    label: "Checked by",
                    value:
                      item.open_checks.length === 0
                        ? "Not scheduled"
                        : item.open_checks
                            .map(
                              (check) =>
                                `${check.assigned_to} (every ${check.frequency_months} ${check.frequency_months === 1 ? "month" : "months"}, next ${formatIsoDate(check.due)})`,
                            )
                            .join(", "),
                  },
                  { label: "Next check", value: formatIsoDate(item.open_checks[0]?.due) },
                  { label: "Repair history", value: item.repair_history ?? "—" },
                ]}
              />
            </Panel>
            {latest ? (
              <Panel className="flex flex-col gap-3 p-6">
                <h3 className="text-base font-semibold text-[#111827]">
                  Last check · {formatIsoDate(latest.done_on)} by {latest.by}
                </h3>
                <DetailGrid
                  columns={2}
                  items={[
                    { label: "Any damage", value: latest.damage_found ? (latest.damage_description ?? "Yes") : "No" },
                    { label: "Recommendation", value: latest.recommendation ?? "—" },
                    {
                      label: "Office review",
                      value: latest.needs_review ? "Waiting for the office" : latest.outcome ? `${OUTCOME_TEXT[latest.outcome] ?? ""}. ${latest.review_note ?? ""}` : "—",
                    },
                  ]}
                />
              </Panel>
            ) : null}
            <ActivityPanel lines={item.activity.map((entry) => ({ at: entry.at, text: entry.text, by: entry.by, details: entry.details }))} />
          </>
        }
        side={
          <>
            <SideCard title="Evidence">
              <EvidencePreview fileName={latest?.photo_url ? "Latest damage photo" : "No damage photo"} />
              {latest?.photo_url ? (
                <SideButton filled onClick={() => window.open(latest.photo_url ?? "", "_blank", "noopener")}>
                  Open Photo
                </SideButton>
              ) : null}
            </SideCard>
            <ReminderScheduleCard text="14 and 7 days before the check is due, then weekly once overdue" />
          </>
        }
      />
    </MgmtPage>
  );
}
