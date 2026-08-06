import { useSignIn } from "@clerk/expo";
import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import React from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const REMEMBERED_EMAIL_KEY = "usi.remembered-email";

function pushDecoratedUrl(
  router: ReturnType<typeof useRouter>,
  decorateUrl: (url: string) => string,
  href: string,
) {
  const url = decorateUrl(href);
  const nextHref = url.startsWith("http") ? new URL(url).pathname : url;
  router.replace(nextHref as Href);
}

export default function Page() {
  const { signIn, errors, fetchStatus } = useSignIn();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [emailAddress, setEmailAddress] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [rememberMe, setRememberMe] = React.useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = React.useState(false);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);

  // Pre-fill the email from the last "Remember me" sign-in. Only the email is
  // stored; Clerk's tokenCache owns session persistence either way.
  React.useEffect(() => {
    let isActive = true;

    SecureStore.getItemAsync(REMEMBERED_EMAIL_KEY)
      .then((storedEmail) => {
        if (isActive && storedEmail) {
          setEmailAddress(storedEmail);
          setRememberMe(true);
        }
      })
      .catch((error) => {
        console.error("Unable to read the remembered email:", error);
      });

    return () => {
      isActive = false;
    };
  }, []);

  const isSubmitting = fetchStatus === "fetching";
  const canSubmit = !!emailAddress && !!password && !isSubmitting;

  const persistRememberedEmail = async () => {
    try {
      if (rememberMe) {
        await SecureStore.setItemAsync(REMEMBERED_EMAIL_KEY, emailAddress);
      } else {
        await SecureStore.deleteItemAsync(REMEMBERED_EMAIL_KEY);
      }
    } catch (error) {
      console.error("Unable to persist the remembered email:", error);
    }
  };

  const handleSubmit = async () => {
    setStatusMessage(null);

    const { error } = await signIn.password({ emailAddress, password });

    if (error) {
      setStatusMessage(error.longMessage ?? "Email or password is incorrect. Please try again.");
      return;
    }

    if (signIn.status !== "complete") {
      setStatusMessage(
        `Sign-in could not be completed (status: ${signIn.status ?? "unknown"}). Please contact the office.`,
      );
      return;
    }

    await persistRememberedEmail();

    await signIn.finalize({
      navigate: ({ session, decorateUrl }) => {
        if (session?.currentTask) {
          console.log(session.currentTask);
          return;
        }

        pushDecoratedUrl(router, decorateUrl, "/");
      },
    });
  };

  return (
    <View className="flex-1 bg-[#f7f9fc]" style={{ paddingTop: insets.top }}>
      <View className="items-center pt-6 pb-2">
        <Text className="text-2xl font-bold tracking-[6px] text-[#1a1c1e]">WESTERN USI</Text>
      </View>

      <View className="flex-1 px-6 pt-12">
        <Text className="text-[32px] leading-[42px] font-bold text-[#1a1c1e]">
          Sign in to your Account
        </Text>
        <Text className="mt-3 text-sm text-[#6c7278]">Enter your credentials to log in</Text>

        {statusMessage && <Text className="mt-4 text-sm text-[#d32f2f]">{statusMessage}</Text>}

        <View className="mt-8 gap-3">
          <View className="rounded-xl border border-[#edf1f3] bg-white px-4">
            <TextInput
              className="h-[46px] text-base text-[#1a1c1e]"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              placeholder="Email"
              placeholderTextColor="#acb5bb"
              value={emailAddress}
              onChangeText={setEmailAddress}
            />
          </View>
          {errors.fields.identifier && (
            <Text className="text-xs text-[#d32f2f]">{errors.fields.identifier.message}</Text>
          )}

          <View className="flex-row items-center rounded-xl border border-[#edf1f3] bg-white px-4">
            <TextInput
              className="h-[46px] flex-1 text-base text-[#1a1c1e]"
              autoCapitalize="none"
              autoComplete="password"
              placeholder="Password"
              placeholderTextColor="#acb5bb"
              secureTextEntry={!isPasswordVisible}
              value={password}
              onChangeText={setPassword}
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
          {errors.fields.password && (
            <Text className="text-xs text-[#d32f2f]">{errors.fields.password.message}</Text>
          )}
        </View>

        <View className="mt-4 flex-row items-center justify-between">
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: rememberMe }}
            className="flex-row items-center"
            hitSlop={8}
            onPress={() => setRememberMe((remembered) => !remembered)}
          >
            <View
              className={`h-[19px] w-[19px] items-center justify-center rounded border ${
                rememberMe ? "border-[#2563eb] bg-[#2563eb]" : "border-[#acb5bb] bg-white"
              }`}
            >
              {rememberMe && <Ionicons name="checkmark" size={13} color="#ffffff" />}
            </View>
            <Text className="ml-2 text-sm text-[#6c7278]">Remember me</Text>
          </Pressable>

          {/* Reset flow is not built yet — intentionally inert. */}
          <Text className="text-sm text-[#4d81e7]">Forgot Password ?</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          className={`mt-6 h-12 items-center justify-center rounded-xl bg-[#2563eb] ${
            canSubmit ? "" : "opacity-50"
          }`}
          disabled={!canSubmit}
          onPress={handleSubmit}
        >
          <Text className="text-base font-semibold text-white">Log In</Text>
        </Pressable>
      </View>
    </View>
  );
}
