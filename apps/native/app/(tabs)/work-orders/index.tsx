import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { NavCard } from "@/components/nav-card";

/** Placeholder rows — real per-area counts land once work order querying/grouping is wired up. */
const STATIC_AREA_PROGRESS = [
  { area: "Mandurah Line", completed: 1, total: 5 },
  { area: "Yanchep Line", completed: 1, total: 4 },
  { area: "Midland Yard", completed: 3, total: 7 },
  { area: "Fremantle Bridge", completed: 4, total: 6 },
];

function AreaProgressRow({
  area,
  completed,
  total,
}: {
  area: string;
  completed: number;
  total: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
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
          />
          <NavCard
            accent="#16a34a"
            iconTint="#16a34a"
            iconBackground="#e6f7ec"
            icon="clipboard"
            title="Complete Installs"
            subtitle="Choose installation orders to complete"
          />
        </View>

        <View className="mt-8 px-4">
          <Text className="text-[18px] font-bold text-[#1a1c1e]">Area Progress</Text>
          <Text className="mt-1 text-[14px] font-medium text-[#6c7278]">
            Track the sites progress by location
          </Text>
        </View>

        <View className="mt-4 px-4">
          {STATIC_AREA_PROGRESS.map((row) => (
            <AreaProgressRow key={row.area} {...row} />
          ))}
        </View>

        <Pressable
          accessibilityRole="button"
          className="mx-4 mt-2 h-[52px] items-center justify-center rounded-2xl bg-[#2563eb]"
        >
          <Text className="text-[16px] font-bold text-white">Show More</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
