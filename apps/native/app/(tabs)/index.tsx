import { useUser } from "@clerk/expo";
import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import React from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { formatSyncTime, useSync } from "@/contexts/sync-context";

function greetingFor(date: Date) {
  const hour = date.getHours();

  if (hour < 12) {
    return "Good morning";
  }

  if (hour < 17) {
    return "Good afternoon";
  }

  return "Good evening";
}

type NavCardProps = {
  accent: string;
  iconTint: string;
  iconBackground: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  subtitle: string;
  onPress?: () => void;
};

function NavCard({
  accent,
  iconTint,
  iconBackground,
  icon,
  title,
  subtitle,
  onPress,
}: NavCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="flex-row items-center overflow-hidden rounded-2xl bg-white"
      style={{
        shadowColor: "#0f172a",
        shadowOpacity: 0.06,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 2,
      }}
    >
      <View style={{ width: 6, alignSelf: "stretch", backgroundColor: accent }} />

      <View className="flex-row flex-1 items-center px-4 py-5">
        <View
          className="items-center justify-center rounded-2xl"
          style={{ width: 56, height: 56, backgroundColor: iconBackground }}
        >
          <Ionicons name={icon} size={26} color={iconTint} />
        </View>

        <View className="ml-4 flex-1">
          <Text className="text-[19px] font-bold text-[#0f172a]">{title}</Text>
          <Text className="mt-1 text-[14px] font-medium leading-[19px] text-[#6c7278]">
            {subtitle}
          </Text>
        </View>

        <Ionicons name="chevron-forward" size={22} color={accent} />
      </View>
    </Pressable>
  );
}

export default function Home() {
  const { user } = useUser();
  const insets = useSafeAreaInsets();
  const { lastSyncedAt } = useSync();
  const router = useRouter();

  const greeting = greetingFor(new Date());
  const displayName = user?.firstName?.trim() || user?.emailAddresses[0]?.emailAddress.split("@")[0];

  return (
    <View className="flex-1 bg-[#f7f9fb]" style={{ paddingTop: insets.top }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="items-center pt-3">
          <Image
            source={require("@/assets/images/WESTERN USI-01 1.png")}
            style={{ width: 210, height: 26 }}
            resizeMode="contain"
          />
        </View>

        <Text className="mt-4 text-center text-[30px] font-extrabold text-[#0f172a]">
          {greeting}
          {displayName ? `, ${displayName}` : ""}
        </Text>

        <View className="mt-7 gap-4 px-4">
          <NavCard
            accent="#2563eb"
            iconTint="#2563eb"
            iconBackground="#e8f0ff"
            icon="location"
            title="Site Database"
            subtitle={"Browse panels, photos\n& equipment"}
            onPress={() => router.push("/site-database" as Href)}
          />

          <NavCard
            accent="#16a34a"
            iconTint="#16a34a"
            iconBackground="#e6f7ec"
            icon="list"
            title="Current Work Orders"
            subtitle="Allocate, equip & complete installs"
          />
        </View>

        <View className="mt-10 flex-row items-center px-4">
          <View className="h-px flex-1 bg-[#e2e8f0]" />
          <Text className="mx-3 text-[12px] font-bold tracking-[2px] text-[#8b95a1]">SYNC</Text>
          <View className="h-px flex-1 bg-[#e2e8f0]" />
        </View>

        <View className="mt-5 px-4">
          <View
            className="flex-row items-center rounded-2xl bg-white px-4 py-4"
            style={{
              shadowColor: "#0f172a",
              shadowOpacity: 0.05,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 3 },
              elevation: 1,
            }}
          >
            <View className="flex-1 flex-row items-center">
              <View className="h-2.5 w-2.5 rounded-full bg-[#22c55e]" />
              <Text className="ml-3 flex-1 text-[14px] text-[#6c7278]">
                <Text className="font-bold text-[#0f172a]">Last synced: </Text>
                {formatSyncTime(lastSyncedAt)}
              </Text>
            </View>

            <View className="mx-3 h-8 w-px bg-[#e2e8f0]" />

            <View className="flex-row items-center">
              <Ionicons name="checkmark-circle" size={20} color="#22c55e" />
              <Text className="ml-2 text-[14px] text-[#0f172a]">All data up to date</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
