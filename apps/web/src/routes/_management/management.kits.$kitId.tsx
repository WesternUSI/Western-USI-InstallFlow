import { api } from "@usi-installer/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";

import { ActivityPanel, MgmtPage, ReminderScheduleCard } from "@/components/whs/management";
import { DetailsLayout, EvidencePreview, SideButton, SideCard } from "@/components/whs/record-cards";
import { DetailGrid, Notice, Panel, StatusBadge } from "@/components/whs/safety-ui";
import { KIT_CHECKS } from "@/lib/kit-checks";
import { formatIsoDate } from "@/lib/upload-file";

export const Route = createFileRoute("/_management/management/kits/$kitId")({
  component: KitForManagement,
});

/** M17 A first-aid kit for management (framework 4F, decision AD43). Read-only: the assigned installer inspects it. */
function KitForManagement() {
  const { kitId } = Route.useParams();
  const kit = useQuery(api.kits.adminDetail, { kit_id: kitId });
  const back = { to: "/management/exceptions", label: "Exceptions" };

  if (kit === undefined || kit === null) {
    return (
      <MgmtPage title="First-aid kit" back={back}>
        <Panel className="p-6 text-sm text-[#64748b]">{kit === undefined ? "Loading…" : "This kit could not be found."}</Panel>
      </MgmtPage>
    );
  }
  const latest = kit.latest;
  const openChecks = kit.open_issue?.checks ?? [];

  return (
    <MgmtPage
      title={`Kit ${kit.code} · ${kit.location}`}
      description={`Management · ${kit.entity}${kit.responsible ? ` · Assigned to ${kit.responsible}` : ""}`}
      back={back}
    >
      {kit.archived ? <Notice tone="warning">This kit is archived. It is kept with its history but no longer used.</Notice> : null}
      <DetailsLayout
        main={
          <>
            <Panel className="flex flex-col gap-4 p-6">
              <div className="flex items-start justify-between gap-4">
                <h2 className="text-lg font-semibold text-[#111827]">Kit details</h2>
                <StatusBadge status={kit.status} />
              </div>
              <DetailGrid
                columns={2}
                items={[
                  { label: "Location", value: kit.location },
                  { label: "Assigned installer", value: kit.responsible ?? "Not assigned" },
                  { label: "Last inspection", value: formatIsoDate(kit.last_inspection) },
                  { label: "Next inspection", value: formatIsoDate(kit.next_inspection) },
                  { label: "Inspection interval", value: `${kit.frequency_months} ${kit.frequency_months === 1 ? "month" : "months"}` },
                  { label: "Earliest stock expiry", value: formatIsoDate(latest?.earliest_expiry) },
                ]}
              />
            </Panel>
            {openChecks.length > 0 ? (
              <Panel className="flex flex-col gap-3 p-6">
                <h3 className="text-base font-semibold text-[#111827]">Inspection follow-up</h3>
                <p className="text-[13px] text-[#64748b]">
                  Still open: {openChecks.map((check) => KIT_CHECKS[check] ?? check).join(", ")}.
                  {kit.open_issue?.corrective_action ? ` Corrective action: ${kit.open_issue.corrective_action}.` : ""} The assigned installer completes it; management
                  doesn't complete inspections.
                </p>
              </Panel>
            ) : null}
            <ActivityPanel lines={kit.activity.map((entry) => ({ at: entry.at, text: entry.text, by: entry.by, details: entry.details }))} />
          </>
        }
        side={
          <>
            <SideCard title="Evidence">
              <EvidencePreview fileName={latest?.photo_url ? "Latest inspection photo" : "No inspection photo"} />
              {latest?.photo_url ? (
                <SideButton filled onClick={() => window.open(latest.photo_url ?? "", "_blank", "noopener")}>
                  Open Photo
                </SideButton>
              ) : null}
            </SideCard>
            <ReminderScheduleCard text="14 and 7 days before the inspection is due, then weekly once overdue" />
          </>
        }
      />
    </MgmtPage>
  );
}
