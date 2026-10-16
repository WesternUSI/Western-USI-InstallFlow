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
