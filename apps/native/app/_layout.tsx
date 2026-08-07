import "@/global.css";
import { ClerkProvider, useAuth } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { env } from "@usi-installer/env/native";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { Stack } from "expo-router";
import { HeroUINativeProvider } from "heroui-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { AppThemeProvider } from "@/contexts/app-theme-context";
import { SyncProvider } from "@/contexts/sync-context";

export const unstable_settings = {
  initialRouteName: "(tabs)",
};

const convex = new ConvexReactClient(env.EXPO_PUBLIC_CONVEX_URL, {
  unsavedChangesWarning: false,
});

function StackLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#8AAAFA" } }}>
      <Stack.Screen
        name="(tabs)"
        options={{ headerShown: false, contentStyle: { backgroundColor: "#8AAAFA" } }}
      />
      <Stack.Screen
        name="(auth)"
        options={{ headerShown: false, contentStyle: { backgroundColor: "#8AAAFA" } }}
      />
      <Stack.Screen
        name="modal"
        options={{ title: "Modal", presentation: "modal", headerShown: true }}
      />
    </Stack>
  );
}

export default function Layout() {
  return (
    <ClerkProvider tokenCache={tokenCache} publishableKey={env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY}>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#8AAAFA" }}>
          <KeyboardProvider>
            <AppThemeProvider>
              <HeroUINativeProvider>
                <SyncProvider>
                  <StackLayout />
                </SyncProvider>
              </HeroUINativeProvider>
            </AppThemeProvider>
          </KeyboardProvider>
        </GestureHandlerRootView>
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
