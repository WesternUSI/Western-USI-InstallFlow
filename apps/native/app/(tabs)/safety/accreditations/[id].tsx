import { Ionicons } from "@expo/vector-icons";
import { api } from "@usi-installer/backend/convex/_generated/api";
import type { Id } from "@usi-installer/backend/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Image, Linking, Pressable, Text, View } from "react-native";

import { AlertBanner, DetailCard, PrimaryButton, WhsHeader, WhsScreen } from "@/components/whs/whs-ui";
import { actionLabel } from "@/lib/accreditation-text";
import { formatIsoDate } from "@/lib/whs-format";

const NOT_RECORDED = "Not Recorded";

export default function AccreditationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const item = useQuery(api.accreditations.detail, { type_id: id as Id<"accreditation_types"> });

  if (item === undefined) {
    return (
      <WhsScreen>
        <WhsHeader title="Accreditation" subtitle="View details of accreditation" />
        <ActivityIndicator className="mt-10" />
      </WhsScreen>
    );
  }

  if (item === null) {
    return (
      <WhsScreen>
        <WhsHeader title="Accreditation" subtitle="View details of accreditation" />
        <Text className="text-[15px] text-[#4b5563]">This accreditation could not be found.</Text>
      </WhsScreen>
    );
  }

  const verified =
    item.verified_by_name !== undefined && item.verified_at !== undefined
      ? `${item.verified_by_name}, ${formatIsoDate(new Date(item.verified_at).toISOString().slice(0, 10))}`
      : "Not yet verified";
  const isImage = item.evidence?.content_type?.startsWith("image/") ?? false;

  return (
    <WhsScreen>
      <WhsHeader title="Accreditation" subtitle="View details of accreditation" />

      <DetailCard
        title={item.name}
        status={item.status}
        rows={[
          { label: "Card / license no.", value: item.number ?? NOT_RECORDED },
          {
            pair: [
              { label: "Issued", value: item.issued ? formatIsoDate(item.issued) : NOT_RECORDED },
              {
                label: "Expires",
                value: item.no_expiry ? "No expiry" : item.expires ? formatIsoDate(item.expires) : NOT_RECORDED,
              },
            ],
          },
          { label: "Verified", value: verified },
        ]}
      />

      <View className="mt-4 gap-4">
        {item.status === "action-required" ? (
          <AlertBanner
            tone="danger"
            text={item.rejected_reason ? `Rejected: ${item.rejected_reason}` : "The office sent this back. Please upload a corrected copy."}
          />
        ) : null}
        {item.status === "awaiting-verification" || item.status === "renewal-in-progress" ? (
          <AlertBanner tone="warning" text="Sent to the office. You'll be notified once it's approved." />
        ) : null}

        {item.evidence !== null && item.evidence.url !== null ? (
          isImage ? (
            <Image
              source={{ uri: item.evidence.url }}
              className="h-[180px] w-full rounded-[16px] border border-[#e5e5e5]"
              resizeMode="cover"
            />
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() => void Linking.openURL(item.evidence?.url ?? "")}
              className="flex-row items-center rounded-[16px] border border-[#e5e5e5] bg-white p-4"
            >
              <Ionicons name="document-text-outline" size={28} color="#dc2626" />
              <Text className="ml-3 flex-1 text-[14px] font-medium text-[#111827]" numberOfLines={1}>
                {item.evidence.file_name}
              </Text>
              <Text className="text-[13px] font-semibold text-[#2563eb]">Open</Text>
            </Pressable>
          )
        ) : null}

        <PrimaryButton
          label={actionLabel(item)}
          onPress={() => router.push(`/safety/accreditations/upload?type=${item.type_id}` as Href)}
        />
      </View>
    </WhsScreen>
  );
}
