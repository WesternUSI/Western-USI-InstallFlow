import { useAuth } from "@clerk/expo";
import { Ionicons } from "@expo/vector-icons";
import { Redirect, Tabs } from "expo-router";
import { Text, View } from "react-native";

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

export default function TabsLayout() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return null;
  }

  if (!isSignedIn) {
    return <Redirect href="/(auth)/sign-in" />;
  }

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
    </Tabs>
  );
}
