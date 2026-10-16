import { type Href, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import { ListCard, SearchField, WhsHeader, WhsScreen } from "@/components/whs/whs-ui";
import { useKits } from "@/hooks/use-kits";
import { formatIsoDate } from "@/lib/whs-format";

export default function KitsScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const { items, isLoading } = useKits();

  const needle = query.trim().toLowerCase();
  const kits = (items ?? []).filter((kit) => `${kit.code} ${kit.location}`.toLowerCase().includes(needle));

  return (
    <WhsScreen>
      <WhsHeader title="First-Aid Kits" subtitle="Keep the kits up-to-date" />

      {isLoading ? (
        <ActivityIndicator className="mt-10" />
      ) : (
        <View className="gap-4">
          <SearchField placeholder="Search by kit or location" value={query} onChangeText={setQuery} />
          {kits.map((kit) => (
            <ListCard
              key={kit.id}
              title={`Kit ${kit.code}`}
              subtitle={kit.location}
              label="Next inspection"
              value={formatIsoDate(kit.next_inspection)}
              status={kit.status}
              onPress={() => router.push(`/safety/kit/${kit.id}` as Href)}
            />
          ))}
          {kits.length === 0 ? (
            <Text className="py-6 text-center text-[14px] text-[#64748b]">
              {(items ?? []).length === 0 ? "No kits are assigned to you." : "No kits match your search."}
            </Text>
          ) : null}
        </View>
      )}
    </WhsScreen>
  );
}
