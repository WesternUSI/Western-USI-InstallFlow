import { api } from "@usi-installer/backend/convex/_generated/api";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "convex/react";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTeamContext } from "@/contexts/team-context";
import { listWorkOrderCards, type WorkOrderCard } from "@/lib/groupWorkOrders";

function AreaWorkOrderCard({ card, onComplete }: { card: WorkOrderCard; onComplete: () => void }) {
  const isCompleted = card.status === "completed";

  return (
    <View
      className={`mb-3.5 rounded-2xl bg-white px-4 py-4 ${
        card.priority ? "border-2 border-[#ef4444]" : "border border-[#e2e8f0]"
      }`}
    >
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-2">
          <Text className="text-[15px] font-bold text-[#1a1c1e]">{card.panelNameLabel}</Text>
          <Text className="mt-0.5 text-[13px] font-medium text-[#6c7278]">{card.site}</Text>
          <Text className="mt-0.5 text-[12px] font-medium text-[#94a3b8]">
            {card.panelIdsLabel}
          </Text>
        </View>
        <View className="items-end" style={{ gap: 5 }}>
          {isCompleted ? (
            <View className="rounded-full bg-[#dcfce7] px-2.5 py-1">
              <Text className="text-[10px] font-semibold text-[#16a34a]">Completed</Text>
            </View>
          ) : (
            card.assignedTeam.length > 0 && (
              <View className="rounded-full bg-[#e8f0ff] px-2.5 py-1">
                <Text className="text-[10px] font-semibold text-[#2563eb]">
                  {card.assignedTeam.join(" & ")}
                </Text>
              </View>
            )
          )}
          {card.priority && (
            <View className="rounded-full bg-[#fee2e2] px-2.5 py-1">
              <Text className="text-[10px] font-semibold text-[#dc2626]">Priority</Text>
            </View>
          )}
        </View>
      </View>

      <View className="my-3 h-px bg-[#e2e8f0]" />

      <Text className="text-[10px] font-bold tracking-[1px] text-[#94a3b8]">ADVERTISER</Text>
      <Text className="mt-0.5 text-[13px] font-bold text-[#1a1c1e]">{card.advertisersLabel}</Text>

      {!isCompleted && (
        <Pressable
          accessibilityRole="button"
          onPress={onComplete}
          className="mt-3.5 h-[44px] items-center justify-center rounded-xl bg-[#16a34a]"
        >
          <Text className="text-[14px] font-bold text-white">Complete Installation</Text>
        </Pressable>
      )}
    </View>
  );
}

export default function AreaCompletedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { area } = useLocalSearchParams<{ area: string }>();
  const { isLoaded, checkedTeams } = useTeamContext();

  const rows = useQuery(
    api.workorders.listWorkOrdersForArea,
    checkedTeams.size === 0 || !area
      ? "skip"
      : {
          train_line: area,
          teams: [...checkedTeams] as ("Team 1" | "Team 2" | "Team 3" | "Team 4" | "Team 5")[],
        },
  );

  const cards = React.useMemo(() => (rows ? listWorkOrderCards(rows) : []), [rows]);

  const goToDetail = (card: WorkOrderCard) =>
    router.push(
      `/work-orders/install-detail?ids=${encodeURIComponent(card.workOrderIds.join(","))}` as Href,
    );

  const header = (
    <View className="flex-row items-start px-4 pt-2">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={12}
        onPress={() => router.back()}
        className="mt-1 mr-3"
      >
        <Ionicons name="chevron-back" size={24} color="#1a1c1e" />
      </Pressable>
      <View className="flex-1">
        <Text className="text-[22px] font-extrabold text-[#1a1c1e]">{area ?? "Area"}</Text>
        <Text className="mt-0.5 text-[13px] font-medium text-[#6c7278]">
          Track and complete installs in this area
        </Text>
      </View>
    </View>
  );

  const isLoading = !isLoaded || (checkedTeams.size > 0 && rows === undefined);

  return (
    <View className="flex-1 bg-[#f7f9fb]" style={{ paddingTop: insets.top }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
      >
        {header}

        <View className="mt-5 px-4">
          {isLoading ? (
            <View className="mt-12 items-center">
              <ActivityIndicator color="#2563eb" />
            </View>
          ) : cards.length === 0 ? (
            <Text className="text-[13px] font-medium text-[#6c7278]">
              No allocated or completed installs in this area yet.
            </Text>
          ) : (
            cards.map((card) => (
              <AreaWorkOrderCard key={card.key} card={card} onComplete={() => goToDetail(card)} />
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}
