import { createFileRoute } from "@tanstack/react-router";

import { Notice, Panel, SafetyButton, SafetyPage } from "@/components/whs/safety-ui";

export const Route = createFileRoute("/_auth/safety/records/new/")({
  component: AddSafetyRecord,
});

/**
 * F1 Add Safety Record: pick the category first (framework 3, admin workflow
 * step 1). Insurance is listed too: the Figma left it out, but it is a
 * register category (framework 4C) and has its own form (F4).
 */
const TYPES = [
  { to: "/safety/records/new/document", title: "Safety Document", text: "SWMS, SDS, client and reference documents" },
  { to: "/safety/records/new/accreditation", title: "Accreditation", text: "A worker’s card, licence or induction" },
  { to: "/safety/records/new/insurance", title: "Insurance", text: "Policies and certificates of currency" },
  { to: "/safety/records/new/vehicle", title: "Vehicle", text: "Registration, insurance and date-based servicing" },
  { to: "/safety/records/new/kit", title: "First-aid kit", text: "Kit location, assigned installer and inspection dates" },
] as const;

function AddSafetyRecord() {
  return (
    <SafetyPage
      title="Add Safety Record"
      description="Choose a category, upload evidence, confirm the due date and assign responsibility to ensure site compliance."
      back={{ to: "/safety", label: "Safety Dashboard" }}
    >
      <Notice tone="info">Let's get started! Select a record type below to begin the record creation process.</Notice>
      {TYPES.map((type) => (
        <Panel key={type.to} className="flex flex-wrap items-center justify-between gap-4 rounded-[12px] px-[22px] py-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold text-[#111827]">{type.title}</h2>
            <p className="text-[13px] text-[#64748b]">{type.text}</p>
          </div>
          <SafetyButton to={type.to} className="h-[38px] w-[90px]">
            Select
          </SafetyButton>
        </Panel>
      ))}
    </SafetyPage>
  );
}
