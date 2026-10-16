import type { SafetyStatus } from "@/components/whs/safety-ui";

/** A vehicle's own status (framework 4E) as a badge colour. */
export function vehicleBadge(status: string): SafetyStatus {
  switch (status) {
    case "out-of-service":
      return "out-of-service";
    case "registration-expired":
    case "insurance-expired":
      return "expired";
    case "service-overdue":
      return "overdue";
    case "current":
      return "current";
    default:
      return "due-soon";
  }
}
