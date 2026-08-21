import { useUser } from "@clerk/expo";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useToast } from "heroui-native";
import React from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function clerkErrorMessage(error: unknown, fallback: string): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "errors" in error &&
    Array.isArray((error as { errors: unknown }).errors)
  ) {
    const first = (error as { errors: { longMessage?: string; message?: string }[] }).errors[0];
    if (first?.longMessage) return first.longMessage;
    if (first?.message) return first.message;
  }
  if (error instanceof Error) return error.message;
  return fallback;
}

function PasswordField({
  placeholder,
  value,
  onChangeText,
  visible,
  onToggleVisible,
}: {
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  visible: boolean;
  onToggleVisible: () => void;
}) {
  return (
    <View className="flex-row items-center rounded-[14px] border border-white bg-white px-4 shadow-sm">
      <TextInput
        className="h-[52px] flex-1 text-[15px] font-medium text-[#1a1c1e]"
        autoCapitalize="none"
        secureTextEntry={!visible}
        placeholder={placeholder}
        placeholderTextColor="#acb5bb"
        value={value}
        onChangeText={onChangeText}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={visible ? "Hide password" : "Show password"}
        hitSlop={12}
        onPress={onToggleVisible}
      >
        <Ionicons name={visible ? "eye-outline" : "eye-off-outline"} size={20} color="#6c7278" />
      </Pressable>
    </View>
  );
}

export default function ChangePasswordScreen() {
  const { user } = useUser();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { toast } = useToast();

  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [isPasswordVisible, setIsPasswordVisible] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const passwordsMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const canSubmit =
    !!currentPassword && !!newPassword && newPassword === confirmPassword && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit || !user) return;

    setSubmitting(true);
    setErrorMessage(null);
    try {
      await user.updatePassword({
        currentPassword,
        newPassword,
        signOutOfOtherSessions: true,
      });
      toast.show({
        label: "Password updated",
        description: "Your password has been changed.",
        variant: "success",
      });
      router.back();
    } catch (error) {
      setErrorMessage(clerkErrorMessage(error, "Couldn't update your password. Please try again."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className="flex-1 bg-[#edf1f3]" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center px-6 pt-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={12}
          onPress={() => router.back()}
          className="mr-3"
        >
          <Ionicons name="chevron-back" size={24} color="#1a1c1e" />
        </Pressable>
        <Text className="text-[17px] font-bold text-[#1a1c1e]">Change Password</Text>
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
        bottomOffset={24}
        showsVerticalScrollIndicator={false}
      >
        <Text className="text-[22px] font-extrabold text-[#1a1c1e]">Update your password</Text>
        <Text className="mt-2 text-[14px] font-medium text-[#6c7278]">
          Enter your current password and choose a new one.
        </Text>

        {errorMessage && (
          <Text className="mt-4 text-sm font-medium text-[#d32f2f]">{errorMessage}</Text>
        )}

        <View className="mt-7 gap-3">
          <PasswordField
            placeholder="Current password"
            value={currentPassword}
            onChangeText={setCurrentPassword}
            visible={isPasswordVisible}
            onToggleVisible={() => setIsPasswordVisible((visible) => !visible)}
          />
          <PasswordField
            placeholder="New password"
            value={newPassword}
            onChangeText={setNewPassword}
            visible={isPasswordVisible}
            onToggleVisible={() => setIsPasswordVisible((visible) => !visible)}
          />
          <PasswordField
            placeholder="Confirm new password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            visible={isPasswordVisible}
            onToggleVisible={() => setIsPasswordVisible((visible) => !visible)}
          />
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
      </KeyboardAwareScrollView>
    </View>
  );
}
