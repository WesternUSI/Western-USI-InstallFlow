# Upload Site Database — Design

## Purpose

Add an "Upload Site Database" button to the web dashboard that opens a modal,
accepts an Excel (`.xlsx`) file matching the "Go Site Database" format, parses
it client-side, and upserts the rows into a new Convex `sites` table. The file
is re-uploaded periodically to add new sites and update existing ones.

This is the first of two upload features (the second, "Upload Work Order",
will be designed separately once its column mapping is defined). Only "Upload
Site Database" is in scope for this spec.

Convex code is written but not deployed — the user pushes schema/functions to
Convex themselves.

## Source file mapping

`Go Site Database.xlsx`, data sheet ("Sheet1", second tab), columns A–K:

| Excel column      | Convex field          | Notes                                              |
|--------------------|------------------------|-----------------------------------------------------|
| LOCATION            | `area`                | string                                              |
| DETAILS             | `site`                 | string                                              |
| PANEL ID            | `panel_id`             | string, unique key for upsert                       |
| QTY                 | `panel_qty`            | number                                              |
| SIZE                | `panel_size`           | string (values like `"10500 x 655"`, not numeric)   |
| Line                | `line`                 | string                                              |
| Equipment           | `equipment`             | comma-separated → `string[]`, e.g. `"140m single cable, 2 junction box"` → `["140m single cable", "2 junction box"]` |
| Install Notes       | `installation_notes`   | string                                              |
| GPS co-ordinates    | `gps_coordinates`      | string                                              |
| Photo saved         | `photo_saved`          | boolean — `"yes"`/`"Yes"` → `true`, blank → `false` |
| Map saved           | `map_saved`            | boolean — same rule as `photo_saved`                |
| *(none yet)*        | `image_id`             | `Id<"_storage">[]`, empty on import; populated later by a future per-site image upload feature |

Header row is matched by column name text (case-insensitive), not fixed
column letters, so reordered columns in future files still work.

## Row validation

- A row with a **blank `panel_id`** is skipped (cannot be matched for
  upsert/dedup).
- A row whose `panel_id` **duplicates an earlier row in the same file** is
  skipped (keeps the first occurrence, flags the rest).
- All skipped rows are collected with a reason and shown in the modal after
  parsing, alongside a count of rows that will be inserted/updated.
- Rows are not skipped for other missing fields (qty, size, notes, etc. are
  optional).

## Convex schema

New table in `packages/backend/convex/schema.ts`:

```ts
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
}).index("by_panel_id", ["panel_id"])
```

## Convex mutation

`packages/backend/convex/sites.ts` — `upsertSites(rows)`:

- Accepts an array of parsed row objects (validated shape matching the
  schema, minus `image_id` which defaults to `[]`).
- For each row, look up an existing document via the `by_panel_id` index.
  - If found: `patch` with the new values.
  - If not found: `insert` a new document with `image_id: []`.
- Returns `{ inserted: number, updated: number }`.

## Client-side parsing

`apps/web/src/lib/parseSiteDatabase.ts`:

- Takes a `File`, reads it via `xlsx` (SheetJS) into an `ArrayBuffer` →
  workbook.
- Locates the data sheet (the sheet containing a header row with `LOCATION`
  and `PANEL ID`), reads the header row to build a column-name → index map.
- Iterates data rows, builds one object per row matching the mapping table
  above, applies the row validation rules.
- Returns `{ rows: ParsedSiteRow[], skipped: { row: number; reason: string }[] }`.
- Pure function, no Convex/network calls — testable in isolation.

## UI

- `packages/ui/src/components/dialog.tsx` — new shared Dialog component built
  on `@base-ui/react/dialog`, styled consistently with the existing
  `button.tsx` (base-ui primitives + `cva`/`cn`, no new dependency needed).
- `apps/web/src/components/upload-site-database-modal.tsx`:
  - File input restricted to `.xlsx`.
  - On file select, runs `parseSiteDatabase` client-side and shows a preview:
    row count ready to upload, and a list of skipped rows with reasons.
  - "Confirm Upload" button calls the `upsertSites` mutation with the parsed
    rows and shows a result summary (inserted/updated counts) via `sonner`
    toast (already a dependency).
- `apps/web/src/components/upload-site-database-button.tsx` — trivial button
  that opens the modal.
- Button rendered on `apps/web/src/routes/_auth/dashboard.tsx`.

## New dependency

`xlsx` (SheetJS) added to `apps/web/package.json` dependencies. User will run
`pnpm install` themselves — this spec does not run installs or touch the
lockfile.

## Out of scope (this spec)

- "Upload Work Order" button/modal — separate spec once the column mapping is
  provided.
- Per-site image upload button that populates `image_id` — future feature.
- Deploying schema/functions to Convex — user does this themselves.
