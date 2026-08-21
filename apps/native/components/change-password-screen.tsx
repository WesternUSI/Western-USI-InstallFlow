import { api } from "@usi-installer/backend/convex/_generated/api";
import { Ionicons } from "@expo/vector-icons";
import { useAction } from "convex/react";
import { useToast } from "heroui-native";
import React from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SignOutButton } from "@/components/sign-out-button";

/**
 * Mandatory gate shown instead of the tabs whenever the signed-in installer's
 * Convex row has `must_change_password: true` — set on invite and again on
 * every credential reset, since both hand out an admin-generated password.
 * `completePasswordChange` sets the new password directly through Clerk's
 * Backend API and clears the flag; once it's cleared, `(tabs)/_layout.tsx`
 * re-renders straight into the app reactively, no navigation call needed here.
 */
export function ChangePasswordScreen() {
  const insets = useSafeAreaInsets();
  const { toast } = useToast();
  const completePasswordChange = useAction(api.users.completePasswordChange);

  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [isPasswordVisible, setIsPasswordVisible] = React.useState(false);

  const passwordsMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const canSubmit = !!newPassword && newPassword === confirmPassword && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setSubmitting(true);
    setErrorMessage(null);
    try {
      await completePasswordChange({ new_password: newPassword });
      toast.show({
        label: "Password updated",
        description: "You're all set.",
        variant: "success",
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Couldn't update your password. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#edf1f3", paddingTop: insets.top }}>
      <KeyboardAwareScrollView
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: 32, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
        bottomOffset={24}
        showsVerticalScrollIndicator={false}
      >
        <Text className="text-[22px] font-extrabold text-[#1a1c1e]">Set your own password</Text>
        <Text className="mt-2 text-[14px] font-medium text-[#6c7278]">
          You're signed in with a temporary password. Set your own before continuing.
        </Text>

        {errorMessage && (
          <Text className="mt-4 text-sm font-medium text-[#d32f2f]">{errorMessage}</Text>
        )}

        <View className="mt-7 gap-3">
          <View className="flex-row items-center rounded-[14px] border border-white bg-white px-4 shadow-sm">
            <TextInput
              className="h-[52px] flex-1 text-[15px] font-medium text-[#1a1c1e]"
              autoCapitalize="none"
              secureTextEntry={!isPasswordVisible}
              placeholder="New password"
              placeholderTextColor="#acb5bb"
              value={newPassword}
              onChangeText={setNewPassword}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isPasswordVisible ? "Hide password" : "Show password"}
              hitSlop={12}
              onPress={() => setIsPasswordVisible((visible) => !visible)}
            >
              <Ionicons
                name={isPasswordVisible ? "eye-outline" : "eye-off-outline"}
                size={20}
                color="#6c7278"
              />
            </Pressable>
          </View>
          <View className="flex-row items-center rounded-[14px] border border-white bg-white px-4 shadow-sm">
            <TextInput
              className="h-[52px] flex-1 text-[15px] font-medium text-[#1a1c1e]"
              autoCapitalize="none"
              secureTextEntry={!isPasswordVisible}
              placeholder="Confirm new password"
              placeholderTextColor="#acb5bb"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isPasswordVisible ? "Hide password" : "Show password"}
              hitSlop={12}
              onPress={() => setIsPasswordVisible((visible) => !visible)}
            >
              <Ionicons
                name={isPasswordVisible ? "eye-outline" : "eye-off-outline"}
                size={20}
                color="#6c7278"
              />
            </Pressable>
          </View>
          {passwordsMismatch && (
            <Text className="text-xs font-medium text-[#d32f2f]">Passwords don't match.</Text>
          )}
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={!canSubmit}
          onPress={handleSubmit}
          className="mt-6 h-[54px] items-center justify-center rounded-[14px] bg-[#2f5fe0]"
          style={{ opacity: canSubmit ? 1 : 0.5 }}
        >
          <Text className="text-[17px] font-bold text-white">Update Password</Text>
        </Pressable>

        <View className="mt-8 items-center">
          <Text className="mb-3 text-[12px] font-medium text-[#8b95a1]">Not you?</Text>
          <SignOutButton />
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}
