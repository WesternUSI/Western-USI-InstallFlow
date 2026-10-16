import { api } from "@usi-installer/backend/convex/_generated/api";
import type { Id } from "@usi-installer/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { type SignatureData, SignaturePad, SignatureView } from "@/components/whs/signature-pad";
import { PrimaryButton, WhsHeader, WhsScreen } from "@/components/whs/whs-ui";
import { toUserMessage } from "@/lib/errors";
import { useAppToast } from "@/lib/toast";

/**
 * "Acknowledge & Sign" (decision D1): one screen for a document version
 * (`?version=`) and for an on-site SWMS change (`?change=`). The worker draws
 * their signature once; after that it is shown here and reused, and they can
 * redraw it.
 */
export default function SignScreen() {
  const router = useRouter();
  const { version, change, title } = useLocalSearchParams<{ version?: string; change?: string; title?: string }>();
  const saved = useQuery(api.documents.mySignature);
  const saveSignature = useMutation(api.documents.saveSignature);
  const acknowledge = useMutation(api.documents.acknowledge);
  const signChange = useMutation(api.documents.signChange);
  const { showError, showSuccess } = useAppToast();

  const [redraw, setRedraw] = useState(false);
  const [drawn, setDrawn] = useState<SignatureData | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  const drawing = saved === null || redraw;
  const isChange = change !== undefined;
  const statement = isChange
    ? `I have been briefed on this on-site change to ${title ?? "the SWMS"} and will follow the revised controls.`
    : `I have read and understood ${title ?? "this document"} and will follow it.`;

  const handleSign = async () => {
    if (drawing && drawn === null) {
      setError("Draw your signature in the box.");
      showError("Draw your signature in the box.");
      return;
    }

    setSubmitting(true);
    try {
      if (drawing && drawn !== null) await saveSignature(drawn);
      if (isChange) {
        await signChange({ change_id: change as Id<"swms_changes"> });
        showSuccess("Change signed");
      } else {
        await acknowledge({ version_id: version as Id<"whs_document_versions"> });
        showSuccess("Acknowledged and signed");
      }
      router.back();
    } catch (caught) {
      showError(toUserMessage(caught, "Could not save your signature. Please try again."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <WhsScreen scroll={false}>
      <WhsHeader
        title={isChange ? "Sign On-site Change" : "Acknowledge & Sign"}
        subtitle="Your signature is saved with the date and time"
      />

      {saved === undefined ? (
        <ActivityIndicator className="mt-10" />
      ) : (
        <View className="gap-4">
          <View className="rounded-[16px] border border-[#e0e2ec] bg-white p-4">
            <Text className="text-[15px] leading-6 text-[#191b23]">{statement}</Text>
          </View>

          {drawing ? (
            <SignaturePad
              onChange={(signature) => {
                setDrawn(signature);
                if (signature !== null) setError(undefined);
              }}
              error={error}
            />
          ) : (
            <View className="gap-2">
              <Text className="text-[14px] font-medium text-[#374151]">Your saved signature</Text>
              <SignatureView signature={saved} />
              <Pressable accessibilityRole="button" onPress={() => setRedraw(true)} className="self-end px-1 py-1">
                <Text className="text-[14px] font-semibold text-[#2563eb]">Draw a new signature</Text>
              </Pressable>
            </View>
          )}

          {submitting ? (
            <View className="items-center py-[14px]">
              <ActivityIndicator />
            </View>
          ) : (
            <PrimaryButton label={isChange ? "Sign Change" : "Acknowledge & Sign"} onPress={() => void handleSign()} />
          )}
        </View>
      )}
    </WhsScreen>
  );
}
