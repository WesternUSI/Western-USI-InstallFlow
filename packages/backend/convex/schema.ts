import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const workOrderStatus = v.union(
  v.literal("pending"),
  v.literal("in_progress"),
  v.literal("completed"),
  // A completed install that a later import has superseded. Only ever reached
  // from "completed", and only by `workorders.archiveSupersededOrders`.
  v.literal("archived"),
);

/**
 * The Installation Schedule columns as they come off one row of the sheet,
 * before an import turns them into a work order.
 *
 * Only `scheduled_work_order_rows` is built from this. `workorders` spells its
 * own columns out, because it carries a good deal more than the sheet does.
 */
export const workOrderSourceFields = {
  contract_id: v.string(),
  advertiser_campaign: v.string(),
  contracted_panel_id: v.string(),
  panel_split: v.string(),
  site: v.string(),
  panel_name: v.string(),
  quantity: v.optional(v.number()),
  format: v.optional(v.string()),
  size: v.optional(v.string()),
  proposed_install_date: v.optional(v.string()),
  end_date: v.optional(v.string()),
  comments: v.optional(v.string()),
  existing_advertiser: v.optional(v.string()),
  area_progress: v.optional(v.string()),
  schedule: v.optional(v.string()),
  priority: v.boolean(),
};

export default defineSchema({
  users: defineTable({
    clerk_id: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    image_url: v.optional(v.string()),
    // "subcontractor" is a subcontractor business's login (WHS framework 10):
    // always tied to a subcontractor via `subcontractor_id`, it opens the
    // installer app's WHS side and, later, the subcontractor panel — never the
    // admin dashboard.
    role: v.optional(
      v.union(
        v.literal("installer"),
        v.literal("admin"),
        v.literal("subcontractor"),
        // Western USI's own management (framework 10): sees company and
        // subcontractor compliance and receives escalations. Never on a team.
        // Not a subcontractor's own management — that is the subcontractor login.
        v.literal("management"),
      ),
    ),
    // True when an account whose `role` is not admin (e.g. an installer) has
    // also been invited as an admin. The role stays as it was; the admin panel
    // and admin-only mutations accept either `role: "admin"` or this flag.
    has_admin_access: v.optional(v.boolean()),
    // True when an admin has also been given management access (decision AD43):
    // they can open both dashboards and switch between them. A "management"
    // role account given admin access uses `has_admin_access` the same way.
    has_management_access: v.optional(v.boolean()),
    // The team's name, not its id. Teams are a table now, but the name is what
    // is stored on the rows that reference one — the native app compares and
    // displays these as plain strings, and it keeps renames out of scope.
    team: v.optional(v.string()),
    // Set (and refreshed) whenever an admin reveals this account's credentials
    // via Invite / Resend Invite / Send Updated Credentials. Stands in for a
    // real invite-acceptance signal until an email provider is wired up.
    invited_at: v.optional(v.number()),
    // True whenever the account's current password is an admin-generated one
    // (set on invite, and again on Resend/Send Updated Credentials). The app
    // blocks navigation until the installer sets their own password, which
    // clears this.
    must_change_password: v.optional(v.boolean()),
    // Set by the `session.created` Clerk webhook the first time this account
    // actually signs in, distinguishing "Invitation Sent" from "Active".
    last_sign_in_at: v.optional(v.number()),
    // The subcontractor business this person belongs to — the "Employer" on
    // their accreditations (WHS framework 4B). Absent means a Western USI
    // employee. Required for the "subcontractor" role. Separate from `team`,
    // which is work-order allocation.
    subcontractor_id: v.optional(v.id("subcontractors")),
    // A subcontractor login only: whether they are also one of the company's
    // workers, set by an admin (decision R6). Absent means automatic: a worker
    // once they open the installer app or have evidence on file. False always wins.
    sole_trader: v.optional(v.boolean()),
    // A subcontractor login's first time in the installer app (decision R6).
    opened_installer_app_at: v.optional(v.number()),
  })
    .index("by_clerk_id", ["clerk_id"])
    // The WHS register reads only the people who hold accreditations (installers, subcontractor logins).
    .index("by_role", ["role"]),

  /**
   * A subcontractor business (WHS framework 4D). Business-level insurance and
   * the signed agreement will hang off this; licences and accreditations stay
   * with the individual workers, who point here through `users.subcontractor_id`.
   * A sole trader is a subcontractor with one worker who is also the contact.
   */
  subcontractors: defineTable({
    /** Business or trading name. */
    name: v.string(),
    abn: v.optional(v.string()),
    contact_name: v.optional(v.string()),
    contact_email: v.optional(v.string()),
    contact_phone: v.optional(v.string()),
    /** Records are archived, never deleted, through normal administration (framework 11). */
    archived: v.boolean(),
  })
    .index("by_name", ["name"])
    .index("by_archived", ["archived"]),

  /**
   * A subcontractor's signed agreement with Western USI (framework 4D,
   * decision R5). Each upload is kept; the newest is the current one. An
   * admin's upload counts as checked (V4).
   */
  subcontractor_agreements: defineTable({
    subcontractor_id: v.id("subcontractors"),
    signed_on: v.string(),
    review_date: v.string(),
    file_id: v.id("_storage"),
    file_name: v.string(),
    content_type: v.optional(v.string()),
    responsible_user_id: v.optional(v.id("users")),
    notes: v.optional(v.string()),
    uploaded_by: v.id("users"),
  }).index("by_subcontractor", ["subcontractor_id"]),

  /** One physical advertising panel, sourced from the Go Site Database sheet. */
  sites: defineTable({
    area: v.string(), // LOCATION
    site: v.string(), // DETAILS
    panel_id: v.string(), // PANEL ID
    quantity: v.optional(v.number()), // QTY
    size: v.optional(v.string()), // SIZE
    area_progress: v.optional(v.string()), // Area
    install_notes: v.optional(v.string()), // Install Notes
    equipment_needed: v.array(v.string()), // Equipment, comma-separated
    location: v.optional(v.string()), // GPS co-ordinates
    additional_notes: v.optional(v.string()), // free text added in the admin panel
    site_img: v.array(v.id("_storage")),
    photo_saved: v.boolean(), // derived: site_img is non-empty
    map_saved: v.boolean(), // derived: location is non-empty
    missing_value: v.boolean(), // panel_id is a placeholder such as "???"
    detail_key: v.optional(v.string()), // "completed" | "incomplete" | "missing"
  })
    .index("by_panel_id", ["panel_id"])
    .index("by_panel_id_site", ["panel_id", "site"])
    .index("by_area", ["area"])
    .index("by_detail_key_area", ["detail_key", "area"]),

  /**
   * One Site Database upload. Sites themselves are upserted rather than kept as
   * history, so this only records what each upload did.
   */
  site_imports: defineTable({
    file_name: v.string(),
    uploaded_at: v.number(),
    uploaded_by_name: v.string(),
    total_rows: v.number(),
    inserted: v.number(),
    updated: v.number(),
  }).index("by_uploaded_at", ["uploaded_at"]),

  /**
   * One daily Installation Schedule upload. Each import keeps its own summary
   * so the dashboard can show what was brought in, by whom, and how much of it
   * failed to match a site.
   */
  imports: defineTable({
    name: v.string(), // "Import-Data-12-Aug-2026"
    file_name: v.string(),
    upload_date: v.string(), // YYYY-MM-DD
    imported_at: v.number(), // Date.now()
    imported_by: v.optional(v.id("users")),
    imported_by_name: v.string(),
    total_rows: v.number(),
    missing_sites: v.number(),
  }).index("by_imported_at", ["imported_at"]),

  /**
   * An Installation Schedule upload parked for a future date.
   *
   * Nothing about a pending batch exists in `workorders` or `imports` — the
   * rows sit in `scheduled_work_order_rows` until `release_at`, which is what
   * keeps a pre-scheduled week invisible to installers *and* to the admin
   * panel's own work order screens. `scheduledImports.releaseScheduledImport`
   * is what turns one of these into a real import.
   */
  scheduled_imports: defineTable({
    file_name: v.string(),
    uploaded_at: v.number(), // Date.now(), when the file was brought in
    uploaded_by: v.optional(v.id("users")),
    uploaded_by_name: v.string(),
    release_date: v.string(), // YYYY-MM-DD, the day the batch goes live
    release_at: v.number(), // midnight of `release_date` in Australia/Sydney
    total_rows: v.number(),
    /**
     * `pending` until `release_at`, `releasing` while rows are being moved
     * across (a big schedule takes several transactions), `released` once the
     * staging rows are gone. Only `pending` batches can be cancelled or moved.
     */
    status: v.union(v.literal("pending"), v.literal("releasing"), v.literal("released")),
    /**
     * The `scheduler.runAt` job that will release this batch, kept so cancel
     * and reschedule can call `scheduler.cancel` on it. Unset until
     * `finalizeScheduledImport` — a half-uploaded batch must never be able to
     * fire, the same reason `imports.finalizeImport` archives only at the end.
     */
    job_id: v.optional(v.id("_scheduled_functions")),
    /** Set once the release has created the real import row. */
    import_id: v.optional(v.id("imports")),
  })
    .index("by_release_at", ["release_at"])
    .index("by_status", ["status"]),

  /**
   * The staged rows of one `scheduled_imports` batch, straight from the sheet.
   *
   * Site matching is deliberately *not* done here. It happens when the batch is
   * released, against the Site Database as it stands that day, so a site added
   * between uploaad and release is picked up rather than missed.
   */
  scheduled_work_order_rows: defineTable({
    scheduled_import_id: v.id("scheduled_imports"),
    ...workOrderSourceFields,
  }).index("by_scheduled_import", ["scheduled_import_id"]),

  /**
   * One panel's installation for one campaign, sourced from the Installation
   * Schedule sheet. Every daily upload inserts a fresh set of rows tagged with
   * `upload_date`; previous uploads are retained as history.
   */
  workorders: defineTable({
    import_id: v.id("imports"),
    contract_id: v.string(), // CONTRACT
    advertiser_campaign: v.string(), // ADVERTISER / CAMPAIGN
    contracted_panel_id: v.string(), // CONTRACTED PANEL ID
    panel_split: v.string(), // derived from CONTRACTED PANEL ID
    site: v.string(), // LOCATION
    panel_name: v.string(), // PANEL NAME
    quantity: v.optional(v.number()), // QTY
    format: v.optional(v.string()), // FORMAT
    size: v.optional(v.string()), // SIZE (W x H)
    proposed_install_date: v.optional(v.string()), // PROPOSED INSTALL DATE
    end_date: v.optional(v.string()), // END DATE
    comments: v.optional(v.string()), // COMMENTS
    existing_advertiser: v.optional(v.string()), // EXISTING ADVERTISER
    area_progress: v.optional(v.string()), // Line
    schedule: v.optional(v.string()), // Schedule
    upload_date: v.string(), // YYYY-MM-DD, shared by every row in one upload
    priority: v.boolean(), // every non-empty cell in the row had a red fill
    current_status: workOrderStatus,
    // A work order can only ever have one team, so allocating simply sets
    // this and unallocating clears it back to undefined. Holds the team's
    // name — see the note on `users.team`.
    assigned_team: v.optional(v.string()),
    site_id: v.optional(v.id("sites")), // panel_split matched to sites.panel_id
    missing_value: v.boolean(), // no site matched panel_split
    // Snapshot of the matched site's `area_progress` taken at import time, so
    // listing and grouping never need to join back to `sites`.
    train_line: v.optional(v.string()),
    // Set together by Complete Installs' photo submission, once per work
    // order — the site's reference photos live on `sites.site_img` instead.
    // `completion_photo` is the original single-photo field, kept so rows
    // completed before multi-photo still read; new completions write the
    // full set to `completion_photos` and leave `completion_photo` unset.
    completion_photo: v.optional(v.id("_storage")),
    completion_photos: v.optional(v.array(v.id("_storage"))),
    completion_notes: v.optional(v.string()),
    completed_at: v.optional(v.number()),
    // Written by every mutation that touches this row so the status tabs filter
    // through an index rather than after a page has been read.
    status_key: v.optional(v.string()), // completed | missing_site | pending | allocated | not_allocated
  })
    .index("by_import_id", ["import_id"])
    .index("by_upload_date", ["upload_date"])
    .index("by_site_id", ["site_id"])
    .index("by_panel_split", ["panel_split"])
    .index("by_status_key", ["status_key"])
    .index("by_import_status", ["import_id", "status_key"])
    // Lets the Duration filter run as an index range, on its own or combined
    // with a status tab.
    .index("by_status_upload", ["status_key", "upload_date"])
    // The team-scoped queries read only one team's rows instead of the table,
    // and can leave that team's archived rows unread.
    .index("by_team_status", ["assigned_team", "current_status"])
    // Lets the area queries read every status except "archived" without
    // reading the archived rows, which only grow with each import.
    .index("by_current_status", ["current_status"]),

  /**
   * An installation crew. Admins create these, so the set is no longer
   * the fixed Team 1–5 it started as.
   *
   * Rows that belong to a team store its `name`, not its id, so archiving is
   * offered instead of deletion and renaming is deliberately not supported —
   * either would have to cascade across users and work orders.
   */
  teams: defineTable({
    name: v.string(),
    archived: v.boolean(),
  }).index("by_name", ["name"]),

  /**
   * Who the completion email goes to.
   *
   * It used to go to every `admin`, with no way to change that. Admins are
   * still in the list by default — an admin with no row here is treated as
   * present and enabled, and only gets a row the moment someone toggles or
   * removes them. That is what makes removal stick: the row survives as a
   * tombstone (`removed`), so the default never puts them back.
   */
  email_recipients: defineTable({
    /** Lower-cased and trimmed. The identity of a row, and how it is addressed. */
    email: v.string(),
    /** `admin` rows mirror a user account; `manual` ones were typed in here. */
    source: v.union(v.literal("admin"), v.literal("manual")),
    /** Off keeps the row visible but stops sending to it. */
    enabled: v.boolean(),
    /** Hidden from the list, never re-seeded, never sent to. */
    removed: v.boolean(),
    /** Set on `admin` rows, so the row stays tied to the account it came from. */
    clerk_id: v.optional(v.string()),
  }).index("by_email", ["email"]),

  /**
   * Shown in the admin panel's notification bell. One shared inbox — "read"
   * isn't per-admin — which is deliberately simple for the small office-staff
   * team this panel serves.
   */
  notifications: defineTable({
    type: v.literal("order_completed"),
    title: v.string(),
    body: v.string(),
    work_order_id: v.optional(v.id("workorders")),
    read: v.boolean(),
  }).index("by_read", ["read"]),

  // ---------------------------------------------------------------------------
  // WHS register (docs/reference/whs-framework.md). Decisions made where the
  // framework is silent are in docs/reference/whs-decisions.md.
  // ---------------------------------------------------------------------------

  /**
   * The kinds of accreditation a worker can hold (framework 4B). Admin-editable,
   * so a client-specific induction is just another type.
   */
  accreditation_types: defineTable({
    name: v.string(),
    /**
     * Days before expiry that reminders go out, longest first (framework 7:
     * 60, 30, 14, 7). The first one is also when a record becomes "Due soon"
     * (decision S2), so changing it changes both.
     */
    reminder_days: v.array(v.number()),
    /**
     * Days after expiry before an overdue accreditation is escalated to
     * management (framework 7: "a configurable period"). Absent means the
     * default in whsReminders.ts.
     */
    escalate_after_days: v.optional(v.number()),
    sort_order: v.number(),
    archived: v.boolean(),
  }).index("by_name", ["name"]),

  /**
   * Which accreditation types a group of workers must hold. Rows with a
   * `subcontractor_id` apply to that subcontractor's workers (every type, by
   * default); rows without one apply to Western USI's own employees. A required
   * type with no evidence is "Missing" (decision S4) — there is no placeholder row.
   */
  accreditation_requirements: defineTable({
    subcontractor_id: v.optional(v.id("subcontractors")),
    type_id: v.id("accreditation_types"),
  })
    .index("by_subcontractor", ["subcontractor_id"])
    .index("by_type", ["type_id"]),

  /**
   * One register record: this worker's evidence for one accreditation type. It
   * exists from the first upload on, and holds the history as versions.
   * `category` is a union of one for now — the other registers (insurance,
   * vehicles, first-aid kits) will reuse this shape.
   */
  whs_records: defineTable({
    category: v.literal("accreditation"),
    worker_id: v.id("users"),
    type_id: v.id("accreditation_types"),
    /** Who is chased for renewals; the worker unless set otherwise. */
    responsible_user_id: v.id("users"),
  })
    .index("by_worker", ["worker_id"])
    .index("by_worker_and_type", ["worker_id", "type_id"]),

  /**
   * One upload against a record. Versions are never overwritten or deleted: a
   * verified version that a newer one replaces becomes "superseded".
   * Dates are ISO `YYYY-MM-DD` strings, like the work order dates.
   */
  whs_record_versions: defineTable({
    record_id: v.id("whs_records"),
    file_id: v.id("_storage"),
    file_name: v.string(),
    content_type: v.optional(v.string()),
    /** Licence or card number. */
    number: v.optional(v.string()),
    issued: v.optional(v.string()),
    expires: v.optional(v.string()),
    no_expiry: v.boolean(),
    notes: v.optional(v.string()),
    uploaded_by: v.id("users"),
    state: v.union(
      v.literal("pending"),
      v.literal("verified"),
      v.literal("rejected"),
      v.literal("superseded"),
    ),
    verified_by: v.optional(v.id("users")),
    verified_at: v.optional(v.number()),
    /** Shown to the worker with "Action required" (decision S3). */
    rejected_reason: v.optional(v.string()),
  })
    .index("by_record", ["record_id"])
    // The daily reminder check reads only verified versions near or past expiry.
    .index("by_state_and_expires", ["state", "expires"]),

  /** Append-only trail of who did what to a record and when (framework 11). Never edited or deleted. */
  whs_audit: defineTable({
    record_id: v.id("whs_records"),
    version_id: v.optional(v.id("whs_record_versions")),
    action: v.union(
      v.literal("uploaded"),
      v.literal("verified"),
      v.literal("rejected"),
      v.literal("superseded"),
      v.literal("reminder_sent"),
      v.literal("escalated"),
      /** The admin corrected the details, with a reason (framework 11, decision AD32). */
      v.literal("edited"),
    ),
    /** Who did it. Absent for what the system does itself, such as sending a reminder. */
    actor_id: v.optional(v.id("users")),
    /** Plain-language detail, e.g. the rejection reason or the previous expiry date. */
    details: v.optional(v.string()),
    /**
     * For reminders: which one ("pre-60:worker", "overdue-1:admin", "escalated").
     * The daily check skips any key already logged for a version, so it never
     * sends the same reminder twice.
     */
    key: v.optional(v.string()),
  })
    .index("by_record", ["record_id"])
    .index("by_version_key", ["version_id", "key"]),

  /**
   * One safety document in the register (framework 4A): a SWMS, an SDS, or
   * another safety document (policy, management system, client plan,
   * emergency procedure). The file and dates live on its versions.
   */
  whs_documents: defineTable({
    kind: v.union(v.literal("swms"), v.literal("sds"), v.literal("document")),
    title: v.string(),
    /** The register reference, e.g. "SWMS-03". */
    code: v.optional(v.string()),
    /** Plain-language category, e.g. "WHS Policy" or "Flammable liquid". */
    category: v.optional(v.string()),
    /**
     * The clients or work types it is for, as text ("PTA sites", "JCDecaux
     * sites"), shown to workers (framework 4A). Who sees and signs it is set
     * by `for_entities` and `for_workers`.
     */
    applies_to: v.optional(v.string()),
    /**
     * Who must read and sign it (framework 4A, decision AD33): workers of these
     * entities ("western-usi" or a subcontractor), plus these people. When both
     * are empty or absent it is for everyone (decision D6).
     */
    for_entities: v.optional(v.array(v.union(v.literal("western-usi"), v.id("subcontractors")))),
    for_workers: v.optional(v.array(v.id("users"))),
    /** Framework 4A "Acknowledgement required: yes/no". */
    acknowledgement_required: v.boolean(),
    /** Chased for reviews (framework 7). Absent means the admin recipient list. */
    responsible_user_id: v.optional(v.id("users")),
    notes: v.optional(v.string()),
    /** Archived, never deleted (framework 11). */
    archived: v.boolean(),
  })
    .index("by_kind", ["kind"])
    .index("by_archived", ["archived"]),

  /**
   * One issued version of a document. Uploading a new one makes the previous
   * one "superseded" (framework 4A), kept as history. Dates are `YYYY-MM-DD`.
   */
  whs_document_versions: defineTable({
    document_id: v.id("whs_documents"),
    /** As printed on the document: "v3.1", "2026 issue". */
    version: v.string(),
    issued: v.string(),
    review_date: v.optional(v.string()),
    file_id: v.id("_storage"),
    file_name: v.string(),
    content_type: v.optional(v.string()),
    state: v.union(v.literal("current"), v.literal("superseded")),
    uploaded_by: v.optional(v.id("users")),
  })
    .index("by_document", ["document_id"])
    // The daily check reads only current versions near or past their review date.
    .index("by_state_and_review", ["state", "review_date"]),

  /**
   * A worker's saved signature (decision D1), drawn once in the app and reused
   * for each acknowledgement. SVG path data in the pad's own coordinates.
   */
  whs_signatures: defineTable({
    user_id: v.id("users"),
    paths: v.array(v.string()),
    width: v.number(),
    height: v.number(),
  }).index("by_user", ["user_id"]),

  /**
   * A worker's acknowledgement of one document version, signed (decision D1).
   * The signature is copied in, so redrawing it later never changes a past one.
   */
  whs_acknowledgements: defineTable({
    document_id: v.id("whs_documents"),
    version_id: v.id("whs_document_versions"),
    worker_id: v.id("users"),
    signature: v.object({ paths: v.array(v.string()), width: v.number(), height: v.number() }),
  })
    .index("by_worker", ["worker_id"])
    .index("by_version_and_worker", ["version_id", "worker_id"]),

  /** "Raise Concern or Question" on a document (decision D2). The office is emailed. */
  whs_concerns: defineTable({
    document_id: v.id("whs_documents"),
    version_id: v.id("whs_document_versions"),
    worker_id: v.id("users"),
    message: v.string(),
  }).index("by_document", ["document_id"]),

  /**
   * An on-site change recorded against a SWMS version (decision D3, section 11
   * of the client's SWMS). Work carries on; the admin validates it afterwards.
   */
  swms_changes: defineTable({
    document_id: v.id("whs_documents"),
    version_id: v.id("whs_document_versions"),
    reported_by: v.id("users"),
    /** `YYYY-MM-DD` and `HH:MM`, business time. */
    date: v.string(),
    time: v.string(),
    change: v.string(),
    risk_before: v.string(),
    control: v.string(),
    risk_after: v.string(),
    approved_by: v.string(),
    trigger: v.optional(v.string()),
    site: v.optional(v.string()),
    photos: v.array(v.id("_storage")),
    notes: v.optional(v.string()),
    state: v.union(v.literal("awaiting-review"), v.literal("validated"), v.literal("sent-back")),
    reviewed_by: v.optional(v.id("users")),
    reviewed_at: v.optional(v.number()),
    /** Why the admin sent it back. */
    review_reason: v.optional(v.string()),
  })
    .index("by_version", ["version_id"])
    .index("by_state", ["state"]),

  /** One affected worker's signature on an on-site change (the SWMS's "worker initials"). */
  swms_change_signoffs: defineTable({
    change_id: v.id("swms_changes"),
    worker_id: v.id("users"),
    signature: v.object({ paths: v.array(v.string()), width: v.number(), height: v.number() }),
  })
    .index("by_change", ["change_id"])
    .index("by_change_and_worker", ["change_id", "worker_id"]),

  /** Append-only trail for documents (framework 11), like `whs_audit` for accreditations. */
  whs_document_audit: defineTable({
    document_id: v.id("whs_documents"),
    version_id: v.optional(v.id("whs_document_versions")),
    change_id: v.optional(v.id("swms_changes")),
    action: v.union(
      v.literal("uploaded"),
      v.literal("superseded"),
      v.literal("acknowledged"),
      v.literal("concern_raised"),
      v.literal("change_reported"),
      v.literal("change_signed"),
      v.literal("change_validated"),
      v.literal("change_sent_back"),
      v.literal("reminder_sent"),
      v.literal("escalated"),
      v.literal("edited"),
      v.literal("archived"),
    ),
    actor_id: v.optional(v.id("users")),
    details: v.optional(v.string()),
    /** For reminders, so none is sent twice: "review-30:responsible", "ack-0:<user id>". */
    key: v.optional(v.string()),
  })
    .index("by_document", ["document_id"])
    .index("by_version_key", ["version_id", "key"]),

  /**
   * One first-aid kit (framework 4F): a warehouse kit or one in an installer's
   * vehicle. Its responsible person is who inspects it ("assigned" in
   * framework 10). Dates are `YYYY-MM-DD`.
   */
  first_aid_kits: defineTable({
    /** The kit ID printed on the kit, e.g. "V-03". */
    code: v.string(),
    /** e.g. "Vehicle kit", "Warehouse kit". */
    kit_type: v.string(),
    /** Location or assigned vehicle, e.g. "Vehicle 1DXK442" or "Osborne Park warehouse". */
    location: v.string(),
    responsible_user_id: v.optional(v.id("users")),
    /** Months between inspections (decision K2: 3 by default). */
    frequency_months: v.number(),
    last_inspection: v.optional(v.string()),
    next_inspection: v.string(),
    notes: v.optional(v.string()),
    archived: v.boolean(),
  })
    .index("by_responsible", ["responsible_user_id"])
    .index("by_next_inspection", ["next_inspection"])
    .index("by_archived", ["archived"]),

  /** One submitted inspection (framework 4F, 8). Never edited; resolving an issue only adds the resolution. */
  kit_inspections: defineTable({
    kit_id: v.id("first_aid_kits"),
    inspected_by: v.id("users"),
    /** The business date it was done. */
    date: v.string(),
    answers: v.array(
      v.object({
        check: v.string(),
        answer: v.union(v.literal("pass"), v.literal("action"), v.literal("na")),
      }),
    ),
    items_replaced: v.optional(v.string()),
    earliest_expiry: v.string(),
    photo: v.optional(v.id("_storage")),
    /** "Corrective action required": what needs doing, when any check is Action required. */
    corrective_action: v.optional(v.string()),
    notes: v.optional(v.string()),
    /** "Corrective action completed date" (decision K3), with who did it and what they did. */
    resolved_at: v.optional(v.number()),
    resolved_by: v.optional(v.id("users")),
    resolution: v.optional(v.string()),
  }).index("by_kit", ["kit_id"]),

  /** Append-only trail for kits (framework 11), with reminder keys so none repeats. */
  kit_audit: defineTable({
    kit_id: v.id("first_aid_kits"),
    inspection_id: v.optional(v.id("kit_inspections")),
    action: v.union(
      v.literal("inspected"),
      v.literal("resolved"),
      v.literal("reminder_sent"),
      v.literal("escalated"),
      v.literal("edited"),
      v.literal("archived"),
    ),
    actor_id: v.optional(v.id("users")),
    details: v.optional(v.string()),
    /** "2026-12-01:pre-14:responsible": the due date it was for, then which reminder. */
    key: v.optional(v.string()),
  }).index("by_kit_and_key", ["kit_id", "key"]),

  /**
   * An insurance policy (framework 4C) for Western USI (no subcontractor) or
   * a subcontractor. Its certificates of currency are versions underneath.
   */
  insurance_policies: defineTable({
    subcontractor_id: v.optional(v.id("subcontractors")),
    insurance_type: v.union(
      v.literal("workers_compensation"),
      v.literal("public_liability"),
      v.literal("motor_vehicle"),
      v.literal("professional_indemnity"),
    ),
    insurer: v.string(),
    policy_number: v.optional(v.string()),
    coverage: v.string(),
    /** Chased for renewals; the admin list when absent. */
    responsible_user_id: v.optional(v.id("users")),
    notes: v.optional(v.string()),
    archived: v.boolean(),
  })
    .index("by_subcontractor", ["subcontractor_id"])
    .index("by_archived", ["archived"]),

  /**
   * One certificate of currency for a policy. Previous certificates are kept,
   * never overwritten (framework 4C): a verified one a newer one replaces
   * becomes "superseded". Dates are `YYYY-MM-DD`.
   */
  insurance_certificates: defineTable({
    policy_id: v.id("insurance_policies"),
    start: v.string(),
    expires: v.string(),
    file_id: v.id("_storage"),
    file_name: v.string(),
    content_type: v.optional(v.string()),
    uploaded_by: v.id("users"),
    state: v.union(v.literal("pending"), v.literal("verified"), v.literal("rejected"), v.literal("superseded")),
    verified_by: v.optional(v.id("users")),
    verified_at: v.optional(v.number()),
    rejected_reason: v.optional(v.string()),
  })
    .index("by_policy", ["policy_id"])
    .index("by_state_and_expires", ["state", "expires"]),

  /** Append-only trail for insurance (framework 11), with reminder keys. */
  insurance_audit: defineTable({
    policy_id: v.id("insurance_policies"),
    certificate_id: v.optional(v.id("insurance_certificates")),
    action: v.union(
      v.literal("added"),
      v.literal("uploaded"),
      v.literal("verified"),
      v.literal("rejected"),
      v.literal("superseded"),
      v.literal("reminder_sent"),
      v.literal("escalated"),
      v.literal("edited"),
      v.literal("archived"),
    ),
    actor_id: v.optional(v.id("users")),
    details: v.optional(v.string()),
    key: v.optional(v.string()),
  })
    .index("by_policy", ["policy_id"])
    .index("by_policy_and_key", ["policy_id", "key"]),

  /**
   * A Western USI vehicle (framework 4E; subcontractor vehicles are not
   * tracked, decision VH4). The next service date is worked out from the last
   * service and the interval, and stored so reminders can find it.
   */
  vehicles: defineTable({
    registration: v.string(),
    make_model: v.string(),
    year: v.optional(v.number()),
    vin: v.optional(v.string()),
    registration_expiry: v.string(),
    insurance_expiry: v.string(),
    last_service: v.string(),
    service_interval_months: v.number(),
    next_service: v.string(),
    service_provider: v.optional(v.string()),
    responsible_user_id: v.optional(v.id("users")),
    out_of_service: v.boolean(),
    out_of_service_reason: v.optional(v.string()),
    notes: v.optional(v.string()),
    archived: v.boolean(),
  })
    .index("by_registration", ["registration"])
    .index("by_archived", ["archived"]),

  /** One completed service (framework 8 "Mark service complete"), kept as history. */
  vehicle_services: defineTable({
    vehicle_id: v.id("vehicles"),
    date: v.string(),
    provider: v.optional(v.string()),
    odometer: v.optional(v.string()),
    notes: v.optional(v.string()),
    file_id: v.optional(v.id("_storage")),
    file_name: v.optional(v.string()),
    recorded_by: v.id("users"),
  }).index("by_vehicle", ["vehicle_id"]),

  /** Append-only trail for vehicles (framework 11), with reminder keys. */
  vehicle_audit: defineTable({
    vehicle_id: v.id("vehicles"),
    action: v.union(
      v.literal("added"),
      v.literal("serviced"),
      v.literal("out_of_service"),
      v.literal("returned_to_service"),
      v.literal("reminder_sent"),
      v.literal("escalated"),
      v.literal("edited"),
      v.literal("archived"),
    ),
    actor_id: v.optional(v.id("users")),
    details: v.optional(v.string()),
    key: v.optional(v.string()),
  })
    .index("by_vehicle", ["vehicle_id"])
    .index("by_vehicle_and_key", ["vehicle_id", "key"]),

  /**
   * The company's list of medical centres (framework 4A, 3; decision D4), one
   * row per row of Mitch's spreadsheet ("Medical centres.xlsx"), columns kept as
   * he supplied them. Several suburbs can list the same practice. Hours are
   * free text in Perth time, as written ("Not confirmed" included).
   */
  medical_centres: defineTable({
    listed_suburb: v.string(),
    name: v.string(),
    address: v.string(),
    phone: v.string(),
    hours_weekdays: v.string(),
    hours_saturday: v.string(),
    hours_sunday: v.string(),
    latitude: v.number(),
    longitude: v.number(),
  }),

  /**
   * Height and safety equipment (decision AD49): ladders and safety steps from
   * Mitch's "Height and Safety Equipment register" sheet, columns kept as he
   * supplied them. Type + brand + name/number identifies an item. Dates are
   * `YYYY-MM-DD` when the sheet gave a date, else the text as written.
   */
  equipment: defineTable({
    type: v.string(),
    brand: v.string(),
    /** "Name / Number" on the sheet, e.g. "Step 1" or "Blue 3M". */
    name: v.string(),
    damage: v.optional(v.string()),
    repair_history: v.optional(v.string()),
    out_of_service_date: v.optional(v.string()),
    last_updated: v.optional(v.string()),
    archived: v.boolean(),
  }).index("by_archived", ["archived"]),

  /**
   * One check of an item, assigned to a worker by the admin and done once on
   * their phone (AD49): "Any damage?" Yes/No and a recommendation. A check
   * that found damage stays Action required until reviewed.
   */
  equipment_checks: defineTable({
    equipment_id: v.id("equipment"),
    assigned_to: v.id("users"),
    assigned_by: v.id("users"),
    /** "Check by" date. */
    due: v.string(),
    state: v.union(v.literal("assigned"), v.literal("done"), v.literal("cancelled")),
    done_on: v.optional(v.string()),
    damage_found: v.optional(v.boolean()),
    damage_description: v.optional(v.string()),
    recommendation: v.optional(v.string()),
    photo: v.optional(v.id("_storage")),
    /** From the first, placeholder checklist (23 Oct); no longer written. */
    answers: v.optional(v.array(v.object({ check: v.string(), answer: v.union(v.literal("pass"), v.literal("action")) }))),
    problem: v.optional(v.string()),
    notes: v.optional(v.string()),
    reviewed_at: v.optional(v.number()),
    reviewed_by: v.optional(v.id("users")),
    outcome: v.optional(v.union(v.literal("repaired"), v.literal("out-of-service"), v.literal("no-action"))),
    review_note: v.optional(v.string()),
  })
    .index("by_equipment", ["equipment_id"])
    .index("by_assigned_and_state", ["assigned_to", "state"]),

  /** Append-only trail for equipment (framework 11). */
  equipment_audit: defineTable({
    equipment_id: v.id("equipment"),
    check_id: v.optional(v.id("equipment_checks")),
    action: v.union(
      v.literal("added"),
      v.literal("imported"),
      v.literal("assigned"),
      v.literal("checked"),
      v.literal("reviewed"),
      v.literal("edited"),
      v.literal("archived"),
    ),
    actor_id: v.optional(v.id("users")),
    details: v.optional(v.string()),
  }).index("by_equipment", ["equipment_id"]),

  /**
   * WHS settings the admin can change, one row (decision AD47). Absent values
   * fall back to the defaults in whsSettings.ts.
   */
  whs_settings: defineTable({
    /** Days overdue before management is emailed once (framework 7 "a configurable period"). */
    escalate_after_days: v.optional(v.number()),
    updated_by: v.optional(v.id("users")),
    updated_at: v.optional(v.number()),
  }),
});
