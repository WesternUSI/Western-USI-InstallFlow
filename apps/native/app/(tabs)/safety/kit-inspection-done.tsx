import { type Href, useLocalSearchParams, useRouter } from "expo-router";

import { CompletionScreen } from "@/components/whs/whs-ui";
import { formatIsoDate } from "@/lib/whs-format";

export default function KitInspectionDoneScreen() {
  const { issues, next } = useLocalSearchParams<{ issues?: string; next?: string }>();
  const router = useRouter();

  const nextDue = next ? formatIsoDate(next) : "";
  const flagged = Number(issues ?? 0);
  const message =
    flagged > 0
      ? `Saved. ${flagged} ${flagged === 1 ? "check needs" : "checks need"} action: the kit shows Action Required until you mark it resolved.\nNext inspection due ${nextDue}.`
      : `Saved. Next inspection due ${nextDue}.`;

  return (
    <CompletionScreen
      title="Inspection Submitted"
      message={message}
      onDone={() => router.dismissTo("/safety" as Href)}
    />
  );
}
