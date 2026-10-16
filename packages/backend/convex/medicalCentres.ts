import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery, mutation, query, type QueryCtx } from "./_generated/server";
import { requireCaller } from "./accreditations";
import { haversineKm } from "./geo";
import { isAdminUser } from "./permissions";

/**
 * Medical centres (framework 3: "with opening hours sorted geographically by
 * closest first"; 4A; decision D4). The list is the company's spreadsheet.
 * Nearest first works like Optimize Route: the phone's location is the origin.
 * The list is sorted by straight-line distance ("geographically", as §3 says),
 * and Google's Routes API adds the drive distance and time for the closest few.
 */

/** Only the closest few get a drive distance and time, to keep Google calls (and cost) small. */
const DRIVING_LOOKUPS = 8;

const rowValidator = v.object({
  listed_suburb: v.string(),
  name: v.string(),
  address: v.string(),
  phone: v.string(),
  hours_weekdays: v.string(),
  hours_saturday: v.string(),
  hours_sunday: v.string(),
  latitude: v.number(),
  longitude: v.number(),
});

/**
 * One entry per practice: rows for the same practice at the same address
 * (listed under several suburbs) are shown once, with all their suburbs.
 */
async function practices(ctx: QueryCtx) {
  const rows = await ctx.db.query("medical_centres").collect();
  const byPractice = new Map<string, { id: string; suburbs: string[] } & (typeof rows)[number]>();
  for (const row of rows) {
    const key = `${row.name}|${row.address}`.toLowerCase();
    const existing = byPractice.get(key);
    if (existing) {
      if (!existing.suburbs.includes(row.listed_suburb)) existing.suburbs.push(row.listed_suburb);
    } else {
      byPractice.set(key, { ...row, id: row._id, suburbs: [row.listed_suburb] });
    }
  }
  return [...byPractice.values()].map((row) => ({
    id: row.id,
    name: row.name,
    address: row.address,
    phone: row.phone,
    hours_weekdays: row.hours_weekdays,
    hours_saturday: row.hours_saturday,
    hours_sunday: row.hours_sunday,
    latitude: row.latitude,
    longitude: row.longitude,
    suburbs: row.suburbs.sort(),
  }));
}

/** Every practice, A-Z. The app sorts them nearest first once it has the phone's location. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireCaller(ctx);
    return (await practices(ctx)).sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const allPractices = internalQuery({
  args: {},
  handler: async (ctx) => await practices(ctx),
});

/**
 * Each practice's distance from the phone, nearest first by straight line,
 * with Google's drive distance and time for the closest few (none if Google
 * can't be reached; the order doesn't depend on it).
 */
export const nearest = action({
  args: { origin: v.object({ lat: v.number(), lng: v.number() }) },
  handler: async (
    ctx,
    args,
  ): Promise<{ id: string; distance_km: number; drive_km?: number; drive_minutes?: number }[]> => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new ConvexError("Your session has expired. Sign in again and retry.");
    }

    const all = await ctx.runQuery(internal.medicalCentres.allPractices, {});
    const byLine = all
      .map((centre) => ({
        id: centre.id,
        lat: centre.latitude,
        lng: centre.longitude,
        distance_km: haversineKm(args.origin, { lat: centre.latitude, lng: centre.longitude }),
      }))
      .sort((a, b) => a.distance_km - b.distance_km);

    const result: { id: string; distance_km: number; drive_km?: number; drive_minutes?: number }[] = byLine.map(
      (centre) => ({ id: centre.id, distance_km: centre.distance_km }),
    );

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    const closest = byLine.slice(0, DRIVING_LOOKUPS);
    if (apiKey && closest.length > 0) {
      try {
        const toWaypoint = (lat: number, lng: number) => ({
          waypoint: { location: { latLng: { latitude: lat, longitude: lng } } },
        });
        const response = await fetch("https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask": "destinationIndex,distanceMeters,duration,condition",
          },
          body: JSON.stringify({
            origins: [toWaypoint(args.origin.lat, args.origin.lng)],
            destinations: closest.map((centre) => toWaypoint(centre.lat, centre.lng)),
            travelMode: "DRIVE",
          }),
        });
        if (!response.ok) {
          console.error(`Route matrix error (${response.status}): ${await response.text()}`);
        } else {
          const elements = (await response.json()) as {
            destinationIndex?: number;
            distanceMeters?: number;
            duration?: string;
            condition?: string;
          }[];
          for (const element of elements) {
            if (element.condition !== "ROUTE_EXISTS" || element.destinationIndex === undefined) continue;
            if (element.distanceMeters === undefined) continue;
            const target = result.find((entry) => entry.id === closest[element.destinationIndex ?? -1]?.id);
            if (target === undefined) continue;
            target.drive_km = element.distanceMeters / 1000;
            target.drive_minutes = element.duration ? Math.round(Number.parseInt(element.duration, 10) / 60) : undefined;
          }
        }
      } catch (error) {
        // The list is still sorted; the drive details are extra information.
        console.error("Route matrix request failed", error);
      }
    }

    return result;
  },
});

/**
 * Replaces the whole list with the rows of the spreadsheet, converted to JSON,
 * until the admin dashboard has an upload screen:
 *   npx convex run medicalCentres:replaceAll '{"rows":[…]}'
 */
export const replaceAll = internalMutation({
  args: { rows: v.array(rowValidator) },
  handler: async (ctx, args) => {
    for (const row of args.rows) {
      if (!Number.isFinite(row.latitude) || !Number.isFinite(row.longitude)) {
        throw new ConvexError(`${row.name} (${row.listed_suburb}) has no usable GPS coordinates.`);
      }
    }
    for (const existing of await ctx.db.query("medical_centres").collect()) {
      await ctx.db.delete(existing._id);
    }
    for (const row of args.rows) {
      await ctx.db.insert("medical_centres", row);
    }
    return { rows: args.rows.length };
  },
});

/** One row of the sheet, as text that ignores case and spacing: the same practice, address and listed suburb is the same row. */
function rowKey(row: { name: string; address: string; listed_suburb: string }) {
  return [row.name, row.address, row.listed_suburb].map((part) => part.replace(/\s+/g, " ").trim().toLowerCase()).join("|");
}

/**
 * The admin's "Confirm Import" (Med3), like the site and work order imports:
 * rows already in the list are left as they are and only new rows are added,
 * so uploading the sheet again never makes duplicates. Called in batches.
 */
export const importRows = mutation({
  args: { rows: v.array(rowValidator) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const user =
      identity === null
        ? null
        : await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerk_id", identity.subject))
            .unique();
    if (user === null || !isAdminUser(user)) {
      throw new ConvexError("Only an administrator can import medical centres.");
    }
    for (const row of args.rows) {
      if (row.name.trim() === "") {
        throw new ConvexError(`A row listed under ${row.listed_suburb || "no suburb"} has no practice name.`);
      }
      if (!Number.isFinite(row.latitude) || !Number.isFinite(row.longitude)) {
        throw new ConvexError(`${row.name} (${row.listed_suburb}) has no usable GPS coordinates.`);
      }
    }

    // The list is one company sheet (about 50 rows), so reading it whole is cheap.
    const known = new Set((await ctx.db.query("medical_centres").collect()).map(rowKey));
    let added = 0;
    let existing = 0;
    for (const row of args.rows) {
      const key = rowKey(row);
      if (known.has(key)) {
        existing++;
        continue;
      }
      known.add(key);
      await ctx.db.insert("medical_centres", row);
      added++;
    }
    return { added, existing };
  },
});
