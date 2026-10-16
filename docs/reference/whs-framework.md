# WHS and Compliance Register Framework (Active Spec)

> **Status: active. This is the current client-supplied framework for the WHS
> project and is the document to build against.**
>
> Source: `WHS Framework.docx` — "Western USI Installer Workflow App:
> InstallFlow WHS and Compliance Register Framework". Converted to Markdown
> via pandoc; content below is unedited from the original apart from minor
> formatting cleanup (removal of empty heading stubs, bullet/heading
> normalisation).
>
> This is **not** a new application. The WHS and Compliance Register is built
> **on top of the existing InstallFlow codebase** in this repo:
>
> - **Backend:** Convex (`packages/backend/convex/`) — new WHS tables extend
>   the existing schema alongside `users`, `sites`, `workorders`, `teams`,
>   `notifications`.
> - **Admin panel / office staff:** the existing Vite + TanStack Router web
>   app (`apps/web/`) — the admin register, dashboard and reports live here.
> - **Installer-facing:** the existing Expo Router React Native app
>   (`apps/native/`) — the **Safety** button, document access, acknowledgements
>   and first-aid kit inspections live here.
> - **Auth/roles:** existing Clerk setup and `convex/permissions.ts` roles are
>   extended, not replaced.
> - **Reminders:** build on the existing `convex/crons.ts`, `email.ts` and
>   `notifications.ts` plumbing rather than introducing a parallel system.
>
> Section 1 ("absolute simplicity") is the governing constraint and overrides
> feature ambition elsewhere in this document. Section 13 defines the staged
> delivery order; Section 14 defines what is explicitly out of scope.
>
> Where this framework conflicts with actual behaviour in
> `packages/backend/convex/`, `apps/web/` or `apps/native/`, raise the conflict
> rather than silently picking a side. Not to be confused with
> `docs/reference/original-client-srs.md`, which is historical only.

## 1. Primary design requirement — absolute simplicity

> **The overriding requirement for this project is absolute simplicity for management, administrators and installers.**

The WHS and Compliance Register must be easy to understand and operate without specialist WHS or software knowledge. It should reduce administration, not create another complicated system that requires constant data entry or training.

Every feature should be assessed against the following question:

> Does this make it quicker and easier for the user to identify what requires attention and complete the required action?

If a feature does not clearly improve this process, it should be simplified, automated or left out of the initial release.

The interface should follow these principles:

- Show each user only the information and actions relevant to them.
- Use plain language rather than technical compliance terminology wherever possible.
- Require the minimum number of screens, clicks and fields.
- Pre-fill information and calculate dates and statuses automatically wherever possible.
- Use consistent buttons, layouts and status labels across all register categories.
- Lead users directly to the required action, such as **Upload renewal**, **Review document**, **Acknowledge SWMS** or **Complete inspection**.
- Make the current status immediately obvious using both colour and text.
- Keep advanced settings and historical information available without cluttering the main screens.
- Avoid duplicate data entry by reusing worker, subcontractor, vehicle and company information already stored in InstallFlow.
- Ensure installer functions are designed primarily for simple mobile-phone use.

The system may perform complex tracking, reminders and record keeping in the background, but the user experience must remain simple.

## 2. Project objective

Create one central WHS and Compliance Register that:

- Stores current WHS and compliance records.
- Tracks document reviews, inspections, services, registrations and expiry dates.
- Sends reminders before action is due.
- Keeps historical and superseded documents automatically.
- Records who completed or verified each action.
- Shows Western USI’s current compliance position at a glance.
- Gives installers quick access to relevant safety information.
- Provides evidence for client reviews and audits.

The register will be the administrative source for the installer-facing:

- SWMS
- Accreditations
- SDS
- Safety documents

## 3. Simple user experience

### Management view

Management should see a short compliance overview showing only:

- Overdue items
- Items due soon
- Missing documents
- Items awaiting verification
- Overall company and subcontractor compliance

Management should be able to open an exception for more detail but should not need to work through the full register during normal use.

### Administrator view

The administrator should have one central register and one simple workflow for all record types:

1.  Add or open a record.
2.  Upload the document or evidence.
3.  Enter or confirm the due date.
4.  Assign the responsible person.
5.  Save.

The system should automatically determine the status, schedule reminders and retain the previous version.

### Installer view on InstallFlow

The installer should see a simple **Safety** button on the home screen. This opens:

- SWMS
- Accreditations
- SDS
- Safety documents
- List of Medical Centers, with opening hours sorted geographically by closest first.
- Any inspection or renewal task assigned to that installer

Installers should not see the full administrative register. They should see only their own accreditations, relevant documents and actions requiring their attention.

## 4. Main register categories

### A. Safety documents

Includes:

- SWMS
- WHS Management System
- WHS policies
- JCDecaux SSMP
- List of Medical Centres
- Emergency procedures
- SDS

Key fields:

- Document title
- Category
- Version number
- Issue date
- Review date
- Uploaded file
- Applicable workers, clients or work types
- Acknowledgement required: yes/no
- Responsible person
- Status
- Notes

When a new version is uploaded, the previous version should automatically become **Superseded**. If acknowledgement is required, affected workers should be asked to acknowledge the new version.

### B. Worker accreditations

Includes:

- White Cards
- First Aid qualifications
- RIW cards
- PTA inductions
- Working at Heights
- EWP licences
- ASIC cards
- Airport Inductions
- Driver’s licences
- Other client-specific inductions

Key fields:

- Worker
- Employer
- Accreditation type
- Licence or card number
- Issue date
- Expiry date or no expiry
- Evidence upload
- Verification status
- Verified by and date
- Notes

The worker’s page should show each accreditation as **Current**, **Due soon**, **Expired** or **Missing**. Uploading replacement evidence should be a single clear action.

### C. Insurance register

Covers Western USI and its subcontractors.

Insurance types:

- Workers’ compensation
- Public liability
- Motor vehicle insurance
- Professional indemnity, where applicable

Key fields:

- Insured entity
- Entity type: Western USI or subcontractor
- Insurance type
- Insurer
- Policy start date
- Expiry date
- Coverage amount
- Certificate of Currency
- Responsible person
- Verification status
- Verified by and date
- Notes

Previous Certificates of Currency must be retained automatically rather than overwritten.

### D. Subcontractor compliance

Each subcontractor should have one simple profile containing:

- Business or trading name
- ABN
- Primary contact
- Workers’ compensation status
- Public liability status
- Policy limits
- Worker accreditations
- Signed subcontractor agreement
- SWMS acknowledgements
- Required inductions
- Other client requirements
- Overall compliance status

The system must support sole traders and subcontracting companies with multiple workers. Business insurance belongs to the subcontractor entity, while licences and accreditations belong to individual workers.

The main subcontractor list should show a single overall status. Detailed requirements should appear only when the profile is opened.

### E. Vehicle register

Includes Western USI vehicles and, where required, subcontractor vehicles used for Western USI work.

Key fields:

- Registration number
- Make and model
- Year
- VIN
- Registration expiry date
- Insurance expiry date
- Last service date
- Next service date
- Service interval in months
- Service provider
- Service invoice or report
- Notes

The system should calculate and display the next service date. Normal users should see a simple status such as:

- Current
- Service due soon
- Service overdue
- Registration expiring
- Registration expired
- Insurance expiring
- Out of service

### F. First-aid kit inspections

Create one record for each first-aid kit, including warehouse and installer-vehicle kits.

Key fields:

- Kit ID
- Kit type
- Location or assigned vehicle
- Responsible person
- Inspection frequency
- Last inspection date
- Next inspection date
- Inspected by
- Inspection checklist
- Items replaced
- Earliest stock expiry date
- Optional photo
- Corrective action required
- Corrective action completed date
- Status
- Notes

The mobile inspection should use a short checklist with large, clear **Pass**, **Action required** and **Not applicable** options:

- Kit present and accessible
- Case and seals undamaged
- Contents match required inventory
- No expired items
- Used items replenished
- Sterile items sealed
- Emergency information current
- Kit clean and serviceable

The installer should be able to submit the inspection from one screen. The next inspection date should then be calculated automatically.

## 5. Common record structure

All categories should use the same basic structure where applicable:

| **Common field** | **Purpose** |
|----|----|
| Record ID | Automatically generated identifier |
| Category | Insurance, vehicle, accreditation, SWMS, SDS or first aid |
| Record name | Clear description shown to users |
| Related entity | Western USI, subcontractor, worker, vehicle or kit |
| Responsible person | Person responsible for the renewal or action |
| Issue/start date | When the item commenced |
| Due date | Expiry, review, service or inspection date |
| Reminder schedule | Normally set automatically from the category default |
| Status | Automatically calculated |
| Uploaded evidence | Certificate, licence, inspection form or document |
| Verification | Whether an administrator has checked the evidence |
| Notes | Optional supporting information |
| History | Earlier versions and actions, recorded automatically |

Only fields relevant to the selected category should be displayed. Users should never be presented with a large generic form containing irrelevant fields.

## 6. Simple status system

Use the smallest practical set of statuses in the main interface:

- **Current**
- **Due soon**
- **Overdue/Expired**
- **Missing**
- **Awaiting verification**
- **Action required**
- **Renewal in progress**
- **Out of service**

Administrative history may also use **Superseded**, **Archived** and **Not applicable**, but these should not clutter normal dashboard views.

Statuses should be calculated automatically from the record’s due date and verification state. Users should not normally need to choose a status manually.

## 7. Reminder framework

Each category should have a default reminder schedule so an administrator only needs to enter the due date.

| **Register item**         | **Default reminders**                 |
|---------------------------|---------------------------------------|
| Insurance                 | 60, 30, 14 and 7 days before expiry   |
| Vehicle registration      | 60, 30, 14 and 7 days before expiry   |
| Vehicle service           | 30, 14 and 7 days before service date |
| Worker accreditation      | 60, 30, 14 and 7 days before expiry   |
| SWMS or policy review     | 30, 14 and 7 days before review       |
| First-aid inspection      | 14 and 7 days before inspection       |
| SDS review or replacement | 60 and 30 days before review          |

After the due date:

- Mark the record overdue automatically.
- Notify the responsible person and administrator.
- Send a weekly reminder until completed.
- Escalate to management after a configurable period where required.

Each reminder should explain the required action in plain language and contain a direct link to the record.

## 8. Simple renewal and completion workflows

### Insurance or accreditation renewal

1.  User opens the reminder or record.
2.  Selects **Upload renewal**.
3.  Uploads the new document.
4.  Enters the new expiry date.
5.  Admin verifies it where required.
6.  The system archives the previous document, changes the status to **Current** and schedules the next reminders.

### Vehicle service

1.  User opens the service reminder.
2.  Selects **Mark service complete**.
3.  Enters the service date.
4.  Optionally uploads the invoice or service report.
5.  The system calculates the next service date and returns the vehicle to **Current**.

### First-aid kit inspection

1.  Installer opens the assigned inspection.
2.  Completes the short mobile checklist.
3.  Records any missing or expired items and optionally adds a photo.
4.  Selects **Submit inspection**.
5.  The system calculates the next inspection date.
6.  The record remains **Action required** only if an identified issue has not been resolved.

## 9. Admin dashboard

The dashboard must lead with exceptions, not the complete register.

The default screen should show:

- Overdue or expired
- Due within 30 days
- Due within 60 days
- Missing documents
- Awaiting verification
- Renewals in progress
- Vehicle actions required
- First-aid inspections due
- SWMS acknowledgements outstanding

Selecting a summary card should open the filtered list behind it.

Keep filtering straightforward. The essential filters are:

- Category
- Western USI or subcontractor
- Worker or subcontractor
- Vehicle
- Responsible person
- Status
- Due-date range

Additional filters should only be included where there is a demonstrated need.

A simple compliance calendar may be included, but it should not replace the exception-based dashboard.

## 10. Roles and permissions

Permissions should be kept simple and role-based.

### Administrator

- Full management of the WHS register
- Upload and verify records
- Manage renewal dates and reminders
- View history and reports
- Manage users and permissions

### Management

- View company and subcontractor compliance
- Receive escalations
- Verify or approve designated items where required

### Subcontractor contact

- View their own business requirements
- Upload their insurance and worker evidence
- Cannot see another subcontractor’s information
- Cannot verify their own documents

### Worker/installer

- View relevant SWMS, SDS and safety documents
- Acknowledge required documents
- View their own accreditations
- Upload renewal evidence
- Complete assigned first-aid inspections
- Cannot see another worker’s private records

Avoid creating additional roles unless genuinely required.

## 11. Audit trail

Audit information should be recorded automatically without creating extra work for users. The system should record:

- Who uploaded or verified a document
- Date and time of each action
- Previous expiry and review dates
- Status changes
- Reminders sent
- Worker acknowledgements
- Changes to register information
- Superseded document versions
- Overrides and reasons

Records should be archived rather than permanently deleted through normal administration.

## 12. Reports and exports

Reports should use simple templates and require only the selection of a report type and, where needed, a date range.

Required reports:

- Full WHS compliance register
- Items expiring within a selected period
- Subcontractor compliance report
- Worker accreditation matrix
- Western USI insurance register
- Vehicle service report
- First-aid inspection history
- SWMS acknowledgement report
- Missing or overdue documentation
- Audit history for a selected record

Exports should be available in PDF and Excel/CSV.

## 13. Recommended development stages

### Stage 1 — Simple core register

- Central register database
- Categories and relevant fields
- Document uploads
- Automatic due-date statuses
- Email reminders
- Exception-based admin dashboard
- Record history
- Basic reports

### Stage 2 — Compliance modules

- Western USI insurance
- Subcontractor insurance
- Worker accreditations
- SWMS and safety documents
- SDS
- Version-controlled acknowledgements

### Stage 3 — Operational registers

- Vehicle registrations and date-based servicing
- First-aid kit inspections
- Simple mobile inspection checklist
- Corrective actions arising from first-aid inspections

### Stage 4 — Workflow integration

- Link relevant SWMS to job orders
- Warn when allocated workers have expired credentials
- Warn when subcontractor insurance has expired
- Warn when an assigned vehicle is non-compliant
- Display job-specific SDS and client documents
- Management escalation rules

Warnings should initially be used instead of hard allocation blocks. Mandatory blocks should only be introduced later where the data is reliable and there is a clear operational requirement.

## 14. Scope boundaries

The initial release is not intended to become a full enterprise WHS or incident-management platform. It should remain focused on:

- Document control
- Renewal management
- Compliance evidence
- Reminders
- Acknowledgements
- First-aid inspections
- Audit history

Incident investigations, toolbox meetings, detailed plant registers and broader corrective-action management should remain outside the initial scope unless separately approved.

## 15. Acceptance criteria for simplicity

The simplicity requirement should be tested as part of development. The initial release should meet the following criteria:

- An administrator can add a standard record and schedule its reminders in approximately one minute.
- A user can renew a document from the reminder link without searching through the register.
- An installer can find and open a relevant SWMS or SDS within a few taps from the home screen.
- An installer can complete a first-aid kit inspection on a phone without training or written instructions.
- Statuses and required actions are understandable without opening each record.
- Previous versions and audit information are stored automatically.
- No user is shown fields, records or menu options that are not relevant to their role or current task.
- Repeated information is selected from existing InstallFlow records rather than re-entered.

If these criteria are not met, the relevant workflow should be simplified before release.
