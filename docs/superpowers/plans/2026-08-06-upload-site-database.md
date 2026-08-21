# Upload Site Database Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Upload Site Database" button + modal to the web dashboard that parses a `Go Site Database.xlsx` file client-side and upserts rows into a new Convex `sites` table, keyed by `panel_id`.

**Architecture:** A pure parsing function (`parseSiteDatabase`) turns an Excel `ArrayBuffer` into typed rows + a skipped-row report, entirely in the browser with no network calls. A Convex mutation (`upsertSites`) takes the parsed rows and patches/inserts by `panel_id` index, leaving `image_id` untouched on update. A modal component wires file selection → parse → preview → confirm → mutation call, using a new shared `Dialog` primitive built on `@base-ui/react/dialog`.

**Tech Stack:** React 19, TanStack Router, Convex, `@base-ui/react` (already a dependency), `xlsx` (SheetJS, new dependency), `sonner` (already a dependency) for toasts.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-06-upload-site-database-design.md` — follow its field mapping, validation rules, and schema exactly.
- Convex schema/functions are written but **not deployed**. Do not run `convex dev`, `convex deploy`, or push anything to Convex.
- **No `node_modules` are installed in this repo right now.** Do not run `pnpm install` yourself — the user runs it once, themselves, after `xlsx` is added to `apps/web/package.json`. Any verification command in this plan that needs installed dependencies (`tsc`, running the dev server, importing `xlsx`) can only be run **after** that install — note this at each such step rather than skipping the step.
- Do not touch `node_modules`, lockfiles, or generated files (e.g. `apps/web/src/routeTree.gen.ts`, `packages/backend/convex/_generated/*`).
- Follow existing code style: `cva`/`cn` for variants, `data-slot` attributes, relative imports within the same component directory, `@/*` alias for cross-directory imports in `apps/web`, `@usi-installer/ui/*` for the shared UI package.

---

### Task 1: Add `sites` table to Convex schema

**Files:**
- Modify: `packages/backend/convex/schema.ts`

**Interfaces:**
- Produces: a `sites` table with an index named `by_panel_id` on field `panel_id`, and fields `area: string`, `site: string`, `panel_id: string`, `image_id: Id<"_storage">[]`, `installation_notes?: string`, `equipment: string[]`, `panel_qty?: number`, `panel_size?: string`, `line?: string`, `gps_coordinates?: string`, `photo_saved: boolean`, `map_saved: boolean`. Task 3 (`upsertSites` mutation) queries this table by `by_panel_id`.

- [ ] **Step 1: Replace the empty schema with the `sites` table**

Replace the full contents of `packages/backend/convex/schema.ts`:

```ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
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
```

- [ ] **Step 2: Verify (after the user has run `pnpm install` at some point)**

Run: `pnpm --filter @usi-installer/backend exec tsc --noEmit -p convex/tsconfig.json`
Expected: no errors. (Skip this step now if `node_modules` isn't installed yet — re-run it once it is.)

- [ ] **Step 3: Commit**

```bash
git add packages/backend/convex/schema.ts
git commit -m "feat: add sites table to convex schema"
```

---

### Task 2: Add `xlsx` dependency and write `parseSiteDatabase`

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/src/lib/parseSiteDatabase.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `parseSiteDatabase(buffer: ArrayBuffer): ParseSiteDatabaseResult`, and exported types `ParsedSiteRow`, `SkippedRow`, `ParseSiteDatabaseResult`. Task 5 (the modal) calls `parseSiteDatabase` and reads `result.rows` / `result.skipped`. Task 3's mutation arg shape (`siteRowValidator`) must accept exactly the fields of `ParsedSiteRow`.

  ```ts
  export interface ParsedSiteRow {
    area: string;
    site: string;
    panel_id: string;
    installation_notes?: string;
    equipment: string[];
    panel_qty?: number;
    panel_size?: string;
    line?: string;
    gps_coordinates?: string;
    photo_saved: boolean;
    map_saved: boolean;
  }

  export interface SkippedRow {
    row: number;
    reason: string;
  }

  export interface ParseSiteDatabaseResult {
    rows: ParsedSiteRow[];
    skipped: SkippedRow[];
  }
  ```

- [ ] **Step 1: Add the `xlsx` dependency**

In `apps/web/package.json`, add to `"dependencies"` (alphabetical position, after `"sonner"`):

```json
    "sonner": "catalog:",
    "xlsx": "^0.18.5",
    "zod": "catalog:"
```

(This replaces the existing `"sonner": "catalog:",` / `"zod": "catalog:"` lines — insert the `xlsx` line between them.)

- [ ] **Step 2: Write `parseSiteDatabase.ts`**

Create `apps/web/src/lib/parseSiteDatabase.ts`:

```ts
import * as XLSX from "xlsx";

export interface ParsedSiteRow {
  area: string;
  site: string;
  panel_id: string;
  installation_notes?: string;
  equipment: string[];
  panel_qty?: number;
  panel_size?: string;
  line?: string;
  gps_coordinates?: string;
  photo_saved: boolean;
  map_saved: boolean;
}

export interface SkippedRow {
  row: number;
  reason: string;
}

export interface ParseSiteDatabaseResult {
  rows: ParsedSiteRow[];
  skipped: SkippedRow[];
}

const COLUMN_ALIASES: Record<string, keyof ParsedSiteRow | "panel_id_raw"> = {
  location: "area",
  details: "site",
  "panel id": "panel_id",
  qty: "panel_qty",
  size: "panel_size",
  line: "line",
  equipment: "equipment",
  "install notes": "installation_notes",
  "gps co-ordinates": "gps_coordinates",
  "photo saved": "photo_saved",
  "map saved": "map_saved",
};

export function parseSiteDatabase(buffer: ArrayBuffer): ParseSiteDatabaseResult {
  const workbook = XLSX.read(buffer, { type: "array" });
  const grid = findDataSheetGrid(workbook);

  const headerRowIndex = grid.findIndex((row) =>
    row.some((cell) => normalizeHeader(cell) === "location"),
  );
  if (headerRowIndex === -1) {
    throw new Error("Could not find a header row containing 'LOCATION' in the workbook");
  }

  const headerRow = grid[headerRowIndex];
  const columnMap = new Map<number, string>();
  headerRow.forEach((cell, index) => {
    const field = COLUMN_ALIASES[normalizeHeader(cell)];
    if (field) columnMap.set(index, field);
  });

  const rows: ParsedSiteRow[] = [];
  const skipped: SkippedRow[] = [];
  const seenPanelIds = new Set<string>();

  for (let i = headerRowIndex + 1; i < grid.length; i++) {
    const raw = grid[i];
    if (!raw || raw.every((cell) => cell === "" || cell == null)) continue;

    const record: Record<string, unknown> = {};
    for (const [colIndex, field] of columnMap) {
      record[field] = raw[colIndex];
    }

    const excelRowNumber = i + 1;
    const panelId = String(record.panel_id ?? "").trim();

    if (!panelId) {
      skipped.push({ row: excelRowNumber, reason: "Missing Panel ID" });
      continue;
    }
    if (seenPanelIds.has(panelId)) {
      skipped.push({
        row: excelRowNumber,
        reason: `Duplicate Panel ID "${panelId}" (first occurrence kept)`,
      });
      continue;
    }
    seenPanelIds.add(panelId);

    rows.push({
      area: String(record.area ?? "").trim(),
      site: String(record.site ?? "").trim(),
      panel_id: panelId,
      installation_notes: toOptionalString(record.installation_notes),
      equipment: toEquipmentList(record.equipment),
      panel_qty: toOptionalNumber(record.panel_qty),
      panel_size: toOptionalString(record.panel_size),
      line: toOptionalString(record.line),
      gps_coordinates: toOptionalString(record.gps_coordinates),
      photo_saved: toBoolean(record.photo_saved),
      map_saved: toBoolean(record.map_saved),
    });
  }

  return { rows, skipped };
}

function findDataSheetGrid(workbook: XLSX.WorkBook): unknown[][] {
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: true,
      defval: "",
    });
    const hasLocationHeader = grid.some((row) =>
      row.some((cell) => normalizeHeader(cell) === "location"),
    );
    if (hasLocationHeader) return grid;
  }
  throw new Error("Could not find a sheet with a 'LOCATION' column in the workbook");
}

function normalizeHeader(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function toOptionalString(value: unknown): string | undefined {
  const str = String(value ?? "").trim();
  return str === "" ? undefined : str;
}

function toOptionalNumber(value: unknown): number | undefined {
  if (value === "" || value == null) return undefined;
  const num = Number(value);
  return Number.isNaN(num) ? undefined : num;
}

function toBoolean(value: unknown): boolean {
  return String(value ?? "").trim().toLowerCase() === "yes";
}

function toEquipmentList(value: unknown): string[] {
  const str = String(value ?? "").trim();
  if (str === "") return [];
  return str
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");
}
```

- [ ] **Step 3: Note deferred verification**

`parseSiteDatabase` is TypeScript and depends on the `xlsx` package, so it
can't be exercised standalone without a bundler/ts-runner. The real
verification happens once Task 6 wires the modal into the running app:
upload the real `Go Site Database.xlsx` there and confirm the preview
matches the expected counts recorded during design — **791 data rows, 4
skipped (1 blank Panel ID, 3 duplicates), 787 rows ready to upload.**

- [ ] **Step 4: Commit**

```bash
git add apps/web/package.json apps/web/src/lib/parseSiteDatabase.ts
git commit -m "feat: add xlsx dependency and site database parser"
```

---

### Task 3: Add `upsertSites` Convex mutation

**Files:**
- Create: `packages/backend/convex/sites.ts`

**Interfaces:**
- Consumes: the `sites` table + `by_panel_id` index from Task 1; the `ParsedSiteRow` shape from Task 2 (mirrored here as a Convex validator since Convex functions can't import browser-side TS types directly).
- Produces: `upsertSites` mutation, args `{ rows: ParsedSiteRow[] }`, returns `{ inserted: number; updated: number }`. Task 5 (the modal) calls this via `useMutation(api.sites.upsertSites)`.

- [ ] **Step 1: Write the mutation**

Create `packages/backend/convex/sites.ts`:

```ts
import { v } from "convex/values";
import { mutation } from "./_generated/server";

const siteRowValidator = v.object({
  area: v.string(),
  site: v.string(),
  panel_id: v.string(),
  installation_notes: v.optional(v.string()),
  equipment: v.array(v.string()),
  panel_qty: v.optional(v.number()),
  panel_size: v.optional(v.string()),
  line: v.optional(v.string()),
  gps_coordinates: v.optional(v.string()),
  photo_saved: v.boolean(),
  map_saved: v.boolean(),
});

export const upsertSites = mutation({
  args: {
    rows: v.array(siteRowValidator),
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    let updated = 0;

    for (const row of args.rows) {
      const existing = await ctx.db
        .query("sites")
        .withIndex("by_panel_id", (q) => q.eq("panel_id", row.panel_id))
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, row);
        updated++;
      } else {
        await ctx.db.insert("sites", { ...row, image_id: [] });
        inserted++;
      }
    }

    return { inserted, updated };
  },
});
```

Note: `ctx.db.patch` is only given the fields in `row` — `image_id` is
deliberately excluded from the patch so an update never wipes out images
uploaded through the (future) per-site image feature.

- [ ] **Step 2: Verify (after `pnpm install`)**

Run: `pnpm --filter @usi-installer/backend exec tsc --noEmit -p convex/tsconfig.json`
Expected: no errors, and `api.sites.upsertSites` appears once `convex dev`
regenerates `_generated/api.d.ts` (the user does this themselves).

- [ ] **Step 3: Commit**

```bash
git add packages/backend/convex/sites.ts
git commit -m "feat: add upsertSites convex mutation"
```

---

### Task 4: Add shared `Dialog` component to the UI package

**Files:**
- Create: `packages/ui/src/components/dialog.tsx`

**Interfaces:**
- Consumes: `cn` from `@usi-installer/ui/lib/utils` (existing), `@base-ui/react/dialog` (existing dependency, not yet used elsewhere in this repo).
- Produces: `Dialog`, `DialogTrigger`, `DialogPortal`, `DialogClose`, `DialogBackdrop`, `DialogContent`, `DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription` — all imported from `@usi-installer/ui/components/dialog` by Task 5.

- [ ] **Step 1: Write the Dialog component**

Create `packages/ui/src/components/dialog.tsx`:

```tsx
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn } from "@usi-installer/ui/lib/utils";
import { XIcon } from "lucide-react";
import * as React from "react";

function Dialog(props: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger(props: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal(props: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose(props: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogBackdrop({ className, ...props }: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-backdrop"
      className={cn(
        "fixed inset-0 z-50 bg-black/50 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
        className,
      )}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & { showCloseButton?: boolean }) {
  return (
    <DialogPortal>
      <DialogBackdrop />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 border border-border bg-background p-6 shadow-lg data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogClose
            data-slot="dialog-close-button"
            className="absolute top-4 right-4 opacity-70 outline-none transition-opacity hover:opacity-100 focus-visible:opacity-100"
          >
            <XIcon className="size-4" />
            <span className="sr-only">Close</span>
          </DialogClose>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-1.5 text-center sm:text-left", className)}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("cn-font-heading text-sm font-medium", className)}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-xs/relaxed text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogClose,
  DialogBackdrop,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
```

- [ ] **Step 2: Verify (after `pnpm install`)**

Run: `pnpm --filter @usi-installer/ui check-types`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/dialog.tsx
git commit -m "feat: add shared Dialog component"
```

---

### Task 5: Build the upload modal and button

**Files:**
- Create: `apps/web/src/components/upload-site-database-modal.tsx`
- Create: `apps/web/src/components/upload-site-database-button.tsx`

**Interfaces:**
- Consumes: `parseSiteDatabase`, `ParseSiteDatabaseResult` from Task 2 (`@/lib/parseSiteDatabase`); `Dialog`/`DialogContent`/etc. from Task 4 (`@usi-installer/ui/components/dialog`); `Button` from existing `@usi-installer/ui/components/button`; `api.sites.upsertSites` from Task 3.
- Produces: `UploadSiteDatabaseButton` component (no props) — self-contained, renders its own trigger button and modal. Task 6 imports this from `@/components/upload-site-database-button`.

- [ ] **Step 1: Write the modal**

Create `apps/web/src/components/upload-site-database-modal.tsx`:

```tsx
import { api } from "@usi-installer/backend/convex/_generated/api";
import { Button } from "@usi-installer/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@usi-installer/ui/components/dialog";
import { useMutation } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";

import { parseSiteDatabase, type ParseSiteDatabaseResult } from "@/lib/parseSiteDatabase";

interface UploadSiteDatabaseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UploadSiteDatabaseModal({ open, onOpenChange }: UploadSiteDatabaseModalProps) {
  const [result, setResult] = useState<ParseSiteDatabaseResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const upsertSites = useMutation(api.sites.upsertSites);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setParseError(null);
    setResult(null);

    try {
      const buffer = await file.arrayBuffer();
      setResult(parseSiteDatabase(buffer));
    } catch (error) {
      setParseError(error instanceof Error ? error.message : "Failed to parse file");
    }
  }

  async function handleConfirm() {
    if (!result || result.rows.length === 0) return;

    setIsUploading(true);
    try {
      const { inserted, updated } = await upsertSites({ rows: result.rows });
      toast.success(`Upload complete: ${inserted} inserted, ${updated} updated`);
      setResult(null);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload Site Database</DialogTitle>
          <DialogDescription>
            Select the Go Site Database Excel file. Existing sites are matched and updated by
            Panel ID; new Panel IDs are added.
          </DialogDescription>
        </DialogHeader>

        <input type="file" accept=".xlsx" onChange={handleFileChange} className="text-xs" />

        {parseError && <p className="text-xs text-destructive">{parseError}</p>}

        {result && (
          <div className="flex flex-col gap-2 text-xs">
            <p>{result.rows.length} rows ready to upload.</p>
            {result.skipped.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-none border border-border p-2">
                <p className="mb-1 font-medium">{result.skipped.length} rows skipped:</p>
                <ul className="flex flex-col gap-0.5 text-muted-foreground">
                  {result.skipped.map((s) => (
                    <li key={s.row}>
                      Row {s.row}: {s.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!result || result.rows.length === 0 || isUploading}
            onClick={handleConfirm}
          >
            {isUploading ? "Uploading..." : "Confirm Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Write the button**

Create `apps/web/src/components/upload-site-database-button.tsx`:

```tsx
import { Button } from "@usi-installer/ui/components/button";
import { useState } from "react";

import { UploadSiteDatabaseModal } from "./upload-site-database-modal";

export function UploadSiteDatabaseButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>Upload Site Database</Button>
      <UploadSiteDatabaseModal open={open} onOpenChange={setOpen} />
    </>
  );
}
```

- [ ] **Step 3: Verify (after `pnpm install`)**

Run: `pnpm --filter web check-types`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/upload-site-database-modal.tsx apps/web/src/components/upload-site-database-button.tsx
git commit -m "feat: add upload site database modal and button"
```

---

### Task 6: Wire the button into the dashboard

**Files:**
- Modify: `apps/web/src/routes/_auth/dashboard.tsx`

**Interfaces:**
- Consumes: `UploadSiteDatabaseButton` from Task 5 (`@/components/upload-site-database-button`).

- [ ] **Step 1: Add the button to the dashboard route**

Replace the full contents of `apps/web/src/routes/_auth/dashboard.tsx`:

```tsx
import { UserButton, useUser } from "@clerk/react";
import { createFileRoute } from "@tanstack/react-router";
import { api } from "@usi-installer/backend/convex/_generated/api";
import { useQuery } from "convex/react";

import { UploadSiteDatabaseButton } from "@/components/upload-site-database-button";

export const Route = createFileRoute("/_auth/dashboard")({
  component: RouteComponent,
});

function RouteComponent() {
  const privateData = useQuery(api.privateData.get);
  const user = useUser();

  return (
    <div>
      <h1>Dashboard</h1>
      <p>Welcome {user.user?.fullName}</p>
      <p>privateData: {privateData?.message}</p>
      <div className="flex gap-2 py-4">
        <UploadSiteDatabaseButton />
      </div>
      <UserButton />
    </div>
  );
}
```

- [ ] **Step 2: Verify manually once `pnpm install` and `convex dev` (both run by the user) are set up**

Run: `pnpm --filter web dev`, open the dashboard, click "Upload Site
Database", select `Go Site Database.xlsx`, and confirm the preview shows
**791 rows ready, 4 skipped** before clicking "Confirm Upload" (which will
only succeed once the user has connected/deployed Convex).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/routes/_auth/dashboard.tsx
git commit -m "feat: wire upload site database button into dashboard"
```
