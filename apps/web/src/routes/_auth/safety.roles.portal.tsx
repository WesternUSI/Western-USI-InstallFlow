import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { ResultCard } from "@/components/whs/safety-form";
import { Notice, SafetyButton, SafetyPage } from "@/components/whs/safety-ui";

export const Route = createFileRoute("/_auth/safety/roles/portal")({
  validateSearch: (search: Record<string, unknown>): { entity?: string; contact?: string; enabled?: string } => ({
    entity: typeof search.entity === "string" ? search.entity : undefined,
    contact: typeof search.contact === "string" ? search.contact : undefined,
    enabled: typeof search.enabled === "string" ? search.enabled : undefined,
  }),
  component: PortalAccess,
});

/**
 * G2 Enable / G3 Disable Subcontractor Portal Access. A contact never gets
 * verification permission (framework 10: "cannot verify their own
 * documents"), so the Figma's "Granted" on G3 is shown as "Not granted".
 */
function PortalAccess() {
  const { entity = "Subcontractor", contact = "Contact", enabled } = Route.useSearch();
  const navigate = useNavigate();
  const on = enabled === "yes";
  const done = (message: string) => {
    toast.success(message);
    void navigate({ replace: true, to: "/safety/roles" });
  };

  return (
    <SafetyPage title="Subcontractor Portal Access" description={`${contact} · Entity-scoped access`} back={{ to: "/safety/roles", label: "Roles & Permissions" }}>
      <ResultCard
        title={on ? "Safety Portal Access Management" : "Enable Subcontractor Safety portal access?"}
        message={`${contact} ${on ? "has" : "will have"} access to their own entity’s compliance records, insurance, workers, kits and published safety documents. Other entities and verification controls remain unavailable.`}
        items={[
          { label: "Contact", value: contact },
          { label: "Entity", value: entity },
          { label: "Access", value: "Safety portal only" },
          { label: "Verification permission", value: "Not granted" },
        ]}
        actions={
          <div className="flex w-full flex-col gap-4">
            {on ? (
              <Notice tone="success">This entity currently has access to the subcontractor safety portal.</Notice>
            ) : (
              <Notice tone="warning">Portal contact access is separate from the worker’s installer role. Enabling it does not create or change an accreditation.</Notice>
            )}
            <div className="flex flex-wrap gap-3">
              <SafetyButton variant="secondary" to="/safety/roles">
                Cancel
              </SafetyButton>
              {on ? (
                <SafetyButton variant="danger" onClick={() => done(`Portal access disabled for ${contact}`)} className="border-transparent bg-[#e04848] text-white hover:bg-[#c53030]">
                  Disable Portal Access
                </SafetyButton>
              ) : (
                <SafetyButton onClick={() => done(`Portal access enabled for ${contact}`)}>Enable Portal Access</SafetyButton>
              )}
            </div>
          </div>
        }
      />
    </SafetyPage>
  );
}
