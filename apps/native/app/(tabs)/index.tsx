import { useUser } from "@clerk/expo";
import { isWhsOnly } from "@usi-installer/backend/convex/permissions";
import { type Href, useRouter } from "expo-router";
import React from "react";
import { Image, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { NavCard } from "@/components/nav-card";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useWhsAttention } from "@/hooks/use-whs-attention";

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

export default function Home() {
  const { user } = useUser();
  const { convexUser } = useCurrentUser();
  const { count: attentionCount } = useWhsAttention();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // Subcontractors' workers only see the WHS side of the app.
  const whsOnly = convexUser != null && isWhsOnly(convexUser);

  const greeting = greetingFor(new Date());
  // `users.name` is the field admins actually manage (set on invite, editable
  // later via User Details) — Clerk's firstName is only ever set once at
  // invite time and goes stale if an admin renames the account afterwards.
  const convexFirstName = convexUser?.name?.trim().split(/\s+/)[0];
  const displayName =
    convexFirstName ||
    user?.firstName?.trim() ||
    user?.emailAddresses[0]?.emailAddress.split("@")[0];

  return (
    <View className="flex-1 bg-[#f7f9fb]" style={{ paddingTop: insets.top }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="items-center pt-3">
          <Image
            source={require("@/assets/images/western-usi-logo.png")}
            style={{ width: 210, height: 26 }}
            resizeMode="contain"
          />
        </View>

        <Text className="mt-4 text-center text-[30px] font-extrabold text-[#0f172a]">
          {greeting}
          {displayName ? `, ${displayName}` : ""}
        </Text>

        <View className="mt-7 gap-4 px-4">
          {!whsOnly && (
            <>
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
                onPress={() => router.push("/work-orders" as Href)}
              />
            </>
          )}

          <NavCard
            accent="#f55052"
            iconTint="#dc2626"
            iconBackground="#fdf0f0"
            icon="shield-checkmark"
            iconImage={require("@/assets/images/whs/protect.png")}
            title="Safety"
            subtitle="SWMS, SDS, accreditations & tasks"
            badge={attentionCount > 0 ? `${attentionCount} ${attentionCount === 1 ? "item needs" : "items need"} action` : undefined}
            onPress={() => router.push("/safety" as Href)}
          />
        </View>

      </ScrollView>
    </View>
  );
}
