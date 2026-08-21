import { Ionicons } from "@expo/vector-icons";
import { Redirect, Tabs } from "expo-router";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { Text, View } from "react-native";

import { AuthLoadingView } from "@/components/auth-loading";
import { NoAccessCard } from "@/components/no-access-card";
import { useCurrentUser } from "@/hooks/use-current-user";

function SyncTabButton({ focused }: { focused: boolean }) {
  return (
    <View className="items-center" style={{ width: 76 }}>
      <View
        className="items-center justify-center rounded-full bg-[#2563eb]"
        style={{
          width: 56,
          height: 56,
          marginTop: -26,
          borderWidth: 5,
          borderColor: "#ffffff",
        }}
      >
        <Ionicons name="sync" size={26} color="#ffffff" />
      </View>
      <Text
        className="mt-1 text-[11px] font-medium"
        style={{ color: focused ? "#2563eb" : "#8b95a1" }}
      >
        Sync
      </Text>
    </View>
  );
}

function TabsNavigator() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#2563eb",
        tabBarInactiveTintColor: "#8b95a1",
        tabBarStyle: {
          backgroundColor: "#ffffff",
          borderTopWidth: 0,
          height: 68,
          paddingTop: 6,
          paddingBottom: 10,
          elevation: 0,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "500",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => <Ionicons name="home" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="sync"
        options={{
          title: "Sync",
          tabBarLabel: () => null,
          tabBarIcon: ({ focused }) => <SyncTabButton focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "More",
          tabBarIcon: ({ color }) => <Ionicons name="ellipsis-horizontal" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="site-database"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="work-orders"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

function AuthorizedGate() {
  const { isLoaded, role } = useCurrentUser();

  if (!isLoaded) {
    return <AuthLoadingView />;
  }

  if (role !== "installer") {
    return <NoAccessCard />;
  }

  return <TabsNavigator />;
}

export default function TabsLayout() {
  return (
    <>
      <Authenticated>
        <AuthorizedGate />
      </Authenticated>
      <Unauthenticated>
        <Redirect href="/(auth)/sign-in" />
      </Unauthenticated>
      <AuthLoading>
        <AuthLoadingView />
      </AuthLoading>
    </>
  );
}
