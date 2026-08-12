import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { Pressable, Text, View } from "react-native";

type NavCardProps = {
  accent: string;
  iconTint: string;
  iconBackground: string;
  icon: ComponentProps<typeof Ionicons>["name"];
  title: string;
  subtitle: string;
  onPress?: () => void;
};

export function NavCard({
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
