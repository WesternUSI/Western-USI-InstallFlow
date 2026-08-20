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
    // The team's name, not its id. Teams are a table now, but the name is what
    // is stored on the rows that reference one — the native app compares and
    // displays these as plain strings, and it keeps renames out of scope.
    team: v.optional(v.string()),
    // Set (and refreshed) whenever an admin reveals this account's credentials
    // via Invite / Resend Invite / Send Updated Credentials. Stands in for a
    // real invite-acceptance signal until an email provider is wired up.
    invited_at: v.optional(v.number()),
    // True whenever the account's current password is an admin-generated one
    // (set on invite, and again on Resend/Send Updated Credentials). The app
    // blocks navigation until the installer sets their own password, which
    // clears this.
    must_change_password: v.optional(v.boolean()),
    // Set by the `session.created` Clerk webhook the first time this account
    // actually signs in, distinguishing "Invitation Sent" from "Active".
    last_sign_in_at: v.optional(v.number()),
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
    // A work order can only ever have one team, so allocating simply sets
    // this and unallocating clears it back to undefined. Holds the team's
    // name — see the note on `users.team`.
    assigned_team: v.optional(v.string()),
    site_id: v.optional(v.id("sites")), // panel_split matched to sites.panel_id
    missing_value: v.boolean(), // no site matched panel_split
    // Snapshot of the matched site's `area_progress` taken at import time, so
    // listing and grouping never need to join back to `sites`.
    train_line: v.optional(v.string()),
    // Set together by Complete Installs' photo submission, once per work
    // order — the site's reference photos live on `sites.site_img` instead.
    completion_photo: v.optional(v.id("_storage")),
    completion_notes: v.optional(v.string()),
    completed_at: v.optional(v.number()),
    // Written by every mutation that touches this row so the status tabs filter
    // through an index rather than after a page has been read.
    status_key: v.optional(v.string()), // completed | missing_site | pending | allocated | not_allocated
  })
    .index("by_import_id", ["import_id"])
    .index("by_upload_date", ["upload_date"])
    .index("by_site_id", ["site_id"])
    .index("by_panel_split", ["panel_split"])
    .index("by_status_key", ["status_key"])
    .index("by_import_status", ["import_id", "status_key"])
    // Lets the Duration filter run as an index range, on its own or combined
    // with a status tab.
    .index("by_status_upload", ["status_key", "upload_date"]),

  /**
   * An installation crew. Office staff create these, so the set is no longer
   * the fixed Team 1–5 it started as.
   *
   * Rows that belong to a team store its `name`, not its id, so archiving is
   * offered instead of deletion and renaming is deliberately not supported —
   * either would have to cascade across users and work orders.
   */
  teams: defineTable({
    name: v.string(),
    archived: v.boolean(),
  }).index("by_name", ["name"]),

  /**
   * Shown in the admin panel's notification bell. One shared inbox — "read"
   * isn't per-admin — which is deliberately simple for the small office-staff
   * team this panel serves.
   */
  notifications: defineTable({
    type: v.literal("order_completed"),
    title: v.string(),
    body: v.string(),
    work_order_id: v.optional(v.id("workorders")),
    read: v.boolean(),
  }).index("by_read", ["read"]),
});
