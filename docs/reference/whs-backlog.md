# WHS backlog

What is still left to build or prove for the WHS and Compliance Register. Read with
`whs-framework.md` (what to build) and `whs-decisions.md` (choices made where the framework
is silent).

**How this file is kept:** remove an item in the same change that finishes it. Add new items
as they come up. Nothing here is done; if it is done, it is not here.

---

## Worker accreditations

### Prove what is built
- [ ] Upload through the app's own buttons (camera, photo library, PDF picker) on a device or
  simulator. The same upload and submit calls were tested from the command line on 12 Oct.
- [ ] Email link button opens the app (needs the page below live). Emails themselves were sent
  successfully on 12 Oct.
- [ ] A live morning reminder run, and an escalation once a management user exists. Both were
  checked as dry runs only, so no reminder emails went to the admin list during testing.
- [ ] Email link page live: `app.westernusi.com.au` DNS, web app redeployed with
  `/open/accreditation/$typeId`, route list regenerated, `WEB_APP_URL` set on production.
- [ ] PDF picking on a rebuilt iOS app.
- [ ] Android run-through.

### Build (framework)
- [ ] Subcontractor panel: the contact uploads evidence for their workers (§10).

### Needs permission or a decision first
- [ ] Subcontractor editing its own required list (§10 says "view"): permission needed.

### Deferred
- [ ] Mobile push notifications (decision N8).
- [ ] One combined reminder email when several accreditations are due together.

## Admin dashboard (Safety section)
Real data now: dashboard, register, accreditations (review, verify, add evidence, matrix,
verification queue), safety documents (details, new version, reminders, on-site changes, add),
first-aid kits (details, corrective action, assign, add), insurance (register, details, renew,
verify, add), vehicles (register, details, service, availability, add), subcontractor profile
(overview, business records with the signed agreement, workers, WHS requirements, SWMS
acknowledgements, history), medical centres list.
- [ ] Reports & Exports: install `jspdf` and `jspdf-autotable` in apps/web, then download each of
  the ten reports as PDF and Excel once to check them (AD27).
- [ ] Subcontractor portal (separate Figma flow, a separate web app), not started (AD11). The
  Management dashboard is built (AD43).
- [ ] Production: set `WEB_APP_URL` to `https://admin.westernusi.com.au` when deploying (AD45):
  `npx convex env set WEB_APP_URL https://admin.westernusi.com.au --prod`.
- [ ] Management dashboard: sign in once as a real management user and as an admin with both
  dashboards, and click through (built and tested on the backend only, 20 Oct).

## Other registers (framework §4, §13)
- [ ] **Height and safety equipment** (client request, Mitch, 20 Oct). WAITING for Mitch's Excel sheet
  before building. Outside the framework: §14 keeps "detailed plant registers" out of scope unless
  separately approved, so ask the user's explicit permission to build it, then log it in
  `whs-decisions.md`. What was agreed so far (user, 20 Oct):
  - A new admin section holding the equipment list, imported from Excel like Medical Centres
    (a newer sheet adds only new rows, no duplicates). The list is not shown in the installer app.
  - The admin assigns periodic checks of an item to a worker; each assigned check shows on that
    worker's phone as a short checklist, like the first-aid kit inspection (kits are the pattern).
  - To ask Mitch: what is on the sheet (a sample); harnesses and lanyards only or all equipment; how
    often each type is checked; whether anything beyond a pass/fail checklist is needed.
- [ ] On-site changes in the app's Needs Attention for the people a SWMS is for (D12). Possible now
  that documents say who they are for (AD33).
- [ ] Documents for a client or work type: link them to jobs when work orders are connected (§13
  stage 4); until then "Client or work type" is text shown to workers (AD33).
- [ ] Prove: drawing a signature, acknowledging and signing a change on a device.
- [ ] Email link page `/open/document/$documentId` live (same steps as the accreditation page).
- [ ] Medical centres: load Mitch's sheet on production too (only dev has it), through Medical
  Centres → Import.
- [ ] Medical centres: two practices are marked "(historical listing)" in Mitch's sheet (Centrepoint,
  Midland; Mount Lawley) and several hours are "Not confirmed". Ask Mitch whether to keep them.
- [ ] Prove medical centres on a device: location prompt, drive times, Call and Navigate.
- [ ] Insurance: subcontractors upload their own certificates in the subcontractor panel (not built);
  the admin's verify screen for those is ready.
- [ ] Vehicle first-aid kits: vehicles are shared (VH3), so decide who a vehicle kit is assigned to for
  inspections (kits are assigned to one person, K4).
- [ ] §13 stage 4 "warn when an assigned vehicle is non-compliant": vehicles are shared, so decide later
  whether the office picks a vehicle per job.
- [ ] Inspection frequency: replace the 3-month default with Mitch's answer (K2, asked 13 Oct).
- [ ] Prove kits on a device: inspection with a photo, resolving an issue.
- [ ] Remove the dev test data before go-live: sample documents, kits, and everything `whsDemo:seed` and
  `whsDemo:seedAssets` added (marked "Dummy data for testing"). Reminders are off on dev
  (`WHS_REMINDERS_OFF=true`); leave it unset on production.
- [ ] Job-order integration: warnings for expired credentials, insurance, vehicles (§13 stage 4).

## Access and roles
- [ ] Per-person access scoping (work orders / WHS / both, applicable items), deferred (A3).

## Known issues
- [ ] Prove on a device: the new calendar on date fields, and the logo after its rename (14 Oct).
