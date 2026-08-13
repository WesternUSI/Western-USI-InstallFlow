import { api } from "@usi-installer/backend/convex/_generated/api";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { groupWorkOrders, type WorkOrderAreaGroup, type WorkOrderCard } from "@/lib/groupWorkOrders";

const PAGE_SIZE = 5;

function WorkOrderCardView({ card }: { card: WorkOrderCard }) {
  return (
    <View
      className={`mb-4 rounded-3xl bg-white px-5 py-5 ${
        card.priority ? "border-2 border-[#ef4444]" : "border border-[#e2e8f0]"
      }`}
    >
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-2">
          <Text className="text-[19px] font-bold text-[#1a1c1e]">{card.panelNameLabel}</Text>
          <Text className="mt-1 text-[16px] font-medium text-[#6c7278]">{card.site}</Text>
          <Text className="mt-1 text-[15px] font-medium text-[#94a3b8]">{card.panelIdsLabel}</Text>
        </View>
        {card.priority && (
          <View className="rounded-full bg-[#fee2e2] px-3.5 py-1.5">
            <Text className="text-[13px] font-semibold text-[#dc2626]">Priority Pulldown</Text>
          </View>
        )}
      </View>

      <View className="my-4 h-px bg-[#e2e8f0]" />

      <Text className="text-[11px] font-bold tracking-[1px] text-[#94a3b8]">ADVERTISER</Text>
      <Text className="mt-1 text-[17px] font-bold text-[#1a1c1e]">{card.advertisersLabel}</Text>
    </View>
  );
}

function AreaGroupSection({
  group,
  expanded,
  onToggle,
}: {
  group: WorkOrderAreaGroup;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <View className="mb-4">
      <Pressable
        accessibilityRole="button"
        onPress={onToggle}
        className="flex-row items-center justify-between rounded-3xl border border-[#e2e8f0] bg-white px-5 py-5"
      >
        <View>
          <Text className="text-[20px] font-bold text-[#1a1c1e]">{group.area}</Text>
          <View className="mt-2 self-start rounded-full bg-[#e8f0ff] px-3.5 py-1.5">
            <Text className="text-[13px] font-semibold text-[#2563eb]">
              {group.cards.length} {group.cards.length === 1 ? "Location" : "Locations"}
            </Text>
          </View>
        </View>
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={22} color="#94a3b8" />
      </Pressable>

      {expanded && (
        <View className="mt-4">
          {group.cards.map((card) => (
            <WorkOrderCardView key={card.key} card={card} />
          ))}
        </View>
      )}
    </View>
  );
}

export default function BrowseWorkOrdersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const rows = useQuery(api.workorders.listActiveWorkOrders);

  const [expandedAreas, setExpandedAreas] = React.useState<Set<string>>(new Set());
  const [visibleCount, setVisibleCount] = React.useState(PAGE_SIZE);

  const groups = React.useMemo(() => (rows ? groupWorkOrders(rows) : []), [rows]);
  const visibleGroups = groups.slice(0, visibleCount);
  const canShowMore = visibleCount < groups.length;

  const toggleArea = (area: string) => {
    setExpandedAreas((current) => {
      const next = new Set(current);
      if (next.has(area)) {
        next.delete(area);
      } else {
        next.add(area);
      }
      return next;
    });
  };

  return (
    <View className="flex-1 bg-[#f7f9fb]" style={{ paddingTop: insets.top }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-row items-start px-4 pt-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={12}
            onPress={() => router.back()}
            className="mt-1 mr-3"
          >
            <Ionicons name="chevron-back" size={28} color="#1a1c1e" />
          </Pressable>
          <View className="flex-1">
            <Text className="text-[28px] font-extrabold text-[#1a1c1e]">Browse Work Orders</Text>
            <Text className="mt-1 text-[14px] font-medium text-[#6c7278]">
              Access all your work orders
            </Text>
          </View>
        </View>

        {rows === undefined ? (
          <View className="mt-16 items-center">
            <ActivityIndicator color="#2563eb" />
          </View>
        ) : groups.length === 0 ? (
          <Text className="mx-4 mt-8 text-[14px] font-medium text-[#6c7278]">
            No work orders yet.
          </Text>
        ) : (
          <View className="mt-5 px-4">
            {visibleGroups.map((group) => (
              <AreaGroupSection
                key={group.area}
                group={group}
                expanded={expandedAreas.has(group.area)}
                onToggle={() => toggleArea(group.area)}
              />
            ))}
          </View>
        )}

        {canShowMore && (
          <Pressable
            accessibilityRole="button"
            onPress={() => setVisibleCount((count) => count + PAGE_SIZE)}
            className="mx-4 mt-2 h-[52px] items-center justify-center rounded-2xl bg-[#2563eb]"
          >
            <Text className="text-[16px] font-bold text-white">Show More</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}
