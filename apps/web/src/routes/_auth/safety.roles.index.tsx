import { createFileRoute, Link } from "@tanstack/react-router";

import { DataTable, Notice, Panel, SafetyPage, SectionTitle } from "@/components/whs/safety-ui";

export const Route = createFileRoute("/_auth/safety/roles/")({
  component: RolesAndPermissions,
});

/**
 * G1 Roles & Permissions (framework 10). Where the Figma differs from the
 * framework or our decisions, the framework wins: Management doesn't upload
 * evidence (10 lists view, escalations, designated verification only), and
 * admins and management aren't asked to acknowledge documents (D9).
 */
const MATRIX = [
  { capability: "View WHS register", admin: "All entities", management: "All entities", contact: "Own entity", worker: "No" },
  { capability: "Upload evidence", admin: "Yes", management: "No", contact: "Own entity", worker: "Own records" },
  { capability: "Verify evidence", admin: "Yes", management: "Designated items", contact: "No", worker: "No" },
  { capability: "Set dates and reminders", admin: "Yes", management: "No", contact: "No", worker: "No" },
  { capability: "Acknowledge documents", admin: "No (not asked)", management: "No (not asked)", contact: "Yes", worker: "Yes" },
  { capability: "Inspect first-aid kits", admin: "Yes", management: "No", contact: "Assigned kits", worker: "Assigned kits" },
  { capability: "Reports and exports", admin: "Yes", management: "Yes", contact: "Own entity", worker: "No" },
  { capability: "Manage users and access", admin: "Yes", management: "No", contact: "No", worker: "No" },
];

/**
 * Hidden for now (decision AD28): access to the subcontractor portal is the
 * subcontractor login itself, invited and removed on the Users page, so a
 * separate on/off switch would duplicate it. Set to true to show it again.
 */
const SHOW_PORTAL_ACCESS = false;

const PORTAL = [
  { entity: "Westline Signage P/L", contact: "T. Alvarez", enabled: true },
  { entity: "R. Doyle (sole trader)", contact: "R. Doyle", enabled: false },
];

function RolesAndPermissions() {
  return (
    <SafetyPage title="Roles & Permissions" description="Safety access by role and entity.">
      <Notice tone="info">Subcontractor contacts can see only their own entity and cannot verify their own evidence. Workers use the installer app.</Notice>
      <Panel>
        <DataTable
          rows={MATRIX}
          rowKey={(row) => row.capability}
          columns={[
            { key: "capability", header: "Capability", render: (row) => <span className="text-[#111827]">{row.capability}</span> },
            { key: "admin", header: "Administrator", render: (row) => <span className="text-[13px] text-[#111827]">{row.admin}</span> },
            { key: "management", header: "Management", render: (row) => <span className="text-[13px] text-[#111827]">{row.management}</span> },
            { key: "contact", header: "Subcontractor contact", render: (row) => <span className="text-[13px] text-[#111827]">{row.contact}</span> },
            { key: "worker", header: "Worker / installer", render: (row) => <span className="text-[13px] text-[#111827]">{row.worker}</span> },
          ]}
        />
      </Panel>
      {SHOW_PORTAL_ACCESS ? (
        <>
      <SectionTitle>Subcontractor portal access</SectionTitle>
      <Panel>
        <DataTable
          rows={PORTAL}
          rowKey={(row) => row.entity}
          columns={[
            { key: "entity", header: "Entity", render: (row) => <span className="text-[#111827]">{row.entity}</span> },
            { key: "contact", header: "Contact", render: (row) => <span className="text-[13px] text-[#111827]">{row.contact}</span> },
            { key: "access", header: "Portal access", render: (row) => <span className="text-[13px] text-[#111827]">{row.enabled ? "Enabled" : "Disabled"}</span> },
            {
              key: "action",
              header: "Action",
              render: (row) => (
                <Link to="/safety/roles/portal" search={{ entity: row.entity, contact: row.contact, enabled: row.enabled ? "yes" : "no" }} className="text-[13px] font-semibold text-[#2563eb] hover:underline">
                  {row.enabled ? "Manage access" : "Enable access"}
                </Link>
              ),
            },
          ]}
        />
      </Panel>
        </>
      ) : null}
    </SafetyPage>
  );
}
