import { useSignIn } from "@clerk/expo";
import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import React from "react";
import {
  Image,
  Platform,
  Pressable,
  StatusBar,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, Rect, Stop, LinearGradient as SvgLinearGradient } from "react-native-svg";

const REMEMBERED_EMAIL_KEY = "usi.remembered-email";
const GLOW_TOP = "#8AAAFA";

/** Blue wash behind the wordmark, sampled from the login design. */
function HeaderGlow({ width, height }: { width: number; height: number }) {
  return (
    <Svg width={width} height={height} style={{ position: "absolute", top: 0, left: 0 }}>
      <Defs>
        <SvgLinearGradient id="glow" x1="0.5" y1="0" x2="0.5" y2="1">
          <Stop offset="0" stopColor={GLOW_TOP} stopOpacity="1" />
          <Stop offset="0.35" stopColor="#B4D0F6" stopOpacity="1" />
          <Stop offset="0.7" stopColor="#DCE9F4" stopOpacity="1" />
          <Stop offset="1" stopColor="#EDF1F3" stopOpacity="1" />
        </SvgLinearGradient>
      </Defs>
      <Rect x="0" y="0" width={width} height={height} fill="url(#glow)" />
    </Svg>
  );
}

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
  const { width: screenWidth } = useWindowDimensions();
  // Glow + solid fallback fill the status-bar gap; logo is padded below the inset.
  const headerHeight = insets.top + 140;

  // Keep system icons readable on the purple header. Avoid expo-status-bar —
  // its background/translucent props fight Android edge-to-edge and flash white/black.
  React.useEffect(() => {
    StatusBar.setBarStyle("dark-content", true);
    if (Platform.OS === "android") {
      StatusBar.setTranslucent(true);
      StatusBar.setBackgroundColor(GLOW_TOP);
    }
  }, []);

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
      setStatusMessage("Sign-in could not be completed. Please contact the office.");
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
    <View style={{ flex: 1, backgroundColor: GLOW_TOP }}>
      {/*
        Solid GLOW_TOP behind the SVG so any status-bar / safe-area gap is purple,
        never navigator white or page gray. marginTop pulls into the inset gap on Android.
      */}
      <View
        style={{
          height: headerHeight,
          marginTop: -insets.top,
          backgroundColor: GLOW_TOP,
        }}
      >
        <HeaderGlow width={screenWidth} height={headerHeight} />
        <View
          style={{
            flex: 1,
            paddingTop: insets.top,
            alignItems: "center",
            justifyContent: "flex-end",
            paddingBottom: 12,
          }}
        >
          <Image
            source={require("@/assets/images/WESTERN USI-01 1.png")}
            style={{ width: 270, height: 33 }}
            resizeMode="contain"
          />
        </View>
      </View>

      <View className="flex-1 bg-[#edf1f3] px-6 pt-14">
        <Text className="text-[34px] leading-[44px] font-extrabold text-[#1a1c1e]">
          Sign in to your{"\n"}Account
        </Text>
        <Text className="mt-3 text-[15px] font-medium text-[#6c7278]">
          Enter your credentials to log in
        </Text>

        {statusMessage && (
          <Text className="mt-4 text-sm font-medium text-[#d32f2f]">{statusMessage}</Text>
        )}

        <View className="mt-9 gap-3">
          <View className="rounded-[14px] border border-white bg-white px-4 shadow-sm">
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
          {errors.fields.identifier && (
            <Text className="text-xs font-medium text-[#d32f2f]">
              {errors.fields.identifier.message}
            </Text>
          )}

          <View className="flex-row items-center rounded-[14px] border border-white bg-white px-4 shadow-sm">
            <TextInput
              className="h-[52px] flex-1 text-[15px] font-medium text-[#1a1c1e]"
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
            <Text className="text-xs font-medium text-[#d32f2f]">
              {errors.fields.password.message}
            </Text>
          )}
        </View>

        <View className="mt-5 flex-row items-center justify-between">
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: rememberMe }}
            className="flex-row items-center"
            hitSlop={8}
            onPress={() => setRememberMe((remembered) => !remembered)}
          >
            <View
              className={`h-5 w-5 items-center justify-center rounded-[5px] border-[1.5px] ${
                rememberMe ? "border-[#2563eb] bg-[#2563eb]" : "border-[#acb5bb] bg-transparent"
              }`}
            >
              {rememberMe && <Ionicons name="checkmark" size={14} color="#ffffff" />}
            </View>
            <Text className="ml-2.5 text-[13px] font-medium text-[#6c7278]">Remember me</Text>
          </Pressable>

          {/* Reset flow is not built yet — intentionally inert. */}
          <Text className="text-[13px] font-semibold text-[#4d81e7]">Forgot Password ?</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          className={`mt-7 h-[54px] items-center justify-center rounded-[14px] bg-[#2f5fe0] ${
            canSubmit ? "" : "opacity-50"
          }`}
          disabled={!canSubmit}
          onPress={handleSubmit}
        >
          <Text className="text-[17px] font-bold text-white">Log In</Text>
        </Pressable>
      </View>
    </View>
  );
}
