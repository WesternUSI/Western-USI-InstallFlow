import { api } from "@usi-installer/backend/convex/_generated/api";
import { useCanGoBack, useRouter } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import type { ReactNode } from "react";

import { SafetyButton, SafetyPage } from "@/components/whs/safety-ui";

/**
 * Shared pieces of the subcontractor portal (Figma "Subcontractor Flows",
 * framework 10): the page frame with the company's name, and what each
 * status asks the company to do.
 */

/** A portal page: the Safety page frame without the notification bell, subtitled with the company. */
export function SubPage({
  title,
  back,
  children,
}: {
  title: string;
  back?: { to: string; label: string; params?: Record<string, string> };
  children: ReactNode;
}) {
  const company = useQuery(api.subcontractorPortal.company);
  return (
    <SafetyPage title={title} description={`${company?.name ?? "Your company"} · Subcontractor portal`} back={back as never} hideBell>
      {children}
    </SafetyPage>
  );
}

/** The upload a status asks for, or nothing when there is nothing to do (framework 3 "lead users directly to the required action"). */
export function uploadAction(status: string): string | undefined {
  if (status === "expired" || status === "overdue" || status === "due-soon") return "Upload renewal";
  if (status === "missing") return "Upload evidence";
  if (status === "action-required") return "Replace evidence";
  return undefined;
}

/**
 * A form's Cancel: back to the page the person came from, like the "‹ Back"
 * link, so Back afterwards doesn't reopen the form. Opened directly, it goes
 * to `to`.
 */
export function CancelButton({ to, params }: { to: string; params?: Record<string, string> }) {
  const canGoBack = useCanGoBack();
  const router = useRouter();
  return canGoBack ? (
    <SafetyButton variant="secondary" onClick={() => router.history.back()}>
      Cancel
    </SafetyButton>
  ) : (
    <SafetyButton variant="secondary" to={to as never} params={params}>
      Cancel
    </SafetyButton>
  );
}

/** The largest file the forms take, as the picker says. */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
