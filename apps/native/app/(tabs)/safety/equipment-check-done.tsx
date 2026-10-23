import { type Href, useLocalSearchParams, useRouter } from "expo-router";

import { CompletionScreen } from "@/components/whs/whs-ui";

export default function EquipmentCheckDoneScreen() {
  const { issue } = useLocalSearchParams<{ issue?: string }>();
  const router = useRouter();

  return (
    <CompletionScreen
      title="Check Submitted"
      message={issue === "1" ? "Saved. The item shows Action Required until the office reviews it." : "Saved. All clear."}
      onDone={() => router.dismissTo("/safety" as Href)}
    />
  );
}
