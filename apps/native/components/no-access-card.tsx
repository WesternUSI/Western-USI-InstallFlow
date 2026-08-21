import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SignOutButton } from "@/components/sign-out-button";

/** Shown when a signed-in user's Convex role isn't "installer" — this app is installer-only. */
export function NoAccessCard() {
  const insets = useSafeAreaInsets();

  return (
    <View
      className="flex-1 items-center justify-center bg-[#f7f9fb] px-6"
      style={{ paddingTop: insets.top }}
    >
      <View
        className="w-full max-w-[340px] items-center rounded-3xl bg-white px-6 py-8"
        style={{
          shadowColor: "#0f172a",
          shadowOpacity: 0.06,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 2,
        }}
      >
        <View className="h-16 w-16 items-center justify-center rounded-full bg-[#fee2e2]">
          <Ionicons name="lock-closed" size={30} color="#dc2626" />
        </View>

        <Text className="mt-4 text-center text-[20px] font-extrabold text-[#1a1c1e]">
          No Access
        </Text>
        <Text className="mt-2 text-center text-[14px] font-medium leading-5 text-[#6c7278]">
          Your account doesn't have the Installer role needed to use this app. Contact the office
          if you think this is a mistake.
        </Text>

        <View className="mt-6">
          <SignOutButton />
        </View>
      </View>
    </View>
  );
}
