import { type Href, useRouter } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";

import { ListCard, WhsHeader, WhsScreen } from "@/components/whs/whs-ui";
import { useEquipmentChecks } from "@/hooks/use-equipment-checks";
import { formatIsoDate } from "@/lib/whs-format";

/** The height and safety equipment checks assigned to the worker (decision AD49). */
export default function EquipmentChecksScreen() {
  const router = useRouter();
  const { items, isLoading } = useEquipmentChecks();

  return (
    <WhsScreen>
      <WhsHeader title="Equipment Checks" subtitle="Ladders and safety steps to check" />

      {isLoading ? (
        <ActivityIndicator className="mt-10" />
      ) : (
        <View className="gap-4">
          {(items ?? []).map((check) => (
            <ListCard
              key={check.id}
              title={check.title}
              subtitle={check.subtitle}
              label="Check by"
              value={formatIsoDate(check.due)}
              status={check.status}
              onPress={() => router.push(`/safety/equipment-check?check=${check.id}` as Href)}
            />
          ))}
          {(items ?? []).length === 0 ? (
            <Text className="py-6 text-center text-[14px] text-[#64748b]">No equipment checks are assigned to you.</Text>
          ) : null}
        </View>
      )}
    </WhsScreen>
  );
}
