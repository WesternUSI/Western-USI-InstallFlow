import { useFocusEffect, useRouter } from "expo-router";
import React from "react";
import { View } from "react-native";

import { useSync } from "@/contexts/sync-context";

/**
 * The Sync tab is an action, not a destination: focusing it runs a sync and
 * hands the user straight back to Home.
 */
export default function SyncScreen() {
  const router = useRouter();
  const { sync } = useSync();

  useFocusEffect(
    React.useCallback(() => {
      sync().finally(() => {
        router.replace("/");
      });
    }, [router, sync]),
  );

  return <View className="flex-1 bg-[#f7f9fb]" />;
}
