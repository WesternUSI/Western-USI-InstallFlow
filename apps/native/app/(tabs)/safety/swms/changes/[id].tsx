import { api } from "@usi-installer/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Image, Text, View } from "react-native";

import { ChangeStatePill } from "@/components/whs/doc-screens";
import { AlertBanner, DetailCard, PrimaryButton, WhsHeader, WhsScreen } from "@/components/whs/whs-ui";
import { formatIsoDate } from "@/lib/whs-format";

function signedAt(time: number) {
  const date = new Date(time);
  const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return `${formatIsoDate(iso)} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/** One on-site change to a SWMS (decision D3): what was recorded, who has signed, and the office's review. */
export default function SwmsChangeDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const change = useQuery(api.documents.changeDetail, { change_id: id ?? "" });

  if (change === undefined || change === null) {
    return (
      <WhsScreen>
        <WhsHeader title="On-site Change" subtitle="Dynamic SWMS review" />
        {change === undefined ? (
          <ActivityIndicator className="mt-10" />
        ) : (
          <Text className="text-[15px] text-[#4b5563]">This change could not be found.</Text>
        )}
      </WhsScreen>
    );
  }

  const rows: Parameters<typeof DetailCard>[0]["rows"] = [
    {
      pair: [
        { label: "Date", value: formatIsoDate(change.date) },
        { label: "Time", value: change.time },
      ],
    },
    {
      pair: [
        { label: "Risk before", value: change.risk_before },
        { label: "Risk after", value: change.risk_after },
      ],
    },
    { label: "Additional control / revised method", value: change.control },
    { label: "Approved / briefed by", value: change.approved_by },
    { label: "Recorded by", value: change.reported_by_name },
  ];
  if (change.trigger) rows.push({ label: "What triggered it", value: change.trigger });
  if (change.site) rows.push({ label: "Site", value: change.site });
  if (change.notes) rows.push({ label: "Notes", value: change.notes });

  return (
    <WhsScreen>
      <WhsHeader
        title="On-site Change"
        subtitle={change.version ? `${change.document_title} ${change.version}` : change.document_title}
      />

      <View className="flex-row justify-end pb-3">
        <ChangeStatePill state={change.state} />
      </View>
      <DetailCard title={change.change} rows={rows} />

      <View className="mt-4 gap-4">
        {change.state === "sent-back" ? (
          <AlertBanner
            tone="danger"
            text={`Sent back by the office: ${change.review_reason ?? "no reason given"}. Review the controls and record the change again.`}
          />
        ) : null}
        {change.state === "awaiting-review" ? (
          <AlertBanner tone="warning" text="The office has been told and will review this change. Work can continue." />
        ) : null}

        {change.photos.length > 0 ? (
          <View className="flex-row flex-wrap gap-3">
            {change.photos.map((url) => (
              <Image key={url} source={{ uri: url }} className="h-[100px] w-[100px] rounded-[12px]" />
            ))}
          </View>
        ) : null}

        <View className="rounded-[16px] border border-[#e0e2ec] bg-white p-4">
          <Text className="text-[11px] font-semibold uppercase tracking-[0.6px] text-[#64748b]">Signed by</Text>
          {change.signoffs.length === 0 ? (
            <Text className="mt-2 text-[14px] text-[#4b5563]">No one has signed yet.</Text>
          ) : (
            change.signoffs.map((signoff) => (
              <View key={`${signoff.name}-${signoff.signed_at}`} className="mt-2 flex-row justify-between">
                <Text className="text-[14px] text-[#191b23]">{signoff.name}</Text>
                <Text className="text-[13px] text-[#64748b]">{signedAt(signoff.signed_at)}</Text>
              </View>
            ))
          )}
        </View>

        {change.signed_by_me ? (
          <AlertBanner tone="success" text="You've signed this change." />
        ) : (
          <PrimaryButton
            label="Sign This Change"
            onPress={() =>
              router.push(
                `/safety/sign?change=${change.id}&title=${encodeURIComponent(change.document_title)}` as Href,
              )
            }
          />
        )}
      </View>
    </WhsScreen>
  );
}
