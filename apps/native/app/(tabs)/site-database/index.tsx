import { api } from "@usi-installer/backend/convex/_generated/api";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "convex/react";
import { type Href, useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const PAGE_SIZE = 7;

export default function SiteDatabaseScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const sites = useQuery(api.sites.listSites);

  const [locationQuery, setLocationQuery] = React.useState("");
  const [panelQuery, setPanelQuery] = React.useState("");
  const [visibleCount, setVisibleCount] = React.useState(PAGE_SIZE);

  const filtered = React.useMemo(() => {
    if (!sites) {
      return [];
    }

    const location = locationQuery.trim().toLowerCase();
    const panel = panelQuery.trim().toLowerCase();

    return sites.filter((site) => {
      const matchesLocation =
        !location ||
        site.area.toLowerCase().includes(location) ||
        site.site.toLowerCase().includes(location);
      const matchesPanel = !panel || site.panel_id.toLowerCase().includes(panel);
      return matchesLocation && matchesPanel;
    });
  }, [sites, locationQuery, panelQuery]);

  React.useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [locationQuery, panelQuery]);

  const visibleSites = filtered.slice(0, visibleCount);
  const canShowMore = visibleCount < filtered.length;

  return (
    <View className="flex-1 bg-[#f7f9fb]" style={{ paddingTop: insets.top }}>
      <KeyboardAwareScrollView
        contentContainerStyle={{ paddingBottom: 28 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bottomOffset={24}
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
            <Text className="text-[28px] font-extrabold text-[#1a1c1e]">Site Database</Text>
            <Text className="mt-1 text-[14px] font-medium text-[#6c7278]">
              Search and manage all sites
            </Text>
          </View>
        </View>

        <View
          className="mx-4 mt-5 rounded-2xl bg-white px-4 py-4"
          style={{
            shadowColor: "#0f172a",
            shadowOpacity: 0.06,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 4 },
            elevation: 2,
          }}
        >
          <View className="mb-4">
            <View className="mb-2 flex-row items-center">
              <Ionicons name="location" size={18} color="#2563eb" />
              <Text className="ml-2 text-[14px] font-semibold text-[#1a1c1e]">
                Search by Location
              </Text>
            </View>
            <View className="flex-row items-center rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-3">
              <TextInput
                className="h-[46px] flex-1 text-[14px] font-medium text-[#1a1c1e]"
                placeholder="e.g. Yanchep"
                placeholderTextColor="#acb5bb"
                value={locationQuery}
                onChangeText={setLocationQuery}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Ionicons name="search" size={18} color="#94a3b8" />
            </View>
          </View>

          <View>
            <View className="mb-2 flex-row items-center">
              <Ionicons name="card" size={18} color="#2563eb" />
              <Text className="ml-2 text-[14px] font-semibold text-[#1a1c1e]">
                Search by Panel ID
              </Text>
            </View>
            <View className="flex-row items-center rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-3">
              <TextInput
                className="h-[46px] flex-1 text-[14px] font-medium text-[#1a1c1e]"
                placeholder="e.g. TALK03"
                placeholderTextColor="#acb5bb"
                value={panelQuery}
                onChangeText={setPanelQuery}
                autoCapitalize="characters"
                autoCorrect={false}
              />
              <Ionicons name="search" size={18} color="#94a3b8" />
            </View>
          </View>
        </View>

        <Text className="mx-4 mt-6 text-[18px] font-bold text-[#1a1c1e]">Site Locations</Text>

        {sites === undefined ? (
          <View className="mt-10 items-center">
            <ActivityIndicator color="#2563eb" />
          </View>
        ) : visibleSites.length === 0 ? (
          <Text className="mx-4 mt-6 text-[14px] font-medium text-[#6c7278]">
            No sites match your search.
          </Text>
        ) : (
          <View className="mt-3 gap-3 px-4">
            {visibleSites.map((site) => (
              <Pressable
                key={site._id}
                accessibilityRole="button"
                onPress={() =>
                  router.push({
                    pathname: "/site-database/[id]",
                    params: { id: site._id },
                  } as Href)
                }
                className="rounded-2xl border border-[#e2e8f0] bg-white px-4 py-4"
              >
                <View className="flex-row items-center">
                  <View className="flex-1 pr-3">
                    <Text className="text-[15px] font-bold leading-5 text-[#1a1c1e]">
                      {site.site}
                    </Text>
                    <Text className="mt-1 text-[13px] font-medium text-[#6c7278]">{site.area}</Text>
                    <Text className="mt-2 text-[12px] font-medium text-[#94a3b8]">
                      {site.panel_id}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#cbd5e1" />
                </View>
              </Pressable>
            ))}
          </View>
        )}

        {canShowMore && (
          <Pressable
            accessibilityRole="button"
            onPress={() => setVisibleCount((count) => count + PAGE_SIZE)}
            className="mx-4 mt-5 h-[52px] items-center justify-center rounded-2xl bg-[#2563eb]"
          >
            <Text className="text-[16px] font-bold text-white">Show More</Text>
          </Pressable>
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}
