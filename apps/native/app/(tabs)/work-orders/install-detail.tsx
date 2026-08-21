import { api } from "@usi-installer/backend/convex/_generated/api";
import type { Id } from "@usi-installer/backend/convex/_generated/dataModel";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "convex/react";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function Chip({ label }: { label: string }) {
  return (
    <View className="mr-2 mb-2 rounded-full bg-[#eef2ff] px-3 py-1.5">
      <Text className="text-[13px] font-semibold text-[#4338ca]">{label}</Text>
    </View>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="mt-4 px-4">
      <Text className="mb-2 text-[11px] font-bold tracking-[1px] text-[#94a3b8]">{label}</Text>
      {children}
    </View>
  );
}

export default function InstallDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { ids: idsParam } = useLocalSearchParams<{ ids: string }>();
  const ids = (idsParam ?? "").split(",").filter(Boolean) as Id<"workorders">[];

  const detail = useQuery(
    api.workorders.getWorkOrderDetail,
    ids.length === 0 ? "skip" : { ids },
  );

  const openMaps = () => {
    if (!detail?.location) return;
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${detail.location}`);
  };

  const openNavigate = () => {
    if (!detail?.location) return;
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${detail.location}`);
  };

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
        <Text className="text-[22px] font-extrabold text-[#1a1c1e]">Install Detail</Text>
        <Text className="mt-0.5 text-[13px] font-medium text-[#6c7278]">
          View details of installation
        </Text>
      </View>
    </View>
  );

  if (detail === undefined) {
    return (
      <View className="flex-1 bg-[#f7f9fb]" style={{ paddingTop: insets.top }}>
        {header}
        <View className="mt-16 items-center">
          <ActivityIndicator color="#2563eb" />
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

        <View className="mx-4 mt-5 rounded-2xl border border-[#e2e8f0] bg-white px-4 py-4">
          <View className="flex-row items-start justify-between">
            <View className="flex-1 pr-2">
              <Text className="text-[17px] font-bold text-[#1a1c1e]">{detail.panel_name}</Text>
              <Text className="mt-0.5 text-[14px] font-medium text-[#6c7278]">{detail.site}</Text>
              <Text className="mt-0.5 text-[12px] font-medium text-[#94a3b8]">
                {detail.panel_split}
              </Text>
            </View>
            {detail.priority && (
              <View className="rounded-full bg-[#fee2e2] px-3 py-1.5">
                <Text className="text-[11px] font-semibold text-[#dc2626]">
                  Priority Pulldown
                </Text>
              </View>
            )}
          </View>

          <View className="my-4 h-px bg-[#e2e8f0]" />

          <View className="flex-row">
            <View className="flex-1">
              <Text className="text-[10px] font-bold tracking-[1px] text-[#94a3b8]">
                ADVERTISER
              </Text>
              <Text className="mt-1 text-[13px] font-semibold text-[#1a1c1e]">
                {detail.advertiser_campaign || "—"}
              </Text>
            </View>
            <View className="flex-1">
              <Text className="text-[10px] font-bold tracking-[1px] text-[#94a3b8]">
                EXISTING
              </Text>
              <Text className="mt-1 text-[13px] font-semibold text-[#1a1c1e]">
                {detail.existing_advertiser || "—"}
              </Text>
            </View>
          </View>

          {!!detail.comments && (
            <>
              <View className="my-4 h-px bg-[#e2e8f0]" />
              <Text className="text-[10px] font-bold tracking-[1px] text-[#94a3b8]">
                COMMENTS
              </Text>
              <Text className="mt-1 text-[13px] font-medium text-[#1a1c1e]">
                {detail.comments}
              </Text>
            </>
          )}
        </View>

        {detail.equipment_needed.length > 0 && (
          <Section label="EQUIPMENT REQUIRED">
            <View className="flex-row flex-wrap">
              {detail.equipment_needed.map((item) => (
                <Chip key={item} label={item} />
              ))}
            </View>
          </Section>
        )}

        {!!detail.install_notes && (
          <Section label="INSTALLATION NOTES">
            <View className="flex-row flex-wrap">
              <Chip label={detail.install_notes} />
            </View>
          </Section>
        )}

        {detail.quantity > 0 && (
          <Section label="PANEL QUANTITY">
            <View className="flex-row flex-wrap">
              <Chip label={`${detail.quantity} Panels`} />
            </View>
          </Section>
        )}

        {!!detail.size && (
          <Section label="SIZE">
            <View className="flex-row flex-wrap">
              <Chip label={detail.size} />
            </View>
          </Section>
        )}

        <View className="mx-4 mt-5 rounded-2xl border border-[#e2e8f0] bg-white px-4 py-4">
          {detail.images.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {detail.images.map((image) => (
                <View
                  key={image.storage_id}
                  className="mr-3 overflow-hidden rounded-2xl bg-[#e2e8f0]"
                  style={{ width: 150, height: 110 }}
                >
                  <Image
                    source={{ uri: image.url }}
                    style={{ width: "100%", height: "100%" }}
                    resizeMode="cover"
                  />
                </View>
              ))}
            </ScrollView>
          ) : (
            <View
              className="items-center justify-center rounded-2xl bg-[#e2e8f0]"
              style={{ width: 150, height: 110 }}
            >
              <Ionicons name="location" size={28} color="#94a3b8" />
              <Text className="mt-1.5 text-[11px] font-semibold text-[#94a3b8]">
                No site photo
              </Text>
            </View>
          )}

          {!!detail.location && (
            <View className="mt-4 flex-row" style={{ gap: 10 }}>
              <Pressable
                accessibilityRole="button"
                onPress={openMaps}
                className="h-[46px] flex-1 flex-row items-center justify-center rounded-2xl border border-[#e2e8f0] bg-white"
                style={{ gap: 6 }}
              >
                <Ionicons name="location" size={16} color="#1a1c1e" />
                <Text className="text-[14px] font-bold text-[#1a1c1e]">Google Maps</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={openNavigate}
                className="h-[46px] flex-1 flex-row items-center justify-center rounded-2xl bg-[#2563eb]"
                style={{ gap: 6 }}
              >
                <Ionicons name="navigate" size={16} color="#ffffff" />
                <Text className="text-[14px] font-bold text-white">Navigate</Text>
              </Pressable>
            </View>
          )}
        </View>

        <View className="mt-5 px-4">
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push(`/work-orders/complete-photo?ids=${encodeURIComponent(ids.join(","))}` as Href)
            }
            className="h-[48px] items-center justify-center rounded-2xl bg-[#16a34a]"
          >
            <Text className="text-[14px] font-bold text-white">Complete Installation</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
