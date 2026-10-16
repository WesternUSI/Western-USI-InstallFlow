import { type Href, useLocalSearchParams, useRouter } from "expo-router";

import { CompletionScreen } from "@/components/whs/whs-ui";

export default function UploadDoneScreen() {
  const { status } = useLocalSearchParams<{ status?: string }>();
  const router = useRouter();

  // Anything still waiting on the office says so; an admin's own upload is already verified.
  const waiting = status === "awaiting-verification" || status === "renewal-in-progress";

  return (
    <CompletionScreen
      title="Document Uploaded"
      message={
        waiting
          ? "Sent to the office for verification.\nYou will be notified once it is approved."
          : "Your document has been saved and verified."
      }
      onDone={() => router.dismissTo("/safety" as Href)}
    />
  );
}
