import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

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
  sites: defineTable({
    area: v.string(),
    site: v.string(),
    panel_id: v.string(),
    image_id: v.array(v.id("_storage")),
    installation_notes: v.optional(v.string()),
    equipment: v.array(v.string()),
    panel_qty: v.optional(v.number()),
    panel_size: v.optional(v.string()),
    line: v.optional(v.string()),
    gps_coordinates: v.optional(v.string()),
    photo_saved: v.boolean(),
    map_saved: v.boolean(),
  }).index("by_panel_id", ["panel_id"]),
  workorders: defineTable({
    advertiser_campaign: v.string(),
    contracted_panel_id: v.string(),
    panel_split: v.optional(v.string()),
    location: v.string(),
    panel_name: v.string(),
    qty: v.optional(v.number()),
    format: v.optional(v.string()),
    size: v.optional(v.string()),
    proposed_install_date: v.optional(v.string()),
    end_date: v.optional(v.string()),
    comments: v.optional(v.string()),
    existing_advertiser: v.optional(v.string()),
    site_id: v.optional(v.id("sites")),
    priority: v.boolean(),
    completed: v.boolean(),
    uploaded_at: v.number(),
  }).index("by_key", ["advertiser_campaign", "contracted_panel_id", "panel_split"]),
});
