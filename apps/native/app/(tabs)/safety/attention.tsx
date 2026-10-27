import { type Href, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

import { PrimaryButton, StatusPill, WhsHeader, WhsScreen } from "@/components/whs/whs-ui";
import { documentHref } from "@/components/whs/doc-screens";
import { useWhsAttention } from "@/hooks/use-whs-attention";
import { actionLabel, attentionText } from "@/lib/accreditation-text";
import { formatIsoDate } from "@/lib/whs-format";
import type { KitItem } from "@/hooks/use-kits";

/** What the card says about a kit that needs attention. */
function kitText(kit: KitItem): string {
  const due = formatIsoDate(kit.next_inspection);
  switch (kit.status) {
    case "action-required":
      return `Issue found ${formatIsoDate(kit.open_issue?.date ?? kit.next_inspection)}. Fix it and mark it resolved.`;
    case "overdue":
      return `Inspection was due ${due} - ${kit.location}.`;
    default:
      return `Inspection due ${due} - ${kit.location}.`;
  }
}

function Card({
  title,
  text,
  status,
  action,
  onPress,
}: {
  title: string;
  text: string;
  status: React.ComponentProps<typeof StatusPill>["status"];
  action: string;
  onPress: () => void;
}) {
  return (
    <View className="rounded-[16px] border border-[#e5e7eb] bg-white p-[18px]">
      <View className="flex-row items-start justify-between gap-3">
        <Text className="flex-1 text-[16px] font-semibold leading-6 text-[#111827]">{title}</Text>
        <StatusPill status={status} />
      </View>
      <Text className="mt-3 text-[15px] leading-5 text-[#4b5563]">{text}</Text>
      <View className="mt-4">
        <PrimaryButton compact label={action} onPress={onPress} />
      </View>
    </View>
  );
}

/** The filter chips, in order. Each item belongs to exactly one. */
type Group = "action-required" | "overdue" | "missing" | "due-soon" | "to-sign";
const GROUPS: { id: Group; label: string }[] = [
  { id: "action-required", label: "Action required" },
  { id: "overdue", label: "Overdue" },
  { id: "missing", label: "Missing" },
  { id: "due-soon", label: "Due soon" },
  { id: "to-sign", label: "To sign" },
];

function groupOf(status: string): Group {
  if (status === "expired" || status === "overdue") return "overdue";
  if (status === "missing") return "missing";
  if (status === "due-soon") return "due-soon";
  return "action-required";
}

function Chip({ label, count, active, onPress }: { label: string; count: number; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      className="h-9 flex-row items-center rounded-full border px-4"
      style={{ backgroundColor: active ? "#2563eb" : "#ffffff", borderColor: active ? "#2563eb" : "#e5e7eb" }}
    >
      <Text className="text-[14px] font-semibold" style={{ color: active ? "#ffffff" : "#374151" }}>
        {label} {count}
      </Text>
    </Pressable>
  );
}

/**
 * Needs Attention: everything the worker has to act on, most urgent first.
 * Chips at the top filter it by what kind of action; a chip with nothing in
 * it is hidden.
 */
export default function AttentionScreen() {
  const router = useRouter();
  const { accreditations, documents, changes, kits, count, isLoading } = useWhsAttention();
  const [filter, setFilter] = useState<Group | "all">("all");

  const counts: Record<Group, number> = {
    "action-required": 0,
    overdue: 0,
    missing: 0,
    "due-soon": 0,
    "to-sign": documents.length + changes.length,
  };
  for (const item of accreditations) counts[groupOf(item.status)]++;
  for (const kit of kits) counts[groupOf(kit.status)]++;
  const visible = GROUPS.filter((group) => counts[group.id] > 0);
  // A chip whose items have all been dealt with falls back to All.
  const active = filter !== "all" && counts[filter] === 0 ? "all" : filter;
  const show = (group: Group) => active === "all" || active === group;

  return (
    <WhsScreen>
      <WhsHeader title="Needs Attention" subtitle="Cases needing urgent actions" />

      {isLoading ? (
        <ActivityIndicator className="mt-10" />
      ) : (
        <View className="gap-4">
          {visible.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              <Chip label="All" count={count} active={active === "all"} onPress={() => setFilter("all")} />
              {visible.map((group) => (
                <Chip key={group.id} label={group.label} count={counts[group.id]} active={active === group.id} onPress={() => setFilter(group.id)} />
              ))}
            </ScrollView>
          ) : null}
          {accreditations
            .filter((item) => show(groupOf(item.status)))
            .map((item) => (
              <Card
                key={item.type_id}
                title={item.name}
                text={attentionText(item)}
                status={item.status}
                action={actionLabel(item)}
                onPress={() => router.push(`/safety/accreditations/upload?type=${item.type_id}` as Href)}
              />
            ))}
          {(show("to-sign") ? documents : []).map((item) => (
            <Card
              key={item.id}
              title={item.title}
              text={
                item.supersedes
                  ? `New version ${item.version} issued ${formatIsoDate(item.issued)}. Read and acknowledge.`
                  : `${item.version} issued ${formatIsoDate(item.issued)}. Read and acknowledge.`
              }
              status="action-required"
              action="Read & Acknowledge"
              onPress={() => router.push(documentHref(item))}
            />
          ))}
          {(show("to-sign") ? changes : []).map((change) => (
            <Card
              key={change.id}
              title={`On-site change: ${change.document_title}`}
              text={`Recorded ${formatIsoDate(change.date)} ${change.time}: ${change.change}`}
              status="action-required"
              action="Read & Sign"
              onPress={() => router.push(`/safety/swms/changes/${change.id}` as Href)}
            />
          ))}
          {kits
            .filter((kit) => show(groupOf(kit.status)))
            .map((kit) => (
              <Card
                key={kit.id}
                title={`Kit ${kit.code} inspection`}
                text={kitText(kit)}
                status={kit.status}
                action={kit.status === "action-required" ? "Resolve Issue" : "Complete Inspection"}
                onPress={() =>
                  router.push(
                    (kit.status === "action-required" ? `/safety/kit/${kit.id}` : `/safety/kit-inspection?kit=${kit.id}`) as Href,
                  )
                }
              />
            ))}
          {count === 0 ? (
            <Text className="py-6 text-center text-[14px] text-[#64748b]">Nothing needs your attention.</Text>
          ) : null}
        </View>
      )}
    </WhsScreen>
  );
}
