# Original Client SRS (Historical — Superseded)

> **Status: historical reference only. Do not build against this document.**
>
> This is the first Software Requirements Specification the client sent,
> before this project's current architecture existed. It describes a
> **Bubble.io + Cloudflare** implementation. This codebase uses **Convex +
> React (web) + Expo/React Native (native)** instead — Bubble and Cloudflare
> are not used anywhere and never will be. A significant amount has changed
> since this was written (see "Known deviations" below).
>
> Keep this file only for: original feature intent, terminology, the
> field/screen inventory the client asked for, and the wireframe screen map.
> When it conflicts with actual behavior in `packages/backend/convex/`,
> `apps/web/`, or `apps/native/`, or with anything in `docs/superpowers/`,
> **the code and the superpowers specs win.**
>
> Source: `Western_USI_Installer_Workflow_App_SRS_with_wireframes.docx`
> (authored 2026-08-03, last modified by Mitch Batterham). Converted to
> Markdown via pandoc; content below is otherwise unedited from the original
> except for minor formatting cleanup (bullets, headings). Appendices B–D
> ("Excel Database", "Example Work order table for import", "System
> Architecture") are listed in the original's table of contents but were
> never filled in — the source document has no content for them.

## Known deviations from this SRS (as of this repo)

- **No Bubble.** The app is a pnpm/Turborepo monorepo: Convex backend
  (`packages/backend/convex/`), a Vite/TanStack Router web app for office
  staff (`apps/web/`), and an Expo Router React Native app for installers
  (`apps/native/`).
- **No Cloudflare.** File storage (site reference photos, future completion
  photos) is Convex's built-in file storage (`ctx.storage`), not Cloudflare.
- **Auth is Clerk**, not a Bubble login — email/password, no self sign-up,
  users created in the Clerk dashboard and mirrored into Convex via a
  webhook. See `docs/superpowers/specs/2026-08-06-clerk-user-sync-design.md`.
- **Work orders have no read/allocate/complete flow implemented yet.**
  Excel import → `upsertWorkOrders` exists; the Browse/Allocate/Equipment
  Needed/Complete Installs screens this SRS describes (§3.6–§3.13) do not
  exist yet in `apps/native/`.
- **No completion-email flow, no team allocation UI, no Cloudflare
  thumbnails** — none of §3.12–§3.13 is built.
- Field/column names drifted in places (e.g. this SRS's "Contract Number" ↔
  current schema's `contracted_panel_id`; "Train Line" ↔ `line`). Treat this
  SRS's field names as *intent*, not as the literal schema — see
  `packages/backend/convex/schema.ts` for what's actually there.
- Ask the user before treating anything else in this file as current truth —
  this list isn't guaranteed exhaustive.

---

# Software Requirements Specification

Includes wireframe appendix and screen map.

## Table of Contents

1. Introduction
2. Overall Description
3. System Features and Functional Requirements
4. Non-Functional Requirements
5. External Interface Requirements
6. Other Requirements
7. Screen Specification
8. Navigation Flow
9. Developer Notes
10. Suggested Bubble Build Notes
- Appendix A. Wireframes
- Appendix B. Excel Database *(not filled in — see note above)*
- Appendix C. Example Work order table for import *(not filled in)*
- Appendix D. System Architecture *(not filled in)*

# 1. Introduction

## 1.1 Purpose

This Software Requirements Specification (SRS) defines the requirements for the Western USI Installer Workflow App, a workflow management system for advertising installation crews. It will be used by developers and bidders to understand the scope, features, and constraints of the project and to prepare accurate proposals and timelines.

## 1.2 Scope

The Western USI Installer Workflow App will:

- Store and manage a master Site Database of advertising sites.
- Store equipment information as part of the Main Database spreadsheet, using a comma-separated list where multiple equipment items are required.
- Import daily work orders from Excel into a Bubble database.
- Allow installer teams to allocate installs based on the materials they have physically loaded into their vehicles.
- Provide a mobile-friendly installer app to browse sites, allocate installs, view equipment needed, reverse install order, and complete installs with photographic evidence.
- Automatically notify office staff upon install completion via email with attached photos.
- Use Bubble as the core database and app layer, and Cloudflare for image storage.

## 1.3 Executive Summary

The Western USI Installer Workflow App streamlines advertising installation workflows by replacing manual processes with a mobile application. Objectives include reducing administration, allowing teams to self-manage work, providing all installation information in one app, improving communication through synchronisation and automatic emails, minimising phone calls and supporting future growth.

## 1.4 Definitions, Acronyms, and Abbreviations

- **Installer:** A person or team responsible for on-site installation of advertising materials.
- **Site:** A physical advertising location, such as a train station panel.
- **Work Order / Install:** A specific install to be performed at a site, imported from a daily Excel file.
- **Status:** The workflow state of a work order, including Imported, Material In Stock / Loaded, and Completed.
- **Train Line:** A logical grouping of sites and work orders by railway line.
- **Team:** A working group of installers, identified as Team 1 through Team 5.
- **Team Context:** The selected team that remains active while the user moves through Allocate Installs, Equipment Needed, and Complete Installs.
- **Equipment Required:** A comma-separated list of equipment items required for a site or install, maintained in the Main Database spreadsheet and imported into Bubble.
- **Bubble:** Bubble.io no-code platform used for database and application logic. *(Not used in this codebase — see deviations note above.)*
- **Cloudflare:** CDN and file storage used for reference and completion photos. *(Not used in this codebase — see deviations note above.)*

# 2. Overall Description

## 2.1 Product Perspective

The app is a workflow tool for installer teams and office staff, integrating daily Excel work order imports and completion email notifications.

## 2.2 Product Functions

At a high level, the system will maintain site records, import daily work orders, allow team-based allocation, provide equipment lists, support completion workflows, and synchronise data across devices.

## 2.3 User Classes and Characteristics

Installers use mobile devices in the field. Office staff maintain site data and imports. Administrators manage app configuration and integrations.

## 2.4 User Roles and Permissions

- **Installer:** view sites, browse work orders, allocate installs, view equipment, complete installs, upload photos, force sync. Cannot edit site database or import work orders.
- **Office Staff:** import Excel work orders, maintain site database, update notes/photos, view all work orders.
- **Administrator:** full access including users, configuration and integrations.

## 2.5 Operating Environment

Bubble-hosted app, Cloudflare image storage, mobile and browser access, with intermittent connectivity in the field.

## 2.6 Design and Implementation Constraints

Bubble implementation, Cloudflare storage, Excel imports, support for at least five teams, and future extensibility.

## 2.7 Assumptions and Dependencies

Office data maintenance, consistent Excel format, camera-capable devices, and available email infrastructure.

# 3. System Features and Functional Requirements

## 3.1 Site Database

- FR-SD-1: Store approximately 800 site records in Bubble with ability to scale.
- FR-SD-2: Include Panel ID, Location, GPS Latitude / Longitude, Train Line, Panel Name, Installation Notes, Equipment Required, Google Maps Location link, Reference Photo 1, and Reference Photo 2.
- FR-SD-3: Store reference photos on Cloudflare and keep URLs or IDs in Bubble.
- FR-SD-4: Provide a scrollable site-detail interface in the installer app.
- FR-SD-5: Allow office staff to update site records and photos without app front-end changes.

## 3.2 Work Orders and Import

- FR-WO-1: Allow office staff to import daily work orders via drag-and-drop Excel.
- FR-WO-2: Parse the file and create or update Work Order records in Bubble.
- FR-WO-3: Include Contract Number, Panel ID, Advertiser, Existing Advertiser, Train Line, Material Size, and Comments.
- FR-WO-4: Import a typical file in under one minute under normal conditions.
- FR-WO-5: Imported work orders appear automatically in the installer app.
- FR-WO-6: If a work order has no matching site, show "Work Order missing information in Database" and still transfer it to the app.
- FR-WO-7: Red rows in the Excel sheet shall appear red in work order tables.

## 3.3 Install Status Workflow

- FR-JS-1: Status values shall be Imported, Material In Stock / Loaded, and Completed.
- FR-JS-2: Status changes shall occur through user actions and workflows.
- FR-JS-3: Completed installs remain historically available but disappear from active views.

## 3.4 Installer App — Home Screen

- FR-HS-1: Present two main buttons: Site Database and Current Work Orders.
- FR-HS-2: Provide a manual Force Sync button.

## 3.5 Site Database — Installer View

- FR-SDV-1: Allow browsing alphabetically and searching by Location or Panel ID.
- FR-SDV-2: Show Site Photos, Panel Name, Installation Notes, Google Maps, and Navigate.
- FR-SDV-3: Use a scrollable mobile-friendly layout.
- FR-SDV-4: Provide a Back button.

## 3.6 Current Work Orders — Overview

- FR-CWO-1: Show work grouped by Train Line with counts and progress.
- FR-CWO-2: Provide Browse Work Orders, Allocate Installs, Equipment Needed, and Complete Installs.

## 3.7 Browse Work Orders

- FR-BWO-1: Show imported work grouped by Train Line with progress counters.
- FR-BWO-2: Selecting a Train Line shows a table with Location, Advertiser, Panel ID, and Panel Name.
- FR-BWO-3: Read-only view.
- FR-BWO-4: Completed work orders do not appear as rows.

## 3.8 Allocate Installs

- FR-AI-1: Provide filters for Train Line, Advertiser, and Show All.
- FR-AI-2: Each row shows Location, Panel ID, Advertiser, and Size.
- FR-AI-3: Require a team selection before allocation.
- FR-AI-4: Allocate selected work orders to the selected team, visually mark allocated rows, prevent cross-team allocation, and allow undo/remove.
- FR-AI-5: Allocation represents the physical installs loaded by the team.
- FR-AI-6: Team selector shall support Team 1 to Team 5.
- FR-AI-7: Completed work orders shall not appear.

## 3.9 Equipment Needed

- FR-EN-1: Generate a consolidated equipment list for the current team's allocated installs.
- FR-EN-2: Show quantities and names where applicable.

## 3.10 Complete Installs

- FR-CI-1: Display only allocated work orders for the selected team.
- FR-CI-2: Show summary counters by Train Line.
- FR-CI-3: Provide Show All Installs, Filter by Train Line, and Reverse Order.
- FR-CI-4: Keep team context active across screens.
- FR-CI-5: Completed work orders shall not appear as active rows.
- FR-CI-6: Default ordering for Train Line filtering shall be furthest-from-East-Perth to closest; Reverse Order shall invert this.

## 3.11 Install Details

- FR-ID-1: Show Site Photos, Panel Name, Existing Advertiser, Advertiser, Comments, Equipment Required, Installation Notes, Google Maps, and Navigate.
- FR-ID-2: Include a Complete Install button.
- FR-ID-3: Red imported rows shall appear red and display "Priority Pulldown".

## 3.12 Completing an Install

- FR-CI-1: Open the device camera.
- FR-CI-2: Show Retake Photo and Submit Photo after capture.
- FR-CI-3: Include an optional Notes field.
- FR-CI-4: On submit, upload the photo to Cloudflare, update status to Completed, send email, refresh counters, and remove the work order from active tables.

*(Note: FR-CI-1..4 numbering collides with §3.10's Complete Installs
requirements — duplicated in the original document, not a conversion
error.)*

## 3.13 Completion Email

- FR-CE-1: Send an email for each completed work order.
- FR-CE-2: Subject format shall be Contract Number — Advertiser — Panel ID — Location — Completed.
- FR-CE-3: Body shall include Location, Advertiser, Panel ID, Contract Number, and Notes.
- FR-CE-4: Attach the high-resolution completion photo.

## 3.14 Photo Storage

- FR-PS-1: Reference photos stored on Cloudflare and linked from Bubble.
- FR-PS-2: Completion photos uploaded to Cloudflare.
- FR-PS-3: Each image shall have a thumbnail and high-resolution original.
- FR-PS-4: Thumbnails shall provide near-instant loading.

## 3.15 Synchronisation

- FR-SYNC-1: Automatically synchronise site data, work orders, allocations, and statuses across devices.
- FR-SYNC-2: Allocation changes shall be reflected across all devices.
- FR-SYNC-3: Home Screen shall include Force Sync.
- FR-SYNC-4: Force Sync shall prompt: "Are you sure you want to force synchronisation?"
- FR-SYNC-5: On confirmation, refresh relevant Bubble data.

# 4. Non-Functional Requirements

## 4.1 Performance

- NFR-P-1: Near-instant loading of site reference photos under typical mobile network conditions.
- NFR-P-2: Excel import completed in under one minute for typical files.
- NFR-P-3: Lists and search respond within a few seconds.

## 4.2 Usability

- NFR-U-1: Clean UI designed for quick use while travelling.
- NFR-U-2: Few button presses for common tasks.
- NFR-U-3: Mobile-friendly with large touch targets.

## 4.3 Reliability and Availability

- NFR-R-1: Handle intermittent connectivity gracefully.
- NFR-R-2: Maintain integrity with concurrent teams and avoid allocation conflicts.

## 4.4 Security

- NFR-S-1: Only authenticated users shall access the app and data.
- NFR-S-2: Installers shall only modify their allocated installs.
- NFR-S-3: Data and photos shall be transmitted over HTTPS and stored securely.

## 4.5 Maintainability and Extensibility

- NFR-M-1: Additional features such as reporting, route optimisation, QA checks, and inventory tracking shall be addable without major redesign.
- NFR-M-2: Site records and comma-separated equipment fields shall be structured for maintainability.
- NFR-M-3: Email recipients and Train Line definitions should be configurable without code changes.

# 5. External Interface Requirements

## 5.1 User Interfaces

Mobile-friendly Bubble front end for installers and back-office interfaces for staff.

## 5.2 Hardware Interfaces

Smartphones/tablets with camera and internet access, plus office computers for Excel import.

## 5.3 Software Interfaces

Bubble, Cloudflare, and an email service.

## 5.4 Communications Interfaces

HTTPS and email protocols/API.

# 6. Other Requirements

## 6.1 Deployment and Environment

Hosted on Bubble, with configuration suitable for approximately five installer teams and a growing site database.

## 6.2 Acceptance Criteria

The system is complete when site and work order databases, import, allocation, completion, email, and synchronisation all function as specified and the UI is tested on common mobile devices.

## 6.3 Error Handling

| Condition | Behavior |
|---|---|
| A Site cannot be matched | Import the work order. Display "Work Order missing information in Database." |
| Cloudflare upload fails | Notify the installer. Allow retry. Do not mark the work order Complete until upload succeeds. |
| Email fails | Mark work order Complete. Queue email for retry. Log failure for office staff. |
| Synchronisation fails | Inform the user. Keep local changes. Retry on next synchronisation. |
| Duplicate work orders are imported | Update the existing work order rather than creating a duplicate. |

# 7. Screen Specification

## 7.1 Common Navigation

### Screen CWO-1 / SDB-1: Home Screen
Main landing page with Site Database, Current Work Orders, and Force Sync.

## 7.2 Site Database Function

### Screen SDB-2: Site Database List
Search Location, Search Panel ID, alphabetical list, Back.

### Screen SDB-3: Search Screen
Keyboard-driven search state for Location or Panel ID.

### Screen SDB-4: Site List View
List of sites for a selected Location.

### Screen SDB-5: Site Summary and Reference Photo 1
Site details and first Cloudflare reference photo.

### Screen SDB-6: Reference Photo 2 / Details View
Additional details, notes, and equipment.

## 7.3 Current Work Orders Function

### Screen CWO-2: Current Work Orders Hub
Browse Work Orders, Allocate Installs, Equipment Needed, Complete Installs.

### Screen BWO-1: Browse Work Orders Summary

### Screen BWO-2: Browse Work Orders Table

### Screen AI-1: Allocate Installs Overview

### Screen AI-2: Allocate Installs Table

### Screen EN-1: Equipment Needed

### Screen CI-1: Complete Installs Summary

### Screen CI-2: Complete Installs Table

### Screen CI-3: Install Details

### Screen CI-4: Complete Install

# 8. Navigation Flow

1. Home Screen
2. Site Database List
3. Site List View
4. Site Summary and Reference Photo 1
5. Reference Photo 2 / Details View
6. Current Work Orders Hub
7. Browse Work Orders Summary
8. Browse Work Orders Table
9. Allocate Installs Overview
10. Allocate Installs Table
11. Equipment Needed
12. Complete Installs Summary
13. Complete Installs Table
14. Install Details
15. Complete Install

# 9. Developer Notes

- Use the final SRS terms consistently: Location, Panel ID, Panel Name, Existing Advertiser, Comments, Contract Number, Installation Notes, and Equipment Required.
- Keep the interface mobile-first with large tap targets.
- Prioritise fast loading of tables and photos.
- Keep search and browsing responsive even with a growing work order list.
- Use the comma-separated equipment field from the Main Database to drive the Equipment Needed screen.
- Completed Work Orders should not appear in active tables, but progress counts should include them.
- Work Order tables on all screens shall use text large enough to be easily read.
- If table content does not fit on screen, the table shall be scrollable.

# 10. Suggested Bubble Build Notes

*(Not applicable to this codebase — kept verbatim for historical record only.)*

- Filter work orders in real time where possible.
- Keep list views alphabetical or line-based depending on the screen.
- Use lightweight image viewing for site photos.
- Allow future expansion without redesign.
- Make completed work disappear from active views immediately after submission.

# Appendix A. Wireframes

The original uploaded wireframe document is included as reference material for screen layout, labels, and navigation behavior. It covers the site database function, browse work orders function, allocate installs function, equipment needed function, and complete installs function.

Included source wireframes:

- Site Database Function.
- Browse Work Orders Function.
- Allocate Installs Function.
- Equipment Needed Function.
- Complete Installs Function.

*(No image files were embedded in the source .docx — the wireframes referenced here were not included as actual images/attachments in what the client sent.)*

# Appendix B. Excel Database

*Not filled in — no content in the original document beyond the table-of-contents entry.*

# Appendix C. Example Work order table for import

*Not filled in — no content in the original document beyond the table-of-contents entry.*

# Appendix D. System Architecture

*Not filled in — no content in the original document beyond the table-of-contents entry.*
