import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    clerk_id: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    image_url: v.optional(v.string()),
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
});
