import { api } from "@usi-installer/backend/convex/_generated/api";
import type { Id } from "@usi-installer/backend/convex/_generated/dataModel";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { openMapsDirections, openMapsSearch } from "@/lib/openMapsLocation";
import { parseDmsCoordinates } from "@/lib/parseDmsCoordinates";

type DetailTab = "image" | "details";

function DetailPill({ children }: { children: React.ReactNode }) {
  return (
    <View className="mr-2 mb-2 rounded-full bg-[#e8f0ff] px-3 py-2">
      <Text className="text-[13px] font-semibold text-[#1e3a8a]">{children}</Text>
    </View>
  );
}

function MapActions({ location }: { location?: string }) {
  const coords = React.useMemo(
    () => (location ? parseDmsCoordinates(location) : null),
    [location],
  );

  const openInMaps = () => {
    if (!coords) return;
    openMapsSearch(coords);
  };

  const openNavigation = () => {
    if (!coords) return;
    openMapsDirections(coords);
  };

  return (
    <View className="mt-3 flex-row gap-3">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Google Maps"
        disabled={!coords}
        onPress={openInMaps}
        className={`h-[48px] flex-1 flex-row items-center justify-center rounded-xl border border-[#e2e8f0] bg-white ${
          coords ? "" : "opacity-40"
        }`}
      >
        <Ionicons name="location" size={18} color="#ea4335" />
        <Text className="ml-2 text-[14px] font-semibold text-[#1a1c1e]">Google Maps</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Navigate"
        disabled={!coords}
        onPress={openNavigation}
        className={`h-[48px] flex-1 flex-row items-center justify-center rounded-xl bg-[#2563eb] ${
          coords ? "" : "opacity-40"
        }`}
      >
        <Ionicons name="navigate" size={18} color="#ffffff" />
        <Text className="ml-2 text-[14px] font-semibold text-white">Navigate</Text>
      </Pressable>
    </View>
  );
}

function ImageCarousel({ urls }: { urls: string[] }) {
  const [index, setIndex] = React.useState(0);
  const count = urls.length;

  if (count === 0) {
    return (
      <View className="h-[220px] items-center justify-center rounded-2xl bg-[#e2e8f0]">
        <Ionicons name="image-outline" size={40} color="#94a3b8" />
        <Text className="mt-2 text-[13px] font-medium text-[#6c7278]">No site images yet</Text>
      </View>
    );
  }

  const safeIndex = Math.min(index, count - 1);

  return (
    <View className="overflow-hidden rounded-2xl bg-[#0f172a]">
      <Image
        source={{ uri: urls[safeIndex] }}
        style={{ width: "100%", height: 220 }}
        resizeMode="cover"
      />
      <View className="absolute right-3 top-3 rounded-md bg-black/55 px-2 py-1">
        <Text className="text-[12px] font-semibold text-white">
          {safeIndex + 1} / {count}
        </Text>
      </View>
      {count > 1 && (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous image"
            hitSlop={8}
            onPress={() => setIndex((i) => (i - 1 + count) % count)}
            style={{ position: "absolute", left: 12, top: "50%", marginTop: -18 }}
            className="h-9 w-9 items-center justify-center rounded-full bg-black/45"
          >
            <Ionicons name="chevron-back" size={20} color="#ffffff" />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next image"
            hitSlop={8}
            onPress={() => setIndex((i) => (i + 1) % count)}
            style={{ position: "absolute", right: 12, top: "50%", marginTop: -18 }}
            className="h-9 w-9 items-center justify-center rounded-full bg-black/45"
          >
            <Ionicons name="chevron-forward" size={20} color="#ffffff" />
          </Pressable>
        </>
      )}
    </View>
  );
}

export default function SiteDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const siteId = id as Id<"sites"> | undefined;

  const site = useQuery(api.sites.getSite, siteId ? { id: siteId } : "skip");
  const [tab, setTab] = React.useState<DetailTab>("image");

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
            <Text className="text-[28px] font-extrabold text-[#1a1c1e]">Site Detail</Text>
            <Text className="mt-1 text-[14px] font-medium text-[#6c7278]">
              View site photos and details
            </Text>
          </View>
        </View>

        {site === undefined ? (
          <View className="mt-16 items-center">
            <ActivityIndicator color="#2563eb" />
          </View>
        ) : site === null ? (
          <Text className="mx-4 mt-8 text-[14px] font-medium text-[#6c7278]">Site not found.</Text>
        ) : (
          <View className="mt-5 px-4">
            <View className="rounded-2xl border border-[#e2e8f0] bg-white px-4 py-4">
              <Text className="text-[17px] font-bold leading-6 text-[#1a1c1e]">{site.site}</Text>
              <Text className="mt-1 text-[14px] font-medium text-[#6c7278]">{site.area}</Text>
              <Text className="mt-2 text-[13px] font-medium text-[#94a3b8]">{site.panel_id}</Text>
            </View>

            <View className="mt-4 flex-row overflow-hidden rounded-xl border border-[#dbeafe] bg-white">
              <Pressable
                accessibilityRole="button"
                onPress={() => setTab("image")}
                className={`h-[44px] flex-1 items-center justify-center ${
                  tab === "image" ? "bg-[#2563eb]" : "bg-white"
                }`}
              >
                <Text
                  className={`text-[14px] font-semibold ${
                    tab === "image" ? "text-white" : "text-[#2563eb]"
                  }`}
                >
                  Site Image
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => setTab("details")}
                className={`h-[44px] flex-1 items-center justify-center ${
                  tab === "details" ? "bg-[#2563eb]" : "bg-white"
                }`}
              >
                <Text
                  className={`text-[14px] font-semibold ${
                    tab === "details" ? "text-white" : "text-[#2563eb]"
                  }`}
                >
                  Details
                </Text>
              </Pressable>
            </View>

            <View className="mt-4 rounded-2xl border border-[#e2e8f0] bg-white p-3">
              <ImageCarousel urls={site.imageUrls} />
              <MapActions location={site.location} />
            </View>

            {tab === "details" && (
              <View className="mt-5">
                {site.install_notes ? (
                  <View className="mb-4">
                    <Text className="mb-2 text-[11px] font-bold tracking-[1px] text-[#94a3b8]">
                      INSTALLATION NOTES
                    </Text>
                    <View className="flex-row flex-wrap">
                      <DetailPill>{site.install_notes}</DetailPill>
                    </View>
                  </View>
                ) : null}

                {site.equipment_needed.length > 0 ? (
                  <View className="mb-4">
                    <Text className="mb-2 text-[11px] font-bold tracking-[1px] text-[#94a3b8]">
                      EQUIPMENT REQUIRED
                    </Text>
                    <View className="flex-row flex-wrap">
                      {site.equipment_needed.map((item) => (
                        <DetailPill key={item}>{item}</DetailPill>
                      ))}
                    </View>
                  </View>
                ) : null}

                {site.quantity != null ? (
                  <View className="mb-4">
                    <Text className="mb-2 text-[11px] font-bold tracking-[1px] text-[#94a3b8]">
                      PANEL QUANTITY
                    </Text>
                    <View className="flex-row flex-wrap">
                      <DetailPill>
                        {site.quantity} {site.quantity === 1 ? "Panel" : "Panels"}
                      </DetailPill>
                    </View>
                  </View>
                ) : null}

                {site.size ? (
                  <View className="mb-4">
                    <Text className="mb-2 text-[11px] font-bold tracking-[1px] text-[#94a3b8]">
                      SIZE
                    </Text>
                    <View className="flex-row flex-wrap">
                      <DetailPill>{site.size}</DetailPill>
                    </View>
                  </View>
                ) : null}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
