import { api } from "@usi-installer/backend/convex/_generated/api";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "convex/react";
import { type Href, useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTeamContext } from "@/contexts/team-context";
import { NavCard } from "@/components/nav-card";

const PAGE_SIZE = 4;

function AreaProgressRow({
  area,
  completed,
  total,
  onPress,
}: {
  area: string;
  completed: number;
  total: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="mb-3 flex-row items-center justify-between rounded-2xl border border-[#e2e8f0] bg-white px-4 py-4"
    >
      <Text className="text-[15px] font-bold text-[#1a1c1e]">{area}</Text>
      <View className="flex-row items-center">
        <Text className="text-[14px] font-semibold text-[#2563eb]">
          {completed}/{total} comp
        </Text>
        <Ionicons name="chevron-forward" size={18} color="#2563eb" style={{ marginLeft: 4 }} />
      </View>
    </Pressable>
  );
}

export default function WorkOrdersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { primaryTeam } = useTeamContext();

  const [visibleCount, setVisibleCount] = React.useState(PAGE_SIZE);

  const areaProgress = useQuery(
    api.workorders.byAreaForTeam,
    primaryTeam === undefined
      ? "skip"
      : { team: primaryTeam },
  );
  const rows = areaProgress ?? [];
  const visibleRows = rows.slice(0, visibleCount);
  const canShowMore = visibleCount < rows.length;

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
            <Text className="text-[28px] font-extrabold text-[#1a1c1e]">Work Orders</Text>
            <Text className="mt-1 text-[14px] font-medium text-[#6c7278]">
              Manage and complete your orders
            </Text>
          </View>
          {primaryTeam !== undefined && (
            <View className="mt-1.5 rounded-full bg-[#e8f0ff] px-3 py-1.5">
              <Text className="text-[12px] font-bold text-[#2563eb]">{primaryTeam}</Text>
            </View>
          )}
        </View>

        <View className="mt-5 gap-4 px-4">
          <NavCard
            accent="#2563eb"
            iconTint="#2563eb"
            iconBackground="#e8f0ff"
            icon="document-text"
            title="Browse Work Orders"
            subtitle="View and filter all work orders"
            onPress={() => router.push("/work-orders/browse" as Href)}
          />
          <NavCard
            accent="#f59e0b"
            iconTint="#f59e0b"
            iconBackground="#fef3c7"
            icon="person-add"
            title="Allocate Installs"
            subtitle="Allocate work orders to teams"
            onPress={() => router.push("/work-orders/allocate" as Href)}
          />
          <NavCard
            accent="#7c3aed"
            iconTint="#7c3aed"
            iconBackground="#f3e8ff"
            icon="construct"
            title="Equipment Needed"
            subtitle="View equipment for installs"
            onPress={() => router.push("/work-orders/equipment" as Href)}
          />
          <NavCard
            accent="#16a34a"
            iconTint="#16a34a"
            iconBackground="#e6f7ec"
            icon="clipboard"
            title="Complete Installs"
            subtitle="Choose installation orders to complete"
            onPress={() => router.push("/work-orders/complete" as Href)}
          />
        </View>

        <View className="mt-8 px-4">
          <Text className="text-[18px] font-bold text-[#1a1c1e]">Area Progress</Text>
          <Text className="mt-1 text-[14px] font-medium text-[#6c7278]">
            Track the sites progress by location
          </Text>
        </View>

        <View className="mt-4 px-4">
          {areaProgress === undefined ? (
            <View className="mt-6 items-center">
              <ActivityIndicator color="#2563eb" />
            </View>
          ) : rows.length === 0 ? (
            <Text className="text-[13px] font-medium text-[#6c7278]">
              No allocated work for your team(s) yet.
            </Text>
          ) : (
            visibleRows.map((row) => (
              <AreaProgressRow
                key={row.train_line}
                area={row.train_line}
                completed={row.completed}
                total={row.total}
                onPress={() =>
                  router.push(
                    `/work-orders/area-completed?area=${encodeURIComponent(row.train_line)}` as Href,
                  )
                }
              />
            ))
          )}
        </View>

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
