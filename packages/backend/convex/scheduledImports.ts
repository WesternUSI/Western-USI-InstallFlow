import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  type MutationCtx,
  type QueryCtx,
  internalMutation,
  mutation,
  query,
} from "./_generated/server";
import { deriveWorkOrderStatus } from "./derive";
import { findSiteForPanelSplit } from "./panelIds";
import { isFutureReleaseDate, releaseTimestamp, releaseZoneDate } from "./releaseTime";
import { workOrderSourceFields } from "./schema";

const scheduledRowValidator = v.object(workOrderSourceFields);

/**
 * Staged rows moved per transaction.
 *
 * Each row costs a site lookup, a `workorders` insert and a staging delete, so
 * this is kept at what `imports.addWorkOrders` already proves safe for the
 * same lookup-and-insert work.
 */
const RELEASE_BATCH_SIZE = 200;

/** Staged rows deleted per transaction when a batch is cancelled. */
const CANCEL_BATCH_SIZE = 500;

async function requireIdentity(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    throw new Error("Not authenticated");
  }
  return identity;
}

function summarise(doc: Doc<"scheduled_imports">) {
  return {
    _id: doc._id,
    file_name: doc.file_name,
    uploaded_at: doc.uploaded_at,
    uploaded_by_name: doc.uploaded_by_name,
    release_date: doc.release_date,
    release_at: doc.release_at,
    total_rows: doc.total_rows,
    status: doc.status,
  };
}

/**
 * Starts one scheduled Installation Schedule import.
 *
 * Batched the same way an immediate import is — `createScheduledImport`,
 * several `addScheduledRows`, then `finalizeScheduledImport` — because a
 * Convex mutation is a single transaction with a bounded number of writes.
 * Nothing is scheduled until finalize, so an upload that fails part-way can
 * never fire.
 */
export const createScheduledImport = mutation({
  args: {
    file_name: v.string(),
    release_date: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);

    if (!isFutureReleaseDate(args.release_date)) {
      throw new Error("Pick a release date later than today, or import now instead.");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerk_id", identity.subject))
      .unique();

    const scheduledImportId: Id<"scheduled_imports"> = await ctx.db.insert("scheduled_imports", {
      file_name: args.file_name,
      uploaded_at: Date.now(),
      uploaded_by: user?._id,
      uploaded_by_name: user?.name ?? identity.name ?? identity.email ?? "Unknown user",
      release_date: args.release_date,
      release_at: releaseTimestamp(args.release_date),
      total_rows: 0,
      status: "pending",
    });

    return scheduledImportId;
  },
});

/**
 * Writes one batch of staged rows for an in-progress scheduled import.
 *
 * Unlike `imports.addWorkOrders` this does no site matching — that is done when
 * the batch is released, against the Site Database as it stands that day.
 */
export const addScheduledRows = mutation({
  args: {
    scheduled_import_id: v.id("scheduled_imports"),
    rows: v.array(scheduledRowValidator),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx);

    const batch = await ctx.db.get(args.scheduled_import_id);
    if (batch === null) {
      throw new Error("Scheduled import not found");
    }
    if (batch.status !== "pending") {
      throw new Error("This batch has already been released.");
    }

    for (const row of args.rows) {
      await ctx.db.insert("scheduled_work_order_rows", {
        ...row,
        scheduled_import_id: args.scheduled_import_id,
      });
    }

    return { inserted: args.rows.length };
  },
});

/** Records the total and arms the release, once every staged batch has landed. */
export const finalizeScheduledImport = mutation({
  args: {
    scheduled_import_id: v.id("scheduled_imports"),
    total_rows: v.number(),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx);

    const batch = await ctx.db.get(args.scheduled_import_id);
    if (batch === null) {
      throw new Error("Scheduled import not found");
    }

    const jobId = await ctx.scheduler.runAt(
      batch.release_at,
      internal.scheduledImports.releaseScheduledImport,
      { scheduled_import_id: args.scheduled_import_id },
    );

    await ctx.db.patch(args.scheduled_import_id, {
      total_rows: args.total_rows,
      job_id: jobId,
    });
  },
});

/** Pending and in-flight batches, soonest release first. */
export const listScheduled = query({
  args: {},
  handler: async (ctx) => {
    await requireIdentity(ctx);

    const docs = await ctx.db
      .query("scheduled_imports")
      .withIndex("by_release_at")
      .order("asc")
      .collect();

    return docs.filter((doc) => doc.status !== "released").map(summarise);
  },
});

/**
 * Drops a pending batch: the armed job first, then its staged rows, then the
 * batch record itself.
 *
 * The client calls this repeatedly until `remaining` comes back zero — the
 * same shape as `imports.deleteImport`, because a week of staged rows does not
 * delete in one transaction.
 */
export const cancelScheduledImport = mutation({
  args: {
    scheduled_import_id: v.id("scheduled_imports"),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx);

    const batch = await ctx.db.get(args.scheduled_import_id);
    if (batch === null) {
      return { remaining: 0 };
    }
    if (batch.status !== "pending") {
      throw new Error("This batch is already being released and can no longer be cancelled.");
    }

    // Cancelled on the first pass, so the job cannot fire while the rows it
    // would read are being deleted underneath it.
    if (batch.job_id !== undefined) {
      await ctx.scheduler.cancel(batch.job_id);
      await ctx.db.patch(batch._id, { job_id: undefined });
    }

    const rows = await ctx.db
      .query("scheduled_work_order_rows")
      .withIndex("by_scheduled_import", (q) => q.eq("scheduled_import_id", batch._id))
      .take(CANCEL_BATCH_SIZE);

    for (const row of rows) {
      await ctx.db.delete(row._id);
    }

    if (rows.length === 0) {
      await ctx.db.delete(batch._id);
    }

    return { remaining: rows.length };
  },
});

/** Moves a pending batch to a different release date. Staged rows are untouched. */
export const rescheduleImport = mutation({
  args: {
    scheduled_import_id: v.id("scheduled_imports"),
    release_date: v.string(),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx);

    const batch = await ctx.db.get(args.scheduled_import_id);
    if (batch === null) {
      throw new Error("Scheduled import not found");
    }
    if (batch.status !== "pending") {
      throw new Error("This batch is already being released and can no longer be moved.");
    }
    if (!isFutureReleaseDate(args.release_date)) {
      throw new Error("Pick a release date later than today, or release the batch now instead.");
    }

    if (batch.job_id !== undefined) {
      await ctx.scheduler.cancel(batch.job_id);
    }

    const releaseAt = releaseTimestamp(args.release_date);
    const jobId = await ctx.scheduler.runAt(
      releaseAt,
      internal.scheduledImports.releaseScheduledImport,
      { scheduled_import_id: batch._id },
    );

    await ctx.db.patch(batch._id, {
      release_date: args.release_date,
      release_at: releaseAt,
      job_id: jobId,
    });
  },
});

/**
 * Releases a pending batch straight away.
 *
 * The release date is moved to today first, because that is the day the work
 * orders actually appear and `upload_date` is what the admin panel's Duration
 * filter reads.
 */
export const releaseNow = mutation({
  args: {
    scheduled_import_id: v.id("scheduled_imports"),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx);

    const batch = await ctx.db.get(args.scheduled_import_id);
    if (batch === null) {
      throw new Error("Scheduled import not found");
    }
    if (batch.status !== "pending") {
      throw new Error("This batch is already being released.");
    }

    if (batch.job_id !== undefined) {
      await ctx.scheduler.cancel(batch.job_id);
    }

    await ctx.db.patch(batch._id, {
      release_date: releaseZoneDate(),
      release_at: Date.now(),
      job_id: undefined,
    });

    await ctx.scheduler.runAfter(0, internal.scheduledImports.releaseScheduledImport, {
      scheduled_import_id: batch._id,
    });
  },
});

/**
 * Turns one staged batch into a real import.
 *
 * Batched and self-rescheduling, like `workorders.archiveSupersededOrders`: a
 * week of work orders is more than one transaction can write. Each staged row
 * is deleted in the same transaction that inserts its work order, so a resumed
 * run picks up exactly where it stopped and re-running is never a double
 * insert. The `imports` row is created on the first pass and its totals filled
 * in on the last, which is what `imports.finalizeImport` does for an immediate
 * upload.
 *
 * `archiveSupersededOrders` runs here rather than at upload time — that is the
 * whole point of pre-scheduling: three weeks of batches must not archive
 * finished work three weeks early.
 */
export const releaseScheduledImport = internalMutation({
  args: {
    scheduled_import_id: v.id("scheduled_imports"),
    inserted: v.optional(v.number()),
    missing: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<void> => {
    const batch = await ctx.db.get(args.scheduled_import_id);
    if (batch === null || batch.status === "released") return;

    let importId = batch.import_id;
    if (importId === undefined) {
      importId = await ctx.db.insert("imports", {
        name: `Import-Data-${batch.release_date}`,
        file_name: batch.file_name,
        upload_date: batch.release_date,
        imported_at: Date.now(),
        imported_by: batch.uploaded_by,
        imported_by_name: batch.uploaded_by_name,
        total_rows: 0,
        missing_sites: 0,
      });
      // "releasing" closes the door on cancel and reschedule; the job has
      // fired by now, so its id is no longer anything to hold on to.
      await ctx.db.patch(batch._id, {
        import_id: importId,
        status: "releasing",
        job_id: undefined,
      });
    }

    const staged = await ctx.db
      .query("scheduled_work_order_rows")
      .withIndex("by_scheduled_import", (q) => q.eq("scheduled_import_id", batch._id))
      .take(RELEASE_BATCH_SIZE);

    const sites = await Promise.all(
      staged.map((stagedRow) => findSiteForPanelSplit(ctx, stagedRow.panel_split)),
    );

    let inserted = args.inserted ?? 0;
    let missing = args.missing ?? 0;

    for (let i = 0; i < staged.length; i++) {
      const site = sites[i];
      const { _id, _creationTime, scheduled_import_id, ...source } = staged[i];

      const row = {
        ...source,
        import_id: importId,
        upload_date: batch.release_date,
        current_status: "pending" as const,
        assigned_team: undefined,
        site_id: site?._id,
        missing_value: site === null,
        train_line: site?.area_progress,
      };

      await ctx.db.insert("workorders", {
        ...row,
        status_key: deriveWorkOrderStatus(row),
      });
      await ctx.db.delete(_id);

      inserted++;
      if (site === null) missing++;
    }

    if (staged.length > 0) {
      await ctx.scheduler.runAfter(0, internal.scheduledImports.releaseScheduledImport, {
        scheduled_import_id: batch._id,
        inserted,
        missing,
      });
      return;
    }

    await ctx.db.patch(importId, { total_rows: inserted, missing_sites: missing });
    await ctx.db.patch(batch._id, { status: "released" });

    await ctx.scheduler.runAfter(0, internal.workorders.archiveSupersededOrders, {
      keep_import_id: importId,
    });
  },
});

/**
 * Grace period before the sweeper treats a pending batch as overdue.
 *
 * Long enough that it never races the batch's own armed job, which fires on
 * the minute.
 */
const OVERDUE_GRACE_MS = 15 * 60 * 1000;

/**
 * Picks up releases that should have happened and haven't.
 *
 * A scheduled Convex function that throws is not retried, so a release that
 * fails part-way would otherwise sit half-done with its remaining rows still
 * staged. This re-arms both that case and a `pending` batch whose job went
 * missing. `releaseScheduledImport` resumes rather than restarts, so a sweep
 * that catches a healthy batch costs nothing.
 */
export const resumeDueReleases = internalMutation({
  args: {},
  handler: async (ctx) => {
    const overdue = await ctx.db
      .query("scheduled_imports")
      .withIndex("by_release_at", (q) => q.lte("release_at", Date.now() - OVERDUE_GRACE_MS))
      .collect();

    for (const batch of overdue) {
      if (batch.status === "released") continue;
      // A pending batch with no rows never reached finalize, so there is
      // nothing to release and no job to have lost.
      if (batch.status === "pending" && batch.job_id === undefined) continue;

      await ctx.scheduler.runAfter(0, internal.scheduledImports.releaseScheduledImport, {
        scheduled_import_id: batch._id,
      });
    }
  },
});
