import { api } from "@usi-installer/backend/convex/_generated/api";
import type { Id } from "@usi-installer/backend/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, View } from "react-native";

import { NotesCard, PrimaryButton, WhsHeader, WhsScreen } from "@/components/whs/whs-ui";
import { toUserMessage } from "@/lib/errors";
import { useAppToast } from "@/lib/toast";

const LIMIT = 1000;

/** "Raise Concern or Question" on a document (decision D2). Stored, and the office is emailed. */
export default function ConcernScreen() {
  const router = useRouter();
  const { document, title } = useLocalSearchParams<{ document: string; title?: string }>();
  const raiseConcern = useMutation(api.documents.raiseConcern);
  const { showError, showSuccess } = useAppToast();

  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  const handleSend = async () => {
    if (message.trim() === "") {
      setError("Write your concern or question first.");
      showError("Write your concern or question first.");
      return;
    }

    setSubmitting(true);
    try {
      await raiseConcern({ document_id: document as Id<"whs_documents">, message: message.trim() });
      showSuccess("Sent to the office", "They'll follow up with you.");
      router.back();
    } catch (caught) {
      showError(toUserMessage(caught, "Could not send your message. Please try again."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <WhsScreen>
      <WhsHeader title="Raise Concern or Question" subtitle={title ?? "About this document"} />

      <View className="gap-4">
        <NotesCard
          label="Your concern or question"
          placeholder="What is unclear, wrong or unsafe?"
          value={message}
          onChangeText={(text) => {
            setMessage(text.slice(0, LIMIT));
            setError(undefined);
          }}
          error={error}
        />
        {submitting ? (
          <View className="items-center py-[14px]">
            <ActivityIndicator />
          </View>
        ) : (
          <PrimaryButton label="Send to the Office" onPress={() => void handleSend()} />
        )}
      </View>
    </WhsScreen>
  );
}
