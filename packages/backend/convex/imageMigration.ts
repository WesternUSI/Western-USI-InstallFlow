import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";

/**
 * Backend half of the one-off "re-compress stored photos" migration, driven by
 * `scripts/recompress-images.mjs`. Everything here is `internal`, so it can
 * only be reached with deployment credentials (`npx convex run`), never from
 * the apps.
 *
 * A photo is "migrated" by uploading a smaller copy and pointing the document
 * at it; the original stays in storage, which is what makes that reversible.
 * `deleteOriginals` is the separate, final step that frees the space, and it
 * refuses to delete anything a document still points at.
 */

const tableValidator = v.union(v.literal("sites"), v.literal("workorders"));

const PAGE_SIZE = 50;

/** One page of documents that reference stored photos, with each photo's size and URL. */
export const listPage = internalQuery({
  args: { table: tableValidator, cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const page =
      args.table === "sites"
        ? await ctx.db.query("sites").paginate({ cursor: args.cursor, numItems: PAGE_SIZE })
        : await ctx.db.query("workorders").paginate({ cursor: args.cursor, numItems: PAGE_SIZE });

    const docs = [];
    for (const doc of page.page) {
      const ids: Id<"_storage">[] =
        "site_img" in doc
          ? doc.site_img
          : [
              ...(doc.completion_photo !== undefined ? [doc.completion_photo] : []),
              ...(doc.completion_photos ?? []),
            ];
      const unique = [...new Set(ids)];
      if (unique.length === 0) continue;

      const images = [];
      for (const id of unique) {
        const meta = await ctx.db.system.get(id);
        images.push({
          id,
          url: meta === null ? null : await ctx.storage.getUrl(id),
          size: meta?.size ?? null,
          contentType: meta?.contentType ?? null,
        });
      }
      docs.push({ _id: doc._id as string, images });
    }

    return { docs, cursor: page.continueCursor, isDone: page.isDone };
  },
});

/** Upload URLs for the compressed copies. They expire after an hour, so ask for few at a time. */
export const uploadUrls = internalMutation({
  args: { count: v.number() },
  handler: async (ctx, args) => {
    const urls: string[] = [];
    for (let i = 0; i < Math.min(args.count, 20); i++) {
      urls.push(await ctx.storage.generateUploadUrl());
    }
    return urls;
  },
});

/** What storage actually holds for these ids — used to check an upload before anything points at it. */
export const storageMeta = internalQuery({
  args: { ids: v.array(v.id("_storage")) },
  handler: async (ctx, args) => {
    const out = [];
    for (const id of args.ids) {
      const meta = await ctx.db.system.get(id);
      out.push(
        meta === null
          ? { id, exists: false as const }
          : {
              id,
              exists: true as const,
              size: meta.size,
              sha256: meta.sha256,
              contentType: meta.contentType ?? null,
              url: await ctx.storage.getUrl(id),
            },
      );
    }
    return out;
  },
});

/**
 * Points one document at different stored files, in place and in the same
 * positions. All-or-nothing: if the document is gone, any `from` is no longer
 * referenced by it, or any `to` is not in storage, the whole call throws and
 * the document is left exactly as it was.
 *
 * Rolling back is the same call with `from` and `to` swapped.
 */
export const swap = internalMutation({
  args: {
    table: tableValidator,
    id: v.string(),
    replacements: v.array(v.object({ from: v.id("_storage"), to: v.id("_storage") })),
  },
  handler: async (ctx, args) => {
    const map = new Map<Id<"_storage">, Id<"_storage">>();
    for (const { from, to } of args.replacements) {
      if ((await ctx.db.system.get(to)) === null) {
        throw new Error(`Replacement file ${to} is not in storage`);
      }
      map.set(from, to);
    }
    const replace = (id: Id<"_storage">) => map.get(id) ?? id;
    const seen = new Set<Id<"_storage">>();
    const note = (id: Id<"_storage">) => {
      if (map.has(id)) seen.add(id);
    };

    if (args.table === "sites") {
      const docId = ctx.db.normalizeId("sites", args.id);
      const doc = docId === null ? null : await ctx.db.get(docId);
      if (docId === null || doc === null) throw new Error(`Site ${args.id} not found`);

      doc.site_img.forEach(note);
      if (seen.size !== map.size) throw new Error(`Site ${args.id} no longer references every file`);

      await ctx.db.patch(docId, { site_img: doc.site_img.map(replace) });
    } else {
      const docId = ctx.db.normalizeId("workorders", args.id);
      const doc = docId === null ? null : await ctx.db.get(docId);
      if (docId === null || doc === null) throw new Error(`Work order ${args.id} not found`);

      if (doc.completion_photo !== undefined) note(doc.completion_photo);
      (doc.completion_photos ?? []).forEach(note);
      if (seen.size !== map.size) {
        throw new Error(`Work order ${args.id} no longer references every file`);
      }

      await ctx.db.patch(docId, {
        ...(doc.completion_photo !== undefined
          ? { completion_photo: replace(doc.completion_photo) }
          : {}),
        ...(doc.completion_photos !== undefined
          ? { completion_photos: doc.completion_photos.map(replace) }
          : {}),
      });
    }

    return { replaced: map.size };
  },
});

/**
 * Deletes migrated originals for good. Each file is re-checked here, inside
 * the same transaction as the delete: if any document it was migrated from
 * still references it, it is kept.
 */
export const deleteOriginals = internalMutation({
  args: {
    items: v.array(
      v.object({
        id: v.id("_storage"),
        refs: v.array(v.object({ table: tableValidator, doc: v.string() })),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const result = { deleted: 0, alreadyGone: 0, kept: [] as string[] };

    for (const item of args.items) {
      if ((await ctx.db.system.get(item.id)) === null) {
        result.alreadyGone++;
        continue;
      }

      let referenced = false;
      for (const ref of item.refs) {
        if (ref.table === "sites") {
          const docId = ctx.db.normalizeId("sites", ref.doc);
          const doc = docId === null ? null : await ctx.db.get(docId);
          if (doc?.site_img.includes(item.id)) referenced = true;
        } else {
          const docId = ctx.db.normalizeId("workorders", ref.doc);
          const doc = docId === null ? null : await ctx.db.get(docId);
          if (doc?.completion_photo === item.id || doc?.completion_photos?.includes(item.id)) {
            referenced = true;
          }
        }
      }

      if (referenced) {
        result.kept.push(item.id);
        continue;
      }
      await ctx.storage.delete(item.id);
      result.deleted++;
    }

    return result;
  },
});
