import { useAuth } from "@clerk/expo";
import { Redirect, Stack } from "expo-router";
import { View } from "react-native";

export default function AuthRoutesLayout() {
  const { isLoaded, isSignedIn } = useAuth();

  // Never return null — that flashes the navigator's default white behind the status bar
  // after a storage clear / cold start while Clerk is still loading.
  if (!isLoaded) {
    return <View style={{ flex: 1, backgroundColor: "#8AAAFA" }} />;
  }

  if (isSignedIn) {
    return <Redirect href={"/"} />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#8AAAFA" },
      }}
    />
  );
}
