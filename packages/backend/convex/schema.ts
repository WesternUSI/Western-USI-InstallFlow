import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const teamName = v.union(
  v.literal("Team 1"),
  v.literal("Team 2"),
  v.literal("Team 3"),
  v.literal("Team 4"),
  v.literal("Team 5"),
);


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
    site_img: v.array(v.id("_storage")),
    photo_saved: v.boolean(), // derived: site_img is non-empty
    map_saved: v.boolean(), // derived: location is non-empty
    missing_value: v.boolean(), // panel_id is a placeholder such as "???"
  })
    .index("by_panel_id", ["panel_id"])
    .index("by_panel_id_site", ["panel_id", "site"]),

  /**
   * One panel's installation for one campaign, sourced from the Installation
   * Schedule sheet. Every daily upload inserts a fresh set of rows tagged with
   * `upload_date`; previous uploads are retained as history.
   */
  workorders: defineTable({
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
  })
    .index("by_upload_date", ["upload_date"])
    .index("by_site_id", ["site_id"])
    .index("by_panel_split", ["panel_split"]),
});
