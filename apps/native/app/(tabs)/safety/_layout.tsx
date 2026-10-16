import { Stack } from "expo-router";

export default function SafetyLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#fafafa" } }} />
  );
}
