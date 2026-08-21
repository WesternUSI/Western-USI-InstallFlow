import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SignOutButton } from "@/components/sign-out-button";
import { useCurrentUser } from "@/hooks/use-current-user";

export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const { clerkUser } = useCurrentUser();

  const displayName = clerkUser?.fullName?.trim() || clerkUser?.primaryEmailAddress?.emailAddress;
  const email = clerkUser?.primaryEmailAddress?.emailAddress;

  return (
    <View className="flex-1 bg-[#f7f9fb]" style={{ paddingTop: insets.top }}>
      <View className="px-4 pt-2">
        <Text className="text-[28px] font-extrabold text-[#1a1c1e]">More</Text>
      </View>

      <View className="mt-5 px-4">
        <View
          className="flex-row items-center rounded-2xl bg-white px-4 py-4"
          style={{
            shadowColor: "#0f172a",
            shadowOpacity: 0.06,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 4 },
            elevation: 2,
          }}
        >
          <View className="h-12 w-12 items-center justify-center rounded-full bg-[#e8f0ff]">
            <Ionicons name="person" size={22} color="#2563eb" />
          </View>
          <View className="ml-3 flex-1">
            <Text className="text-[15px] font-bold text-[#1a1c1e]" numberOfLines={1}>
              {displayName ?? "Signed in"}
            </Text>
            {email && email !== displayName ? (
              <Text className="mt-0.5 text-[13px] font-medium text-[#6c7278]" numberOfLines={1}>
                {email}
              </Text>
            ) : null}
          </View>
        </View>

        <View className="mt-4">
          <SignOutButton />
        </View>
      </View>
    </View>
  );
}
