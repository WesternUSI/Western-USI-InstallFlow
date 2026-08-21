# Western USI InstallFlow — Web Admin Panel Design

Design reference for `apps/web` only. The Expo/React Native installer app
(`apps/native`) is a separate product with its own conventions; this document
covers the browser-based office/admin panel and the shared code it depends on.

---

## 1. Purpose and audience

The web app is the **back office** for Western USI's panel installation
workflow. Installers never use it — they use the native app. Everything here is
built for office staff sitting at a desk:

| Job | Where it happens |
|---|---|
| Import the daily Installation Schedule (work orders) | Import Work Orders |
| Import the Go Site Database (panel reference data) | Import Site Data |
| Fill in per-site install notes, equipment, photos | Manage Site Data → Edit Site |
| Watch progress across train lines and teams | Dashboard, Manage Orders, Teams |
| Create installer accounts and hand over credentials | Users |
| Move installers between teams | Teams |

Two consequences shape the whole design:

1. **Desktop-first, mobile-capable.** The primary surface is a wide monitor
   showing dense tables. Mobile is supported (drawer nav, scrollable tables)
   but never the target.
2. **The web app writes, the native app completes.** Allocation and completion
   happen on mobile. The web side finds out asynchronously, which is why
   order completion produces a *persistent* notification rather than a toast.

---

## 2. Stack

| Concern | Choice |
|---|---|
| Build | Vite 8 + `@vitejs/plugin-react` |
| Language | TypeScript (strict), React 19 |
| Routing | TanStack Router, file-based via `@tanstack/router-plugin` with auto code-splitting |
| Data | Convex (`convex/react` — `useQuery` / `useMutation` / `useAction`) |
| Auth | Clerk (`@clerk/react`), bridged to Convex via `ConvexProviderWithClerk` |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite`) |
| Components | `@usi-installer/ui` — local shadcn-style wrappers over Base UI |
| Icons | `lucide-react` |
| Toasts | `sonner` |
| Spreadsheets | `xlsx` (SheetJS), parsed **in the browser** |
| Env validation | `@t3-oss/env-core` + zod via `@usi-installer/env` |

### Workspace dependencies

```
apps/web
 ├── @usi-installer/backend   Convex functions + generated API types
 ├── @usi-installer/ui        shared component library + globals.css
 ├── @usi-installer/env       validated env schema
 └── @usi-installer/config    shared tsconfig / tooling
```

Because `apps/web` imports sibling workspace packages, any deployment must
build from the repo root with the root directory set to `apps/web` and
"include files outside the root directory" enabled.

### Environment

```ts
VITE_CONVEX_URL            // validated URL, rejects the example placeholder
VITE_CLERK_PUBLISHABLE_KEY // non-empty string
```

Both are client-side (`VITE_` prefix) and validated at startup — a missing or
placeholder value fails loudly rather than producing a blank screen.

---

## 3. Architecture

### 3.1 Provider stack

Providers are mounted through the router's `Wrap`, not around
`<RouterProvider>`, so route components can use auth and data hooks freely:

```
RouterProvider
  └── ClerkProvider
        └── ConvexProviderWithClerk
              └── ThemeProvider (forced light)
                    └── <Outlet /> + <Toaster />
```

### 3.2 Route tree

```
__root                        HeadContent, theme, toaster, devtools
├── /                         → redirects to /login
├── /login                    public — Clerk password sign-in
├── /forgot-password          public — 3-step Clerk reset flow
├── /privacy-policy           public
└── /_auth                    pathless layout: auth gate + sidebar shell
      ├── /dashboard
      ├── /import-work-orders
      ├── /manage-orders
      ├── /import-site-data
      ├── /manage-site-data
      ├── /edit-site/$siteId
      ├── /teams
      ├── /teams/$team
      ├── /users
      └── /users/$userId
```

`routeTree.gen.ts` is generated — never hand-edited. Adding a file under
`src/routes/` and running a build regenerates it.

### 3.3 Auth and access control

Three gates, in order:

**1. Signed in?** `_auth/route.tsx` uses Convex's `<Authenticated>` /
`<Unauthenticated>` / `<AuthLoading>`. Unauthenticated visitors are redirected
to `/login`.

**2. Right role?** Being signed in is *not* enough. An installer's Clerk
session is indistinguishable from an admin's, so `AdminGate` reads
`api.users.currentUser` and checks the Convex-side role:

```ts
if (user === null || (user.role !== "admin" && user.role !== "office_staff")) {
  return <RestrictedAccess />;   // "This panel is for office staff only"
}
```

`RestrictedAccess` offers a sign-out link and nothing else — no sidebar, no
routes. This is a **UX gate, not a security boundary**; every Convex function
re-checks the caller's role server-side.

**3. Server-side.** Convex actions and mutations independently verify
`caller.role === "admin"` before doing anything privileged.

### 3.4 Data patterns

Three hooks carry most of the table behaviour:

**`useCursorPagination(pageSize, filterKey)`** — Convex cursors move forward
only, so visited cursors are kept in a stack to support Previous. `filterKey`
must encode every filter argument; when it changes, the stack resets **during
render** (not in an effect) because a cursor belongs to one exact query and
Convex throws `InvalidCursor` the moment its arguments change.

**`useDebouncedValue(value, 300)`** — the search box updates instantly, the
query trails it, so a typed word costs one round trip instead of one per key.

**`useStickyValue(value)`** — a Convex `useQuery` returns `undefined` whenever
its arguments change, which would flash the table back to a skeleton on every
keystroke. This holds the last loaded page on screen while the next loads.

Small datasets (users, teams) skip all of this and filter/paginate in the
browser from one unargumented query.

---

## 4. Visual language

The app deliberately runs **two palettes**.

### 4.1 Auth screens (`/login`, `/forgot-password`)

Ported from the native app so both products feel like one brand.

| Token | Value | Use |
|---|---|---|
| Background | `#edf1f3` | page |
| Surface | `#ffffff` | input cards |
| Primary | `#2f5fe0` | submit buttons |
| Text | `#1a1c1e` | headings, input text |
| Muted | `#6c7278` | subtext, labels |
| Placeholder | `#acb5bb` | input placeholders |
| Link | `#4d81e7` | "Forgot Password ?", "Resend code" |
| Error | `#d32f2f` | inline validation |

Shape: `rounded-[14px]` white cards, `h-[52px]` inputs, `h-[54px]` buttons.
The login page adds a vertical gradient wash behind the wordmark
(`#8AAAFA → #B4D0F6 → #DCE9F4 → #EDF1F3`).

### 4.2 Admin panel (everything behind `/_auth`)

Tailwind's slate/blue scale plus two fixed brand colors.

| Token | Value | Use |
|---|---|---|
| Sidebar | `#0F172A` | nav rail |
| Sidebar border | `#1F2937` | section rules |
| Nav active | `#2563EB` | selected nav item |
| Avatar | `#1E3A8A` | user avatar fallback |
| App background | `#FAFAFA` | main scroll area |
| Card | `white` + `border-slate-200` + `shadow-sm` | every panel |
| Heading | `text-slate-900` | titles |
| Body | `text-slate-700` | table cells |
| Muted | `text-slate-500` | descriptions |
| Empty/loading | `text-slate-400` | placeholder rows |
| Accent | `text-blue-600` | links, actions |

Shape: `rounded-xl` cards, `rounded-lg` controls, `h-[38px]` standard control
height.

### 4.3 Typography

| Role | Spec |
|---|---|
| Page title | `text-xl` mobile / `text-2xl` desktop, bold |
| Card title | `text-base`, bold |
| Body / table cell | `text-sm` |
| Table header | `text-[11px]`, bold, uppercase, `tracking-[0.55px]`, `text-slate-500` |
| Stat value | `text-[50px] / leading-[60px]`, bold, toned |
| Helper text | `text-xs`, `text-slate-400` |

The uppercase micro-tracked table header is the single most recognisable
detail of the design — it appears on every table in the app.

### 4.4 Status pills

One pattern everywhere: `rounded-full px-2.5 py-0.5 text-xs font-medium
ring-1 ring-inset`, with color driven by a lookup table in `src/lib/`.

**Work orders** (`workOrderStatus.ts`)

| Status | Label | Colour |
|---|---|---|
| `completed` | Completed | emerald |
| `allocated` | Allocated | blue |
| `not_allocated` | Not Allocated | slate |
| `pending` | Pending | amber |
| `missing_site` | Missing Site | red |

**Sites** (`siteDetailStatus.ts`)

| Status | Label | Colour |
|---|---|---|
| `completed` | Complete | emerald |
| `incomplete` | Incomplete | orange |
| `missing` | Missing Site | red |

**Users** (`userStatus.ts`)

| Status | Label | Colour | Meaning |
|---|---|---|---|
| `active` | Active | emerald | has signed in at least once |
| `invitation_sent` | Invitation Sent | blue | has a team, never signed in |
| `idle` | Idle | red | no team assigned |

These files are the **single source of truth for status vocabulary** and mirror
what the Convex layer derives. Never hard-code a status label in a component.

### 4.5 Stat tiles

Four-across headline numbers (`sm:grid-cols-2 xl:grid-cols-4`, divided by
vertical rules) with a tinted icon chip and an oversized toned value. Tones:
`blue` / `orange` / `green` / `red`. `undefined` renders as `—`, so tiles never
collapse while loading.

`StatTiles` takes values as props; `WorkOrderStats` and `SiteStats` are
separate components that own their own queries.

---

## 5. Layout shell

```
┌────────────┬──────────────────────────────────────────────┐
│            │  PageHeader   title / description / bell 🔔   │
│  Sidebar   ├──────────────────────────────────────────────┤
│  w-64      │                                              │
│  #0F172A   │  <Outlet />  — px-4 py-6, flex-col gap-4      │
│            │                                              │
│  ┌───────┐ │  ┌────────────────────────────────────────┐  │
│  │ user  │ │  │ stat tiles / cards / tables            │  │
│  └───────┘ │  └────────────────────────────────────────┘  │
└────────────┴──────────────────────────────────────────────┘
```

`html, body, #app { height: 100% }` and `body { overflow: hidden }` pin the app
to the viewport. The sidebar and the main column scroll independently — the
document itself never scrolls.

`<main>` carries `overflow-x-hidden`, which is load-bearing: without it a table
wider than the viewport pushes the *entire page* sideways, dragging the search
box and tabs off-screen. With it, each table scrolls inside its own wrapper.

### 5.1 Sidebar (`admin-sidebar.tsx`)

Groups: *(ungrouped)* Dashboard · **Work Orders** Import / Manage · **Site
Database** Import / Manage · **Teams & Users** Teams / Users.

Header is the inverted wordmark (`brightness-0 invert` — the source asset is
black-on-transparent) over an `ADMIN PANEL` label. Footer is the signed-in user
as a dropdown trigger (avatar, name, role label, chevron) whose only item is
**Log Out**.

Mobile: `fixed inset-y-0 -translate-x-full` drawer with a `bg-black/50`
backdrop, promoted to a static rail at `lg:`. Tapping a nav link or the
backdrop closes it. Open state lives in `SidebarProvider`
(`lib/sidebar-context.tsx`) so `PageHeader`'s hamburger can toggle it.

### 5.2 Page header (`page-header.tsx`)

Title + description on the left (description hidden below `sm`), hamburger
before it below `lg`, notification bell on the right. Every authenticated
screen renders exactly one.

---

## 6. Screens

### 6.1 Dashboard

Quick-action grid (4 cards: Import Work Orders, Manage Work Orders, Import Site
Data, View Order Progress) → `WorkOrderStats` tiles → **Work Orders by Area**
table (train line, imported, allocated, completed, progress % — green at 100%,
blue otherwise) → latest import summary card, or a dashed "No imports yet"
prompt.

### 6.2 Import Work Orders / Import Site Data

Both follow the same shape:

```
ExcelDropzone  →  parse in browser  →  preview table  →  Confirm Import
                        ↓ failure
                  UploadErrorDialog
```

The parse happens **client-side** with SheetJS. Nothing reaches Convex until
the operator confirms, so a wrong file costs nothing.

**Wrong-file detection.** `detectWorkbookKind()` inspects headers and, if the
operator uploaded the *other* file, the error dialog says so by name and offers
a link to the correct screen — rather than a generic parse failure.

**Site-data gate.** Work orders match sites by panel ID, so importing them into
an empty Site Database would flag every row as a missing site.
`api.sites.hasSites` guards this with `SiteDataRequiredDialog`.

**Batched writes.** A Convex mutation is one transaction with a bounded write
budget; a full Site Database is ~800 rows. `UPLOAD_BATCH_SIZE = 200` chunks the
upload and the button reports live progress (`Importing… 400 / 812`).

**Preview accuracy.** The work-order preview resolves site matches through
`api.sites.resolveByPanelSplits` — the *same* server-side lookup the import
itself uses — so the preview can never disagree with what gets written.

Work-order imports are transactional across batches: `createImport` →
`addWorkOrders` ×N → `finalizeImport`, with `deleteImport` as rollback.

### 6.3 Manage Orders

Server-paginated work orders. Toolbar: title, typeahead search, Duration
filter. Status tabs (All / Allocated / Not Allocated / Completed / Missing
Sites) with live counts from a separate `counts` query. Cursor pagination keyed
on `status|search|since|until`.

### 6.4 Manage Site Data → Edit Site

Filter bar (search, Location, Details Status, Duration) → status tabs →
paginated table → row action into `/edit-site/$siteId`.

**Edit Site** is one card divided by rules:

- **Site Image** — `SiteImageField`. Dropzone until the first photo, then a
  grid: first image as a `col-span-2 row-span-2` cover with pencil (replace)
  and hover trash, remaining photos as thumbnails, a dashed `+` tile while
  there's room, and a `+N More` overlay once the grid is full. 10 MB / image
  cap enforced client-side.
- **Installation Notes** — free textarea.
- **Equipment Required** — `EquipmentField` chip editor.
- **Panel Quantity / Size**.

### 6.5 Teams

**Index** — stat tiles, search + Order Status filter, table (Team, Allocated,
Completed, Pending, Members, Actions) with expandable rows revealing member
sub-tables. "Add Team" opens `AddTeamDialog`, prefilled with the next name in
the sequence (Team 5 → Team 6).

Teams are rows in a `teams` table, referenced **by name** rather than by id:
`users.team` and `workorders.assigned_team` store the string. That is what
lets the native app keep comparing and displaying them as plain strings, and
it is why renaming is not offered — a rename would have to cascade across
every user and work order.

**"Delete" is a soft delete.** The row's `archived` flag is set rather than the
row being removed, because work orders reference a team by name and completed
installs have to keep reading correctly. The team disappears from the table
and from every picker; a team that still has members is refused, with the
count named in the error.

**Detail** (`/teams/$team`) — stat tiles, then four tabs: Completed Sites /
Allocated Orders / Pending Orders (each a paginated order table) and **Team
Members** (name, email, Reassign dropdown, Remove). "Add Member" opens
`AddMembersDialog`, a multi-select picker that excludes current members **and
admin accounts**.

### 6.6 Users

Stat tiles (Total / Active Installers / Idle) → "Invite New Installers" CTA
card → filtered table (User, Username/Email, Current Team, Status, Actions).
Every row's action is **View Details** regardless of status.

**Invite flow** — `InviteInstallerDialog` (Full Name, Email, Primary Team) →
creates a Clerk account server-side with a generated password → emails
credentials → `InviteSentDialog` confirms with a checkmark badge and the
Name / Work Email / Primary Team summary.

**User detail** (`/users/$userId`) — Account Information (Full Name, Work
Email, Current Team) plus two side cards:

- **Credential Actions** → *Send Updated Credentials* generates a **new**
  password, sets it on Clerk, emails it, and shows it once.
- **Danger Zone** → delete, behind a confirmation dialog.

> **Passwords are never stored in Convex.** There is no password field on the
> user record and none on this form. A password exists only in the moment it is
> generated, set on Clerk, emailed, and displayed once. "Resend" is therefore
> impossible by construction — the only recovery path is a reset.

### 6.7 Login / Forgot password

**Login** — email + password with a show/hide toggle, "Remember me"
(localStorage-backed email prefill), and a link to the reset flow. Handles
Clerk's `needs_client_trust` state by switching to an emailed device-code step.

**Forgot password** — three local steps mirroring the native app 1:1:

```
email  →  signIn.create({ identifier })
          signIn.resetPasswordEmailCode.sendCode()
code   →  signIn.resetPasswordEmailCode.verifyCode({ code })
password → signIn.resetPasswordEmailCode.submitPassword({
             password, signOutOfOtherSessions: true })
           signIn.finalize()  → toast + /dashboard
```

Step 1 **always** advances to the code step whether or not the account exists —
no account enumeration. The back button is step-aware (code → email → login),
not the browser's.

### 6.8 404

`defaultNotFoundComponent` renders `NotFoundPage`: wordmark, `404` in brand
navy, explanatory line, and a button to `/` (which resolves to dashboard or
login depending on session).

---

## 7. Shared components

### Tables

Composed rather than abstracted — `Table` / `TableHeader` / `TableRow` /
`TableHead` / `TableCell` from `@usi-installer/ui`, wrapped per screen.

Every data table follows the same recipe:

```tsx
<Table className="min-w-[880px] table-fixed">
```

- `table-fixed` + explicit `w-[n%]` per column (summing to 100) so no single
  long value can stretch a column.
- `min-w-[…]` so narrow viewports scroll sideways instead of crushing columns
  into illegibility. The `Table` wrapper supplies `overflow-x-auto`.

**Nothing is ellipsised.** Cell text wraps and grows its row rather than being
clipped, so every value is readable without hovering, clicking or widening a
column. The two wide import tables carry long free text (Location, Panel Name,
Comments, Install Notes) and are exactly the case that made truncation
unacceptable. `TableCell` ships `whitespace-nowrap`, so cells render their
value through `CellText` (`components/cell-text.tsx`), which overrides that and
supplies the `—` fallback in one place.

| Table | Columns | Min width |
|---|---|---|
| Work orders / team orders / import preview | 17 | `2200px` |
| Manage Site Data | 11 | `1700px` |
| Site import preview | 9 | `1500px` |
| Teams index | 6 | `760px` |
| Users | 5 | `720px` |
| Add-members dialog | 4 | `600px` |
| Team members | 3 | `520px` |
| Teams index member sub-table | 2 | `420px` |

**The two import tables show the source sheet in full.** Work orders and sites
each render every column their spreadsheet carries, in the sheet's own order
and under the sheet's own headings (`CONTRACT`, `SIZE (W x H)`, `GPS
Co-ordinates`, …), so an operator can reconcile the table against the file
they uploaded line by line. That is why their min-widths are far larger than
everything else — those tables are meant to be scrolled.

The work-order columns, header row and cells live in `work-order-table.tsx` as
`WORK_ORDER_COLUMNS` / `WorkOrderTableHead` / `WorkOrderRowCells` and are
imported by the team detail tabs, rather than duplicated — the two drifted
apart once already.

`TableHead` intentionally carries **no fixed height** — each call site supplies
`py-5` / `py-3`. A height on the shared component fought that padding and
clipped the uppercase labels.

### Toolbars and filters

- **`TableToolbar`** — card title + search + optional action slot. Search is
  `w-full` on mobile, `sm:w-80` above, and the row wraps so trailing controls
  drop to a second line instead of overflowing.
- **`SearchInput`** — typeahead over a `SearchOption[]` (`{ value, kind }`)
  filtered in the browser, prefix matches ranked first, max 8 suggestions,
  keyboard navigable, clearable.
- **`FilterSelect`** — floating-label select, `w-full` on mobile / `sm:w-48`,
  popup capped and scrollable, `alignItemWithTrigger={false}` so long lists
  don't run off-screen.
- **`DurationSelect`** — presets (1 / 7 / 30 / 90 days, All time) plus a custom
  range dialog.
- **`TablePagination`** — "Showing X to Y of Z" plus prev/next.

### Dialogs

`CredentialsDialog` (copyable email/password), `InviteInstallerDialog`,
`InviteSentDialog`, `AddMembersDialog`, `AddSiteDialog`, `DeleteUserDialog`,
`UploadErrorDialog`, `SiteDataRequiredDialog`.

Shared `DialogContent` is `w-[calc(100%-2rem)] max-w-lg` — the calc keeps a
gutter on phones instead of letting dialogs touch the edges.

### Tabs

`variant="line"`, `w-full` (so the bottom rule spans the whole card, not just
the labels), `gap-10`, `overflow-x-auto overflow-y-hidden`.

The `overflow-y-hidden` is required: setting `overflow-x` forces `overflow-y`
to compute as `auto`, and the active-tab underline sits slightly outside its
box — without it you get a spurious vertical scrollbar.

---

## 8. Feedback

### Toasts (`sonner`)

Bottom-right. Styled to match the card language rather than sonner's defaults:
white, `rounded-xl`, `border-slate-200`, `shadow-lg`, with a **colored left
accent bar** (`border-l-4`) instead of a fully tinted toast — green / red /
amber / blue.

Every mutation-triggering action reports outcome:

| Screen | Actions |
|---|---|
| Users | invite validation, save account, delete, credential errors |
| Teams | add members, reassign, remove |
| Site Data | import, save details, add image, remove image |
| Work Orders | import |

Errors surface `error.message` when available and fall back to a plain-language
sentence — never a raw stack or status code.

### Notifications (`notification-bell.tsx`)

Toasts can't cover work that happens while nobody has the tab open. Order
completion originates in the **native app**, so it writes a row to a
`notifications` table instead:

```ts
notifications: {
  type: "order_completed",
  title, body,          // "Contract — Advertiser — Panel — Location"
  work_order_id,
  read: boolean,
}
```

The bell shows an unread badge (`9+` past nine). The dropdown lists the 50 most
recent, newest first, with relative timestamps ("2h ago", falling back to a
short date past a week). Unread rows are tinted and dotted. **Clicking a row
marks it read**; a "Mark all as read" link appears in the header while anything
is unread.

The inbox is deliberately **shared, not per-user** — read state is global,
which is right for a small office team where any staffer acting on a completion
resolves it for everyone.

---

## 9. Responsive strategy

Breakpoints: `sm` 640 · `lg` 1024 · `xl` 1280.

| Element | Mobile | Desktop |
|---|---|---|
| Sidebar | drawer + backdrop | static `w-64` rail |
| Page header | hamburger, no description | full title + description |
| Stat tiles | 1 → 2 col | 4 col at `xl` |
| Tables | horizontal scroll at min-width | full width |
| Toolbars | stacked, full-width controls | inline row |
| Dialogs | `calc(100%-2rem)` | `max-w-lg` |
| Site image grid | stacked | cover + thumbnail grid |

Scrollbars are restyled globally to 6px with slate thumbs — and inverted inside
`aside`, since the sidebar is dark.

---

## 10. Conventions

**Theme.** `forcedTheme="light"`. The admin palette is written as literal
colors rather than theme tokens, so a dark mode would produce dark dialogs and
inputs against light cards. `forcedTheme` also ignores any stale `"dark"` left
in localStorage.

**Comments explain *why*.** The codebase comments non-obvious decisions
(cursor-stack resets, `cellDates` timezone drift, enumeration safety) and skips
narrating what the code already says.

**Status vocabulary lives in `src/lib/`.** Labels and pill colors are never
inlined in components.

**Derived state is server-side.** `status_key` and `detail_key` are written on
every mutation so status tabs filter through an index rather than after reading
a page.

**Generated files.** `routeTree.gen.ts` and `convex/_generated/` are outputs —
never edited.

---

## 11. File map

```
apps/web/
├── index.html
├── vite.config.ts              port 3001, tsconfigPaths, router plugin
├── public/                     favicons derived from the iOS app icon
└── src/
    ├── main.tsx                router + providers + notFound
    ├── index.css               viewport pinning, scrollbar styling
    ├── routeTree.gen.ts        generated
    ├── assets/
    ├── routes/                 file-based routes (see §3.2)
    ├── components/             31 app components (see §7)
    ├── hooks/
    │   ├── use-cursor-pagination.ts
    │   └── use-debounced-value.ts
    └── lib/
        ├── excelParsing.ts     shared SheetJS helpers
        ├── parseWorkOrder.ts   Installation Schedule → rows
        ├── parseSiteDatabase.ts Go Site Database → rows
        ├── chunk.ts            UPLOAD_BATCH_SIZE = 200
        ├── sidebar-context.tsx mobile drawer state
        ├── teams.ts            slug helpers + next-name sequence
        ├── userStatus.ts       ─┐
        ├── workOrderStatus.ts   ├ status vocabulary
        └── siteDetailStatus.ts ─┘
```

---

## 12. Convex surface consumed

| Module | Used for |
|---|---|
| `users` | `currentUser`, `list`, `get`, `overview`, `inviteInstaller`, `updateAccount`, `resendCredentials`, `removeUser` |
| `teams` | `overview`, `allMembers`, `orders`, `setMemberTeam`, `removeMember` |
| `workorders` | `list`, `counts`, `searchOptions`, `dashboardStats`, `byArea` |
| `sites` | `list`, `counts`, `stats`, `areas`, `getSite`, `update`, `searchOptions`, `hasSites`, `resolveByPanelSplits`, `upsertSites`, `recordSiteImport`, `latestImport`, `generateUploadUrl`, `addSiteImage`, `removeSiteImage` |
| `imports` | `createImport`, `addWorkOrders`, `finalizeImport`, `deleteImport`, `latest` |
| `notifications` | `list`, `markRead`, `markAllRead` |

Queries are read directly in components via `useQuery`; there is no client-side
store or cache layer, because Convex subscriptions already keep every mounted
query live.

---

## 13. Deployment

Vite SPA. Vercel settings that must hold:

| Setting | Value |
|---|---|
| Framework preset | Vite |
| Root directory | `apps/web` |
| Output directory | `dist` |
| Include files outside root | **enabled** (workspace deps) |
| Env vars | `VITE_CONVEX_URL`, `VITE_CLERK_PUBLISHABLE_KEY` |

Because it is an SPA, unknown paths must fall through to `index.html` — the
router then renders the 404 page. Serving a real 404 at the CDN layer would
break deep links.
