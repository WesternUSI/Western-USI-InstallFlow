import type { AccreditationItem } from "@/hooks/use-accreditations";
import { formatIsoDate } from "@/lib/whs-format";

/** The line under the name on the accreditations list. */
export function listSubtitle(item: AccreditationItem): string {
  if (item.status === "action-required") {
    return item.rejected_reason ? `Rejected: ${item.rejected_reason}` : "Rejected by the office";
  }
  if (!item.has_evidence) return "No evidence uploaded";
  return item.number ? `No. ${item.number}` : "No number recorded";
}

/** The "Action" value on the accreditations list. */
export function listValue(item: AccreditationItem): string {
  if (item.status === "action-required") return "Upload Again";
  if (!item.has_evidence) return "Upload Required";
  if (item.no_expiry || item.expires === undefined) return "No Expiry";
  return `Expires ${formatIsoDate(item.expires)}`;
}

/** What the Needs Attention card says to do. Only called for items that need attention. */
export function attentionText(item: AccreditationItem): string {
  const date = item.expires === undefined ? "" : formatIsoDate(item.expires);

  switch (item.status) {
    case "action-required":
      return `${item.rejected_reason ? `Rejected: ${item.rejected_reason}.` : "Rejected by the office."} Upload a corrected copy.`;
    case "missing":
      return "No evidence on file. Upload it to complete your records.";
    case "expired":
      return `Expired ${date}. Upload your renewal to stay compliant.`;
    case "due-soon":
      return `Expires ${date}. Upload your renewal before it runs out.`;
    default:
      return "";
  }
}

/** The button on a card or detail screen. */
export function actionLabel(item: AccreditationItem): string {
  switch (item.status) {
    case "missing":
      return "Upload Evidence";
    case "action-required":
      return "Upload Again";
    default:
      return "Upload Renewal";
  }
}
