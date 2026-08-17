import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * "Email sent to office" is the design's copy, not a status this screen
 * verifies — completion-email sending isn't wired up yet (deferred), so this
 * text is currently aspirational rather than a report of something that just
 * happened.
 */
export default function InstallCompletedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View
      className="flex-1 items-center bg-[#f7f9fb] px-6"
      style={{ paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }}
    >
      <Text className="text-[20px] font-extrabold tracking-[2px] text-[#1a1c1e]">WESTERN USI</Text>

      <View className="flex-1 items-center justify-center">
        <View
          className="items-center justify-center rounded-full bg-[#2563eb]"
          style={{ width: 96, height: 96 }}
        >
          <Ionicons name="checkmark" size={52} color="#ffffff" />
        </View>

        <Text className="mt-6 text-[22px] font-extrabold text-[#1a1c1e]">Install Completed</Text>
        <Text className="mt-1 text-[14px] font-medium text-[#6c7278]">Email sent to office</Text>
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => router.replace("/work-orders/complete" as Href)}
        className="h-[50px] w-full items-center justify-center rounded-2xl bg-[#2563eb]"
      >
        <Text className="text-[15px] font-bold text-white">Done</Text>
      </Pressable>
    </View>
  );
}
