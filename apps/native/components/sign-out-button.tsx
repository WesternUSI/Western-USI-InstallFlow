import { useClerk } from "@clerk/expo";
import { useRouter } from "expo-router";
import { Pressable, Text } from "react-native";

export function SignOutButton() {
  const { signOut } = useClerk();
  const router = useRouter();

  const handleSignOut = async () => {
    try {
      await signOut();
      router.replace("/(auth)/sign-in");
    } catch (err) {
      // See https://clerk.com/docs/custom-flows/error-handling
      // for more info on error handling
      console.error(JSON.stringify(err, null, 2));
    }
  };

  return (
    <Pressable
      accessibilityRole="button"
      onPress={handleSignOut}
      className="h-[46px] items-center justify-center rounded-xl bg-[#2563eb] px-6"
    >
      <Text className="text-[15px] font-semibold text-white">Sign Out</Text>
    </Pressable>
  );
}
