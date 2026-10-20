/**
 * Where an accreditation email sends the worker. With `WEB_APP_URL` set on the
 * Convex deployment (the admin panel's public address) it is a page there that
 * hands over to the app; mail apps often won't open a custom app link
 * directly. Without it, it is the app's own link, which still works from
 * clients that allow it.
 */
export function accreditationLink(typeId: string): string {
  const base = process.env.WEB_APP_URL?.trim().replace(/\/+$/, "");
  return base
    ? `${base}/open/accreditation/${typeId}`
    : `usi-installer://safety/accreditations/${typeId}`;
}

/** Where a document email sends the worker. Same hand-off as `accreditationLink`. */
export function documentLink(documentId: string): string {
  const base = process.env.WEB_APP_URL?.trim().replace(/\/+$/, "");
  return base ? `${base}/open/document/${documentId}` : `usi-installer://safety/documents/${documentId}`;
}

/**
 * The record on the management dashboard, for escalation emails (framework 7
 * "a direct link to the record", decision AD45). `path` is the page under the
 * web panel, e.g. "/management/insurance/<id>". Uses `WEB_APP_URL`: the staging
 * site on the dev deployment, admin.westernusi.com.au on production. Without
 * it there is no web address to link to, so the email goes without a link.
 */
export function managementLink(path: string): { label: string; url: string } | undefined {
  const base = process.env.WEB_APP_URL?.trim().replace(/\/+$/, "");
  return base ? { label: "Open it in the management dashboard", url: `${base}${path}` } : undefined;
}
