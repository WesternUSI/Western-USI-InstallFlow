import { Ionicons } from "@expo/vector-icons";
import { Redirect, Tabs } from "expo-router";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";

import { AuthLoadingView } from "@/components/auth-loading";
import { ChangePasswordScreen } from "@/components/change-password-screen";
import { NoAccessCard } from "@/components/no-access-card";
import { useCurrentUser } from "@/hooks/use-current-user";

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
        name="change-password"
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
  const { isLoaded, role, convexUser } = useCurrentUser();

  if (!isLoaded) {
    return <AuthLoadingView />;
  }

  if (role !== "installer") {
    return <NoAccessCard />;
  }

  if (convexUser?.must_change_password) {
    return <ChangePasswordScreen />;
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
