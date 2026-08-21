import { useSignIn } from "@clerk/expo";
import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import { useToast } from "heroui-native";
import React from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Step = "email" | "code" | "password";

/**
 * Clerk's real reset flow is a 6-digit email code typed back into the app,
 * not a clickable link — there's no `resetPasswordEmailLink` on the SignIn
 * resource, only `resetPasswordEmailCode`. "If it exists" (no account
 * enumeration) is honored by always advancing to the code step and showing
 * the same generic copy, regardless of whether `create()` found an account.
 */
export default function ForgotPasswordScreen() {
  const { signIn } = useSignIn();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { toast } = useToast();

  const [step, setStep] = React.useState<Step>("email");
  const [emailAddress, setEmailAddress] = React.useState("");
  const [code, setCode] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const handleSendCode = async () => {
    if (!emailAddress.trim()) return;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const { error } = await signIn.create({ identifier: emailAddress.trim() });
      if (!error) {
        await signIn.resetPasswordEmailCode.sendCode();
      }
    } finally {
      // Same next step and copy whether or not the account exists.
      setSubmitting(false);
      setStep("code");
    }
  };

  const handleVerifyCode = async () => {
    if (!code.trim()) return;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const { error } = await signIn.resetPasswordEmailCode.verifyCode({ code: code.trim() });
      if (error) {
        setErrorMessage(error.longMessage ?? "That code isn't right. Please try again.");
        return;
      }
      setStep("password");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResendCode = async () => {
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await signIn.resetPasswordEmailCode.sendCode();
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitPassword = async () => {
    if (!newPassword || newPassword !== confirmPassword) return;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const { error } = await signIn.resetPasswordEmailCode.submitPassword({
        password: newPassword,
        signOutOfOtherSessions: true,
      });
      if (error) {
        setErrorMessage(error.longMessage ?? "Couldn't reset your password. Please try again.");
        return;
      }

      await signIn.finalize({
        navigate: () => {
          toast.show({
            label: "Password reset",
            description: "You're signed in with your new password.",
            variant: "success",
          });
          router.replace("/" as Href);
        },
      });
    } finally {
      setSubmitting(false);
    }
  };

  const passwordsMismatch =
    confirmPassword.length > 0 && newPassword !== confirmPassword;

  const header = (
    <View className="flex-row items-center px-6 pt-2">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={12}
        onPress={() => {
          if (step === "email") {
            router.back();
          } else if (step === "code") {
            setStep("email");
          } else {
            setStep("code");
          }
        }}
        className="mr-3"
      >
        <Ionicons name="chevron-back" size={24} color="#1a1c1e" />
      </Pressable>
      <Text className="text-[17px] font-bold text-[#1a1c1e]">Reset Password</Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: "#edf1f3", paddingTop: insets.top }}>
      {header}
      <KeyboardAwareScrollView
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
        bottomOffset={24}
        showsVerticalScrollIndicator={false}
      >
        {step === "email" && (
          <>
            <Text className="text-[22px] font-extrabold text-[#1a1c1e]">
              Forgot your password?
            </Text>
            <Text className="mt-2 text-[14px] font-medium text-[#6c7278]">
              Enter your account email — if it exists, we'll send a 6-digit reset code to it.
            </Text>

            <View className="mt-7 rounded-[14px] border border-white bg-white px-4 shadow-sm">
              <TextInput
                className="h-[52px] text-[15px] font-medium text-[#1a1c1e]"
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                placeholder="Email"
                placeholderTextColor="#acb5bb"
                value={emailAddress}
                onChangeText={setEmailAddress}
              />
            </View>

            <Pressable
              accessibilityRole="button"
              disabled={!emailAddress.trim() || submitting}
              onPress={handleSendCode}
              className="mt-6 h-[54px] items-center justify-center rounded-[14px] bg-[#2f5fe0]"
              style={{ opacity: !emailAddress.trim() || submitting ? 0.5 : 1 }}
            >
              <Text className="text-[17px] font-bold text-white">Send Reset Code</Text>
            </Pressable>
          </>
        )}

        {step === "code" && (
          <>
            <Text className="text-[22px] font-extrabold text-[#1a1c1e]">Check your email</Text>
            <Text className="mt-2 text-[14px] font-medium text-[#6c7278]">
              If an account exists for {emailAddress.trim()}, a 6-digit code is on its way. Enter
              it below.
            </Text>

            {errorMessage && (
              <Text className="mt-4 text-sm font-medium text-[#d32f2f]">{errorMessage}</Text>
            )}

            <View className="mt-7 rounded-[14px] border border-white bg-white px-4 shadow-sm">
              <TextInput
                className="h-[52px] text-[15px] font-medium tracking-[4px] text-[#1a1c1e]"
                keyboardType="number-pad"
                placeholder="000000"
                placeholderTextColor="#acb5bb"
                maxLength={6}
                value={code}
                onChangeText={setCode}
              />
            </View>

            <Pressable
              accessibilityRole="button"
              disabled={!code.trim() || submitting}
              onPress={handleVerifyCode}
              className="mt-6 h-[54px] items-center justify-center rounded-[14px] bg-[#2f5fe0]"
              style={{ opacity: !code.trim() || submitting ? 0.5 : 1 }}
            >
              <Text className="text-[17px] font-bold text-white">Verify Code</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              disabled={submitting}
              onPress={handleResendCode}
              className="mt-4 items-center"
            >
              <Text className="text-[13px] font-semibold text-[#4d81e7]">Resend code</Text>
            </Pressable>
          </>
        )}

        {step === "password" && (
          <>
            <Text className="text-[22px] font-extrabold text-[#1a1c1e]">Set a new password</Text>
            <Text className="mt-2 text-[14px] font-medium text-[#6c7278]">
              Choose a new password for your account.
            </Text>

            {errorMessage && (
              <Text className="mt-4 text-sm font-medium text-[#d32f2f]">{errorMessage}</Text>
            )}

            <View className="mt-7 gap-3">
              <View className="rounded-[14px] border border-white bg-white px-4 shadow-sm">
                <TextInput
                  className="h-[52px] text-[15px] font-medium text-[#1a1c1e]"
                  autoCapitalize="none"
                  secureTextEntry
                  placeholder="New password"
                  placeholderTextColor="#acb5bb"
                  value={newPassword}
                  onChangeText={setNewPassword}
                />
              </View>
              <View className="rounded-[14px] border border-white bg-white px-4 shadow-sm">
                <TextInput
                  className="h-[52px] text-[15px] font-medium text-[#1a1c1e]"
                  autoCapitalize="none"
                  secureTextEntry
                  placeholder="Confirm new password"
                  placeholderTextColor="#acb5bb"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                />
              </View>
              {passwordsMismatch && (
                <Text className="text-xs font-medium text-[#d32f2f]">Passwords don't match.</Text>
              )}
            </View>

            <Pressable
              accessibilityRole="button"
              disabled={!newPassword || newPassword !== confirmPassword || submitting}
              onPress={handleSubmitPassword}
              className="mt-6 h-[54px] items-center justify-center rounded-[14px] bg-[#2f5fe0]"
              style={{
                opacity: !newPassword || newPassword !== confirmPassword || submitting ? 0.5 : 1,
              }}
            >
              <Text className="text-[17px] font-bold text-white">Reset Password</Text>
            </Pressable>
          </>
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}
