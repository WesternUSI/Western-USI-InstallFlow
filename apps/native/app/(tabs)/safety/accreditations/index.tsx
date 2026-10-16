import { type Href, useRouter } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";

import { useAccreditations } from "@/hooks/use-accreditations";
import { ListCard, WhsHeader, WhsScreen } from "@/components/whs/whs-ui";
import { listSubtitle, listValue } from "@/lib/accreditation-text";

export default function AccreditationsScreen() {
  const router = useRouter();
  const { data, isLoading } = useAccreditations();

  return (
    <WhsScreen>
      <WhsHeader title="My Accreditations" subtitle="Manage your licenses and documents" />

      {isLoading ? (
        <ActivityIndicator className="mt-10" />
      ) : (
        <>
          <Text className="mb-4 pl-1 text-[15px] font-semibold leading-6 text-[#1a1b24]">{data?.worker_name}</Text>

          <View className="gap-4">
            {data?.items.map((item) => (
              <ListCard
                key={item.type_id}
                title={item.name}
                subtitle={listSubtitle(item)}
                label="Action"
                value={listValue(item)}
                status={item.status}
                onPress={() => router.push(`/safety/accreditations/${item.type_id}` as Href)}
              />
            ))}
            {data?.items.length === 0 ? (
              <Text className="py-6 text-center text-[14px] text-[#64748b]">
                Nothing is required of you yet.
              </Text>
            ) : null}
          </View>
        </>
      )}
    </WhsScreen>
  );
}
