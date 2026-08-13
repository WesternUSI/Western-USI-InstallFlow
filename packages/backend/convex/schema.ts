import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const workOrderStatus = v.union(
  v.literal("pending"),
  v.literal("in_progress"),
  v.literal("completed"),
);

export default defineSchema({
  users: defineTable({
    clerk_id: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    image_url: v.optional(v.string()),
    role: v.optional(
      v.union(v.literal("installer"), v.literal("office_staff"), v.literal("admin")),
    ),
    team: v.optional(
      v.union(
        v.literal("Team 1"),
        v.literal("Team 2"),
        v.literal("Team 3"),
        v.literal("Team 4"),
        v.literal("Team 5"),
      ),
    ),
    // Teams merged in via the Allocate Installs "Save" action, on top of the
    // admin-assigned primary `team`. Never set directly by an admin.
    additional_teams: v.optional(
      v.array(
        v.union(
          v.literal("Team 1"),
          v.literal("Team 2"),
          v.literal("Team 3"),
          v.literal("Team 4"),
          v.literal("Team 5"),
        ),
      ),
    ),
  }).index("by_clerk_id", ["clerk_id"]),

  /** One physical advertising panel, sourced from the Go Site Database sheet. */
  sites: defineTable({
    area: v.string(), // LOCATION
    site: v.string(), // DETAILS
    panel_id: v.string(), // PANEL ID
    quantity: v.optional(v.number()), // QTY
    size: v.optional(v.string()), // SIZE
    area_progress: v.optional(v.string()), // Area
    install_notes: v.optional(v.string()), // Install Notes
    equipment_needed: v.array(v.string()), // Equipment, comma-separated
    location: v.optional(v.string()), // GPS co-ordinates
    additional_notes: v.optional(v.string()), // free text added in the admin panel
    site_img: v.array(v.id("_storage")),
    photo_saved: v.boolean(), // derived: site_img is non-empty
    map_saved: v.boolean(), // derived: location is non-empty
    missing_value: v.boolean(), // panel_id is a placeholder such as "???"
    detail_key: v.optional(v.string()), // "completed" | "incomplete" | "missing"
  })
    .index("by_panel_id", ["panel_id"])
    .index("by_panel_id_site", ["panel_id", "site"])
    .index("by_area", ["area"])
    .index("by_detail_key_area", ["detail_key", "area"]),

  /**
   * One Site Database upload. Sites themselves are upserted rather than kept as
   * history, so this only records what each upload did.
   */
  site_imports: defineTable({
    file_name: v.string(),
    uploaded_at: v.number(),
    uploaded_by_name: v.string(),
    total_rows: v.number(),
    inserted: v.number(),
    updated: v.number(),
  }).index("by_uploaded_at", ["uploaded_at"]),

  /**
   * One daily Installation Schedule upload. Each import keeps its own summary
   * so the dashboard can show what was brought in, by whom, and how much of it
   * failed to match a site.
   */
  imports: defineTable({
    name: v.string(), // "Import-Data-12-Aug-2026"
    file_name: v.string(),
    upload_date: v.string(), // YYYY-MM-DD
    imported_at: v.number(), // Date.now()
    imported_by: v.optional(v.id("users")),
    imported_by_name: v.string(),
    total_rows: v.number(),
    missing_sites: v.number(),
  }).index("by_imported_at", ["imported_at"]),

  /**
   * One panel's installation for one campaign, sourced from the Installation
   * Schedule sheet. Every daily upload inserts a fresh set of rows tagged with
   * `upload_date`; previous uploads are retained as history.
   */
  workorders: defineTable({
    import_id: v.id("imports"),
    contract_id: v.string(), // CONTRACT
    advertiser_campaign: v.string(), // ADVERTISER / CAMPAIGN
    contracted_panel_id: v.string(), // CONTRACTED PANEL ID
    panel_split: v.string(), // derived from CONTRACTED PANEL ID
    site: v.string(), // LOCATION
    panel_name: v.string(), // PANEL NAME
    quantity: v.optional(v.number()), // QTY
    format: v.optional(v.string()), // FORMAT
    size: v.optional(v.string()), // SIZE (W x H)
    proposed_install_date: v.optional(v.string()), // PROPOSED INSTALL DATE
    end_date: v.optional(v.string()), // END DATE
    comments: v.optional(v.string()), // COMMENTS
    existing_advertiser: v.optional(v.string()), // EXISTING ADVERTISER
    area_progress: v.optional(v.string()), // Line
    schedule: v.optional(v.string()), // Schedule
    upload_date: v.string(), // YYYY-MM-DD, shared by every row in one upload
    priority: v.boolean(), // every non-empty cell in the row had a red fill
    current_status: workOrderStatus,
    assigned_team: v.array(v.string()),
    site_id: v.optional(v.id("sites")), // panel_split matched to sites.panel_id
    missing_value: v.boolean(), // no site matched panel_split
    // Snapshot of the matched site's `area_progress` taken at import time, so
    // listing and grouping never need to join back to `sites`.
    train_line: v.optional(v.string()),
    // Written by every mutation that touches this row so filtering happens in
    // an index rather than after a page has been read. See convex/derive.ts.
    search_text: v.optional(v.string()),
    status_key: v.optional(v.string()), // completed | missing_site | pending | allocated | not_allocated
  })
    .index("by_import_id", ["import_id"])
    .index("by_upload_date", ["upload_date"])
    .index("by_site_id", ["site_id"])
    .index("by_panel_split", ["panel_split"])
    .index("by_status_key", ["status_key"])
    .index("by_import_status", ["import_id", "status_key"])
    .searchIndex("by_search", {
      searchField: "search_text",
      filterFields: ["status_key", "import_id"],
    }),
});
