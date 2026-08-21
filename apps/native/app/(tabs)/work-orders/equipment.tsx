import { api } from "@usi-installer/backend/convex/_generated/api";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTeamContext } from "@/contexts/team-context";

function EquipmentRow({ name, isLast }: { name: string; isLast: boolean }) {
  return (
    <View className={`px-4 py-4 ${isLast ? "" : "border-b border-[#f1f5f9]"}`}>
      <Text className="text-[15px] font-bold text-[#1a1c1e]">{name}</Text>
    </View>
  );
}

/** Read-only — always scoped to the installer's primary team, never editable here. */
export default function EquipmentNeededScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isLoaded, primaryTeam } = useTeamContext();

  const equipment = useQuery(
    api.workorders.equipmentNeeded,
    primaryTeam === undefined
      ? "skip"
      : { team: primaryTeam as "Team 1" | "Team 2" | "Team 3" | "Team 4" | "Team 5" },
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
        <Text className="text-[22px] font-extrabold text-[#1a1c1e]">Equipment Needed</Text>
        <Text className="mt-0.5 text-[13px] font-medium text-[#6c7278]">
          Equipments required for the day
        </Text>
      </View>
    </View>
  );

  if (!isLoaded) {
    return (
      <View className="flex-1 bg-[#f7f9fb]" style={{ paddingTop: insets.top }}>
        {header}
        <View className="mt-16 items-center">
          <ActivityIndicator color="#2563eb" />
        </View>
      </View>
    );
  }

  if (primaryTeam === undefined) {
    return (
      <View className="flex-1 bg-[#f7f9fb]" style={{ paddingTop: insets.top }}>
        {header}
        <View className="mx-4 mt-8 rounded-2xl border border-[#fde68a] bg-[#fffbeb] px-5 py-6">
          <Text className="text-[15px] font-bold text-[#92400e]">No primary team assigned</Text>
          <Text className="mt-2 text-[13px] font-medium text-[#92400e]">
            Ask your admin to assign your primary team before viewing equipment.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#f7f9fb]" style={{ paddingTop: insets.top }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
      >
        {header}

        <View className="mt-5 px-4">
          {equipment === undefined ? (
            <View className="mt-12 items-center">
              <ActivityIndicator color="#2563eb" />
            </View>
          ) : equipment.length === 0 ? (
            <Text className="text-[13px] font-medium text-[#6c7278]">
              No equipment needed — nothing allocated yet.
            </Text>
          ) : (
            <View className="overflow-hidden rounded-2xl border border-[#e2e8f0] bg-white">
              <View className="border-b border-[#e2e8f0] bg-[#f7f9fb] px-4 py-3">
                <Text className="text-[12px] font-semibold text-[#6c7278]">Equipment</Text>
              </View>
              {equipment.map((name, index) => (
                <EquipmentRow key={name} name={name} isLast={index === equipment.length - 1} />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
