import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React from "react";
import { Modal, Pressable, Text, View } from "react-native";

import { useSync } from "@/contexts/sync-context";

/**
 * The Sync tab is an action, not a destination: focusing it shows a confirm
 * modal, then optionally syncs and returns the user to Home.
 */
export default function SyncScreen() {
  const router = useRouter();
  const { sync, isSyncing } = useSync();
  const [visible, setVisible] = React.useState(false);

  useFocusEffect(
    React.useCallback(() => {
      setVisible(true);
      return () => {
        setVisible(false);
      };
    }, []),
  );

  const goHome = React.useCallback(() => {
    setVisible(false);
    router.replace("/");
  }, [router]);

  const handleForceSync = React.useCallback(async () => {
    await sync();
    goHome();
  }, [goHome, sync]);

  return (
    <View className="flex-1 bg-[#f7f9fb]">
      <Modal transparent animationType="fade" visible={visible} onRequestClose={goHome}>
        <View className="flex-1 items-center justify-center bg-black/45 px-6">
          <View className="w-full max-w-[340px] rounded-3xl bg-white px-5 pb-5 pt-4">
            <View className="mb-2 flex-row justify-end">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={12}
                onPress={goHome}
              >
                <Ionicons name="close" size={22} color="#94a3b8" />
              </Pressable>
            </View>

            <View className="mb-4 items-center">
              <View className="h-16 w-16 items-center justify-center rounded-full bg-[#e8f0ff]">
                <Ionicons name="sync" size={32} color="#2563eb" />
              </View>
            </View>

            <Text className="text-center text-[22px] font-extrabold text-[#1a1c1e]">
              Force Sync?
            </Text>
            <Text className="mt-2 px-2 text-center text-[14px] font-medium leading-5 text-[#6c7278]">
              This will refresh all site data and may overwrite recent changes.
            </Text>

            <View className="mt-6 flex-row gap-3">
              <Pressable
                accessibilityRole="button"
                onPress={goHome}
                className="h-[48px] flex-1 items-center justify-center rounded-xl border border-[#cbd5e1] bg-white"
              >
                <Text className="text-[15px] font-semibold text-[#1a1c1e]">Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={isSyncing}
                onPress={handleForceSync}
                className={`h-[48px] flex-1 items-center justify-center rounded-xl bg-[#2563eb] ${
                  isSyncing ? "opacity-60" : ""
                }`}
              >
                <Text className="text-[15px] font-semibold text-white">
                  {isSyncing ? "Syncing…" : "Force Sync"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
