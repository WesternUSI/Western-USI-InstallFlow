import { api } from "@usi-installer/backend/convex/_generated/api";
import type { Id } from "@usi-installer/backend/convex/_generated/dataModel";
import { Link } from "@tanstack/react-router";
import { cn } from "@usi-installer/ui/lib/utils";
import { useQuery } from "convex/react";

import { Panel, StatusBadge } from "@/components/whs/safety-ui";
import { useRegister } from "@/lib/use-register";

export type SubcontractorTab = "overview" | "business" | "workers" | "accreditations" | "requirements" | "history";

const TABS: { id: SubcontractorTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "business", label: "Business records" },
  { id: "workers", label: "Workers" },
  { id: "accreditations", label: "Accreditations" },
  { id: "requirements", label: "WHS requirements" },
  { id: "history", label: "History" },
];

/** The subcontractor's real details (framework 4D profile), from the subcontractors table. */
/** The id the entity pages use for Western USI itself, an entity like a subcontractor (decision R4). */
export const WESTERN_USI_ID = "western-usi";

const WESTERN_USI = {
  _id: WESTERN_USI_ID,
  name: "Western USI",
  abn: undefined as string | undefined,
  contact_name: undefined as string | undefined,
  contact_email: undefined as string | undefined,
  contact_phone: undefined as string | undefined,
};

/** The entity's details: Western USI, or a subcontractor from the subcontractors table. */
export function useSubcontractor(subcontractorId: string) {
  const list = useQuery(api.subcontractors.list);
  if (subcontractorId === WESTERN_USI_ID) return { subcontractor: WESTERN_USI, loading: false, isWesternUsi: true };
  return {
    subcontractor: list?.find((row) => row._id === (subcontractorId as Id<"subcontractors">)),
    loading: list === undefined,
    isWesternUsi: false,
  };
}

/** A subcontractor's signed agreement (framework 4D); undefined while loading, and for Western USI, which signs none. */
export function useAgreement(subcontractorId: string) {
  return useQuery(
    api.agreements.forSubcontractor,
    subcontractorId === WESTERN_USI_ID ? "skip" : { subcontractor_id: subcontractorId as Id<"subcontractors"> },
  );
}

/** The register rows under one entity (its name), for its profile. */
export function useEntityRows(name: string | undefined) {
  const register = useRegister();
  return register === undefined || name === undefined ? undefined : register.rows.filter((row) => row.entity === name);
}

export function SubcontractorHeader({ subcontractorId }: { subcontractorId: string }) {
  const { subcontractor } = useSubcontractor(subcontractorId);
  const rows = useEntityRows(subcontractor?.name);
  const agreement = useAgreement(subcontractorId);
  // The overall status (framework 4D): Action required if anything of theirs, the signed agreement included, is overdue or missing.
  const needsAction =
    (rows ?? []).some((row) => ["overdue", "expired", "missing", "action-required"].includes(row.status)) ||
    agreement?.status === "missing" ||
    agreement?.status === "overdue";
  return (
    <Panel className="flex flex-col gap-4 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[#111827]">{subcontractor?.name ?? "…"}</h2>
          <p className="text-[13px] text-[#64748b]">
            {subcontractorId === WESTERN_USI_ID ? "The company itself" : subcontractor?.abn ? `ABN ${subcontractor.abn}` : "No ABN recorded"}
          </p>
        </div>
        {rows === undefined ? null : <StatusBadge status={needsAction ? "action-required" : "current"} />}
      </div>
      <dl className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Primary contact", value: subcontractor?.contact_name },
          { label: "Contact email", value: subcontractor?.contact_email },
          { label: "Contact phone", value: subcontractor?.contact_phone },
        ].map((item) => (
          <div key={item.label} className="flex flex-col gap-1">
            <dt className="text-xs text-[#64748b]">{item.label}</dt>
            <dd className="text-sm text-[#111827]">{item.value || "—"}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

export function SubcontractorTabs({ subcontractorId, active }: { subcontractorId: string; active: SubcontractorTab }) {
  return (
    <nav className="flex flex-wrap gap-1">
      {TABS.map((tab) => (
        <Link
          key={tab.id}
          to="/safety/subcontractors/$subcontractorId"
          params={{ subcontractorId }}
          search={{ tab: tab.id }}
          className={cn(
            "rounded-[8px] px-3.5 py-2.5 text-sm font-medium",
            active === tab.id ? "bg-[#eff6ff] text-[#2563eb]" : "text-[#64748b] hover:text-[#111827]",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
