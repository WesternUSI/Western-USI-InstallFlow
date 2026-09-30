#!/usr/bin/env node
/**
 * One-off migration: re-compress the photos already stored in Convex
 * (`sites.site_img`, `workorders.completion_photo[s]`) to the same 1600px /
 * JPEG 0.7 the apps now upload at.
 *
 * SAFETY MODEL
 *   - Migrating never deletes or overwrites anything. A photo is migrated by uploading
 *     a smaller copy and pointing the document at it. The original file stays
 *     in Convex storage, and a copy of it is kept on this machine too.
 *   - A document is only re-pointed after the new file has been downloaded
 *     back from Convex and matched byte-for-byte (sha256) against the local
 *     compressed file.
 *   - Any photo that is not a plain JPEG/PNG, fails to decode, changes shape,
 *     or would not get meaningfully smaller is left exactly as it is.
 *   - Every swap is written to a manifest, and `--rollback` puts every
 *     document back on its original file.
 *
 * USAGE (from packages/backend; needs macOS `sips` and a logged-in Convex CLI)
 *   node scripts/recompress-images.mjs                 dry run on dev: report only
 *   node scripts/recompress-images.mjs --apply         migrate dev
 *   node scripts/recompress-images.mjs --verify        re-check dev after a run
 *   node scripts/recompress-images.mjs --rollback      undo on dev
 *   node scripts/recompress-images.mjs --purge-originals   FINAL, IRREVERSIBLE: delete the
 *                                                       migrated originals from Convex storage
 *   add --prod to any of these for production
 *   add --limit N to stop after N photos have been migrated (for a first trial)
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_EDGE = 1600;
const JPEG_QUALITY = 70;
/** Photos under this are already about what the migration would produce. */
const MIN_BYTES = 300 * 1024;
/** A re-encode has to save at least this share to be worth a swap. */
const MIN_SAVING = 0.2;

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const option = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);

const PROD = flag("--prod");
const MODE = flag("--purge-originals") ? "purge" : flag("--rollback") ? "rollback" : flag("--verify") ? "verify" : flag("--apply") ? "apply" : "dry-run";
const LIMIT = option("--limit") === undefined ? Infinity : Number(option("--limit"));
const BACKEND_DIR = resolve(option("--backend-dir") ?? join(dirname(fileURLToPath(import.meta.url)), ".."));
const WORK_DIR = resolve(
  option("--work-dir") ?? join(homedir(), "western-usi-image-migration", PROD ? "prod" : "dev"),
);
const ORIGINALS = join(WORK_DIR, "originals");
const COMPRESSED = join(WORK_DIR, "compressed");
const MANIFEST = join(WORK_DIR, "manifest.jsonl");
const TABLES = ["sites", "workorders"];

for (const dir of [ORIGINALS, COMPRESSED]) mkdirSync(dir, { recursive: true });

// ---------------------------------------------------------------- helpers

function convexRun(fn, args) {
  const out = execFileSync(
    "npx",
    ["convex", "run", fn, JSON.stringify(args), ...(PROD ? ["--prod"] : [])],
    { cwd: BACKEND_DIR, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] },
  );
  return JSON.parse(out);
}

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

/** Retries, because over hundreds of downloads a dropped connection is routine. */
async function download(url) {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`download failed (${response.status})`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      await new Promise((done) => setTimeout(done, 1500 * (attempt + 1)));
    }
  }
  throw lastError;
}

function kindOf(buffer) {
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpeg";
  if (buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  return null;
}

/**
 * True only if the file ends the way a whole JPEG/PNG does. macOS will
 * happily decode a truncated JPEG (the missing part comes out grey), so a
 * decode check alone would let a damaged photo through.
 */
function isComplete(buffer, kind) {
  if (kind === "jpeg") return buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9;
  return buffer.subarray(-12).equals(Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]));
}

/** EXIF orientation (1-8) of a JPEG, or 1 when it has none. */
function jpegOrientation(buffer) {
  let offset = 2;
  while (offset + 4 <= buffer.length && buffer[offset] === 0xff) {
    const marker = buffer[offset + 1];
    if (marker === 0xda || marker === 0xd9) break;
    const length = buffer.readUInt16BE(offset + 2);
    if (marker === 0xe1 && buffer.toString("latin1", offset + 4, offset + 10) === "Exif\0\0") {
      const tiff = offset + 10;
      const little = buffer.toString("latin1", tiff, tiff + 2) === "II";
      const u16 = (at) => (little ? buffer.readUInt16LE(at) : buffer.readUInt16BE(at));
      const u32 = (at) => (little ? buffer.readUInt32LE(at) : buffer.readUInt32BE(at));
      const ifd = tiff + u32(tiff + 4);
      const entries = u16(ifd);
      for (let i = 0; i < entries; i++) {
        const entry = ifd + 2 + i * 12;
        if (entry + 12 > buffer.length) break;
        if (u16(entry) === 0x0112) {
          // Only 2-8 rotate or mirror. Some Android cameras write 0
          // ("unspecified"), which every viewer shows the same as 1.
          const value = u16(entry + 8);
          return value >= 2 && value <= 8 ? value : 1;
        }
      }
      return 1;
    }
    offset += 2 + length;
  }
  return 1;
}

function dimensions(path) {
  const out = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", path], { encoding: "utf8" });
  const width = Number(/pixelWidth: (\d+)/.exec(out)?.[1]);
  const height = Number(/pixelHeight: (\d+)/.exec(out)?.[1]);
  if (!width || !height) throw new Error("could not read image dimensions");
  return { width, height };
}

/** Forces a full decode, so a truncated or corrupt file fails here rather than in the app. */
function assertDecodes(path) {
  const probe = join(tmpdir(), `recompress-probe-${process.pid}.jpg`);
  execFileSync("sips", ["-s", "format", "jpeg", "-Z", "64", path, "--out", probe], { stdio: "pipe" });
  if (kindOf(readFileSync(probe)) !== "jpeg") throw new Error("file does not decode");
}

function readManifest() {
  if (!existsSync(MANIFEST)) return [];
  return readFileSync(MANIFEST, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

/** The most recent manifest entry for each (document, original photo). */
function latestEntries() {
  const latest = new Map();
  for (const entry of readManifest()) latest.set(`${entry.table}/${entry.doc}/${entry.from}`, entry);
  return [...latest.values()];
}

/** Swapped to the compressed copy — whether or not its original has since been purged. */
const isMigrated = (entry) => entry.status === "done" || entry.status === "purged";

/** Appended and fsynced, so a crash can never lose the record of a swap. */
function writeManifest(entry) {
  const fd = openSync(MANIFEST, "a");
  appendFileSync(fd, `${JSON.stringify({ ...entry, at: new Date().toISOString() })}\n`);
  fsyncSync(fd);
  closeSync(fd);
}

async function* allDocs() {
  for (const table of TABLES) {
    let cursor = null;
    for (;;) {
      const page = convexRun("imageMigration:listPage", { table, cursor });
      for (const doc of page.docs) yield { table, ...doc };
      if (page.isDone) break;
      cursor = page.cursor;
    }
  }
}

// ------------------------------------------------------------- one photo

/**
 * Downloads and compresses one stored photo locally. Returns either
 * `{ skip: reason }` or `{ file, size }` for a compressed copy that passed
 * every check. Never touches Convex beyond the download.
 */
async function prepare(image) {
  if (image.url === null || image.size === null) return { skip: "missing from storage" };
  if (image.size < MIN_BYTES) return { skip: "already small" };

  const originalPath = join(ORIGINALS, image.id);
  let original;
  if (existsSync(originalPath) && statSync(originalPath).size === image.size) {
    original = readFileSync(originalPath);
  } else {
    original = await download(image.url);
    if (original.length !== image.size) return { skip: "download size mismatch" };
    writeFileSync(originalPath, original);
  }

  const kind = kindOf(original);
  if (kind === null) return { skip: "not a JPEG or PNG" };
  if (!isComplete(original, kind)) return { skip: "original looks damaged or has extra data" };

  // sips picks the decoder from the extension, so give it a truthful one.
  const source = join(ORIGINALS, `${image.id}.${kind === "jpeg" ? "jpg" : "png"}`);
  if (!existsSync(source) || statSync(source).size !== original.length) writeFileSync(source, original);

  let before;
  try {
    before = dimensions(source);
    assertDecodes(source);
  } catch {
    return { skip: "original does not decode" };
  }

  // JPEG has no transparency, so see-through areas would come out white.
  if (kind === "png") {
    const alpha = execFileSync("sips", ["-g", "hasAlpha", source], { encoding: "utf8" });
    if (!/hasAlpha: no/.test(alpha)) return { skip: "PNG with transparency" };
  }

  const target = join(COMPRESSED, `${image.id}.jpg`);
  const longEdge = Math.max(before.width, before.height);
  try {
    execFileSync(
      "sips",
      [
        "-s", "format", "jpeg",
        "-s", "formatOptions", String(JPEG_QUALITY),
        // -Z would also scale a small photo *up*, so only pass it when shrinking.
        ...(longEdge > MAX_EDGE ? ["-Z", String(MAX_EDGE)] : []),
        source,
        "--out", target,
      ],
      { stdio: "pipe" },
    );
  } catch {
    return { skip: "compression failed" };
  }

  const compressed = readFileSync(target);
  if (kindOf(compressed) !== "jpeg" || !isComplete(compressed, "jpeg")) {
    return { skip: "compressed file is not a whole JPEG" };
  }

  let after;
  try {
    after = dimensions(target);
    assertDecodes(target);
  } catch {
    return { skip: "compressed file does not decode" };
  }

  const expectedEdge = Math.min(longEdge, MAX_EDGE);
  if (Math.abs(Math.max(after.width, after.height) - expectedEdge) > 1) return { skip: "unexpected output size" };
  const ratioBefore = before.width / before.height;
  const ratioAfter = after.width / after.height;
  if (Math.abs(ratioBefore - ratioAfter) / ratioBefore > 0.01) return { skip: "shape changed" };

  const orientationBefore = kind === "jpeg" ? jpegOrientation(original) : 1;
  if (jpegOrientation(compressed) !== orientationBefore) return { skip: "rotation changed" };

  if (compressed.length > image.size * (1 - MIN_SAVING)) return { skip: "no real saving" };

  return { file: target, bytes: compressed, size: compressed.length, before, after };
}

/** Uploads a prepared copy and proves Convex holds exactly those bytes. */
async function uploadVerified(prepared) {
  const [uploadUrl] = convexRun("imageMigration:uploadUrls", { count: 1 });
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": "image/jpeg" },
    body: prepared.bytes,
  });
  if (!response.ok) throw new Error(`upload failed (${response.status})`);
  const { storageId } = await response.json();
  if (!storageId) throw new Error("upload returned no storage id");

  const [meta] = convexRun("imageMigration:storageMeta", { ids: [storageId] });
  if (!meta.exists || meta.size !== prepared.size || meta.url === null) {
    throw new Error("uploaded file is not what storage reports");
  }
  const roundTrip = await download(meta.url);
  if (sha256(roundTrip) !== sha256(prepared.bytes)) throw new Error("uploaded file does not match");

  return storageId;
}

// ------------------------------------------------------------------ modes

async function migrate() {
  const apply = MODE === "apply";
  const alreadyNew = new Set(latestEntries().filter(isMigrated).map((e) => e.to));

  const stats = { photos: 0, migrated: 0, skipped: {}, failed: 0, bytesBefore: 0, bytesAfter: 0, totalBytes: 0 };
  const skip = (reason) => (stats.skipped[reason] = (stats.skipped[reason] ?? 0) + 1);

  for await (const doc of allDocs()) {
    if (stats.migrated >= LIMIT) break;
    const replacements = [];

    for (const image of doc.images) {
      stats.photos++;
      stats.totalBytes += image.size ?? 0;
      if (alreadyNew.has(image.id)) {
        skip("already migrated");
        continue;
      }
      if (stats.migrated + replacements.length >= LIMIT) break;

      try {
        const prepared = await prepare(image);
        if (prepared.skip) {
          skip(prepared.skip);
          continue;
        }
        const entry = { table: doc.table, doc: doc._id, from: image.id, fromSize: image.size, toSize: prepared.size };
        if (apply) entry.to = await uploadVerified(prepared);
        replacements.push(entry);
        console.log(
          `${apply ? "ready " : "would "} ${doc.table}/${doc._id} ${image.id}: ${mb(image.size)} -> ${mb(prepared.size)} ` +
            `(${prepared.before.width}x${prepared.before.height} -> ${prepared.after.width}x${prepared.after.height})`,
        );
      } catch (error) {
        stats.failed++;
        console.error(`FAILED ${doc.table}/${doc._id} ${image.id}: ${error.message} — left untouched`);
      }
    }

    if (replacements.length === 0) continue;

    if (apply) {
      try {
        for (const entry of replacements) writeManifest({ ...entry, status: "pending" });
        convexRun("imageMigration:swap", {
          table: doc.table,
          id: doc._id,
          replacements: replacements.map(({ from, to }) => ({ from, to })),
        });
        for (const entry of replacements) writeManifest({ ...entry, status: "done" });
      } catch (error) {
        stats.failed += replacements.length;
        console.error(`FAILED swap on ${doc.table}/${doc._id}: ${String(error.message).split("\n")[0]} — document left untouched`);
        continue;
      }
    }

    for (const entry of replacements) {
      stats.migrated++;
      stats.bytesBefore += entry.fromSize;
      stats.bytesAfter += entry.toSize;
    }
  }

  console.log(`\n${apply ? "MIGRATED" : "DRY RUN (nothing was changed)"} — ${PROD ? "PRODUCTION" : "dev"}`);
  console.log(`  photos referenced:   ${stats.photos} (${mb(stats.totalBytes)})`);
  console.log(`  ${apply ? "migrated" : "would migrate"}:       ${stats.migrated}  ${mb(stats.bytesBefore)} -> ${mb(stats.bytesAfter)}`);
  for (const [reason, count] of Object.entries(stats.skipped)) console.log(`  left as is (${reason}): ${count}`);
  console.log(`  failed (left untouched): ${stats.failed}`);
  console.log(`  local copies + manifest: ${WORK_DIR}`);

  if (apply) await verify();
  return stats.failed;
}

/**
 * Re-reads everything from Convex and checks that every referenced photo is
 * still there, that every migrated photo matches its local compressed file
 * byte for byte, and that every original is still in storage.
 */
async function verify() {
  const done = latestEntries().filter((e) => e.status === "done");
  const byNew = new Map(latestEntries().filter(isMigrated).map((e) => [e.to, e]));
  let referenced = 0;
  let checked = 0;
  const problems = [];

  for await (const doc of allDocs()) {
    for (const image of doc.images) {
      referenced++;
      if (image.url === null || image.size === null) {
        problems.push(`${doc.table}/${doc._id} references ${image.id}, which is not in storage`);
        continue;
      }
      const entry = byNew.get(image.id);
      if (entry === undefined) continue;
      const local = join(COMPRESSED, `${entry.from}.jpg`);
      let remote;
      try {
        remote = await download(image.url);
      } catch {
        problems.push(`${doc.table}/${doc._id} photo ${image.id} could not be downloaded to check`);
        continue;
      }
      if (!existsSync(local) || sha256(remote) !== sha256(readFileSync(local))) {
        problems.push(`${doc.table}/${doc._id} photo ${image.id} does not match its local compressed copy`);
      }
      checked++;
    }
  }

  let originalsPresent = 0;
  for (let i = 0; i < done.length; i += 50) {
    const metas = convexRun("imageMigration:storageMeta", { ids: done.slice(i, i + 50).map((e) => e.from) });
    for (const meta of metas) {
      if (meta.exists) originalsPresent++;
      else problems.push(`original ${meta.id} is no longer in storage`);
    }
  }

  console.log(`\nVERIFY — ${PROD ? "PRODUCTION" : "dev"}`);
  console.log(`  photos referenced by documents: ${referenced}`);
  console.log(`  migrated photos re-downloaded and matched: ${checked}`);
  console.log(`  originals still in storage: ${originalsPresent} of ${done.length}`);
  if (problems.length === 0) console.log("  RESULT: OK — no problems found");
  else {
    console.log(`  RESULT: ${problems.length} PROBLEM(S)`);
    for (const problem of problems) console.log(`   - ${problem}`);
  }
  return problems.length;
}

async function rollback() {
  const byDoc = new Map();
  for (const entry of latestEntries()) {
    if (entry.status !== "done" && entry.status !== "pending") continue;
    const key = `${entry.table}/${entry.doc}`;
    byDoc.set(key, [...(byDoc.get(key) ?? []), entry]);
  }

  let restored = 0;
  let failed = 0;
  for (const [key, entries] of byDoc) {
    try {
      convexRun("imageMigration:swap", {
        table: entries[0].table,
        id: entries[0].doc,
        replacements: entries.map(({ from, to }) => ({ from: to, to: from })),
      });
      for (const entry of entries) writeManifest({ ...entry, status: "rolled-back" });
      restored += entries.length;
    } catch (error) {
      failed += entries.length;
      console.error(`could not roll back ${key}: ${String(error.message).split("\n")[0]}`);
    }
  }
  console.log(`\nROLLBACK — ${PROD ? "PRODUCTION" : "dev"}: ${restored} photo(s) restored to the original file, ${failed} not restored`);
  return failed;
}

/**
 * Deletes the migrated originals from Convex storage. Irreversible inside
 * Convex, so it only runs after a clean verify, and only touches a file when
 *   - the manifest records it as migrated,
 *   - no site or work order references it any more (checked here against a
 *     fresh listing, and again by the backend inside the delete itself), and
 *   - an intact copy of it is still on this machine.
 */
async function purge() {
  if ((await verify()) !== 0) {
    console.error("\nPURGE ABORTED: verify found problems. Nothing was deleted.");
    return 1;
  }

  const referenced = new Set();
  for await (const doc of allDocs()) for (const image of doc.images) referenced.add(image.id);

  const byOriginal = new Map();
  for (const entry of latestEntries()) {
    if (entry.status !== "done") continue;
    byOriginal.set(entry.from, [...(byOriginal.get(entry.from) ?? []), entry]);
  }

  const items = [];
  const held = [];
  for (const [id, entries] of byOriginal) {
    const local = join(ORIGINALS, id);
    if (referenced.has(id)) held.push(`${id}: still referenced by a document`);
    else if (!entries.every((entry) => referenced.has(entry.to))) held.push(`${id}: its replacement is not in use`);
    else if (!existsSync(local) || statSync(local).size !== entries[0].fromSize) held.push(`${id}: no intact local copy`);
    else items.push({ id, entries });
  }

  let deleted = 0;
  let alreadyGone = 0;
  let bytes = 0;
  for (let i = 0; i < items.length; i += 20) {
    const batch = items.slice(i, i + 20);
    const result = convexRun("imageMigration:deleteOriginals", {
      items: batch.map(({ id, entries }) => ({ id, refs: entries.map((e) => ({ table: e.table, doc: e.doc })) })),
    });
    deleted += result.deleted;
    alreadyGone += result.alreadyGone;
    const kept = new Set(result.kept);
    for (const { id, entries } of batch) {
      if (kept.has(id)) {
        held.push(`${id}: backend found it still referenced`);
        continue;
      }
      bytes += entries[0].fromSize;
      for (const entry of entries) writeManifest({ ...entry, status: "purged" });
    }
  }

  console.log(`\nPURGE — ${PROD ? "PRODUCTION" : "dev"}`);
  console.log(`  originals deleted: ${deleted} (${mb(bytes)} freed)${alreadyGone ? `, already gone: ${alreadyGone}` : ""}`);
  console.log(`  originals kept: ${held.length}`);
  for (const line of held) console.log(`   - ${line}`);

  return (await verify()) + held.length;
}

const failures =
  MODE === "purge" ? await purge() : MODE === "rollback" ? await rollback() : MODE === "verify" ? await verify() : await migrate();
process.exit(failures === 0 ? 0 : 1);
