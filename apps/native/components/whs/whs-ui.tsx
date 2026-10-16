import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { ComponentProps, ReactNode } from "react";
import { Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { STATUS_STYLES, type WhsStatus } from "@/lib/whs-mock";

const cardShadow = {
  shadowColor: "#000000",
  shadowOpacity: 0.05,
  shadowRadius: 2,
  shadowOffset: { width: 0, height: 1 },
  elevation: 1,
} as const;

/** `scroll={false}` for a screen with a signature pad, which a scroll view would steal the gesture from. */
export function WhsScreen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-[#fafafa]" style={{ paddingTop: insets.top }}>
      <ScrollView
        scrollEnabled={scroll}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </View>
  );
}

export function WhsHeader({ title, subtitle }: { title: string; subtitle: string }) {
  const router = useRouter();

  return (
    <View className="flex-row items-center gap-4 pb-6 pt-4">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        onPress={() => router.back()}
        className="h-12 w-12 items-center justify-center rounded-2xl"
        style={cardShadow}
      >
        <Ionicons name="chevron-back" size={24} color="#111827" />
      </Pressable>
      <View className="flex-1">
        <Text className="text-[24px] font-bold leading-[30px] text-[#1a1b24]">{title}</Text>
        <Text className="text-[14px] leading-5 text-[#444653]">{subtitle}</Text>
      </View>
    </View>
  );
}

/** `label` replaces the status's own label, e.g. "Awaiting Review" in the awaiting colours. */
export function StatusPill({ status, label }: { status: WhsStatus; label?: string }) {
  const style = STATUS_STYLES[status];

  return (
    <View className="h-7 items-center justify-center rounded-md px-3" style={{ backgroundColor: style.background }}>
      <Text className="text-[12px] font-medium" style={{ color: style.color }}>
        {label ?? style.label}
      </Text>
    </View>
  );
}

function CardLabel({ children }: { children: string }) {
  return <Text className="text-[11px] font-semibold uppercase tracking-[0.6px] text-[#64748b]">{children}</Text>;
}

/** List row used by accreditations, SWMS, SDS and safety documents. */
export function ListCard({
  title,
  subtitle,
  label,
  value,
  status,
  onPress,
}: {
  title: string;
  subtitle: string;
  label: string;
  value: string;
  status?: WhsStatus;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="rounded-[16px] border border-[#e5e7eb] bg-white p-[18px]"
      style={cardShadow}
    >
      <View className="flex-row items-start">
        <View className="flex-1 pr-3">
          <Text className="text-[16px] font-semibold leading-6 text-[#111827]">{title}</Text>
          <Text className="mt-1 text-[15px] leading-5 text-[#4b5563]">{subtitle}</Text>
        </View>
        <View className="h-6 justify-center pt-1">
          <Ionicons name="chevron-forward" size={22} color="#9ca3af" />
        </View>
      </View>

      <View className="my-4 h-px bg-[#e0e2ec]" />

      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-1">
          <CardLabel>{label}</CardLabel>
          <Text className="mt-1 text-[14px] font-medium leading-5 text-[#191b23]">{value}</Text>
        </View>
        {status ? <StatusPill status={status} /> : null}
      </View>
    </Pressable>
  );
}

type DetailRow = { label: string; value: string } | { pair: [{ label: string; value: string }, { label: string; value: string }] };

/** Detail card used by accreditation and document detail screens. */
export function DetailCard({
  title,
  subtitle,
  status,
  rows,
}: {
  title: string;
  subtitle?: string;
  status?: WhsStatus;
  rows: DetailRow[];
}) {
  return (
    <View className="rounded-[16px] border border-[#e0e2ec] bg-white p-4" style={cardShadow}>
      <View className="flex-row items-start justify-between gap-3">
        <Text className="flex-1 pt-1 text-[16px] font-semibold leading-6 text-[#111827]">{title}</Text>
        {status ? <StatusPill status={status} /> : null}
      </View>
      {subtitle ? <Text className="mt-1 text-[15px] leading-5 text-[#4b5563]">{subtitle}</Text> : null}

      {rows.map((row, index) => (
        <View key={index}>
          <View className="my-4 h-px bg-[#e0e2ec]" />
          {"pair" in row ? (
            <View className="flex-row">
              <View className="flex-1">
                <CardLabel>{row.pair[0].label}</CardLabel>
                <Text className="mt-1 text-[13px] leading-5 text-[#191b23]">{row.pair[0].value}</Text>
              </View>
              <View className="flex-1 border-l border-[#e0e2ec] pl-4">
                <CardLabel>{row.pair[1].label}</CardLabel>
                <Text className="mt-1 text-[13px] leading-5 text-[#191b23]">{row.pair[1].value}</Text>
              </View>
            </View>
          ) : (
            <View>
              <CardLabel>{row.label}</CardLabel>
              <Text className="mt-1 text-[14px] leading-5 text-[#191b23]">{row.value}</Text>
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  compact,
}: {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  /** Inline button that hugs its label (used inside attention cards). */
  compact?: boolean;
}) {
  const colour = disabled ? "#9fbdff" : "#2563eb";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`items-center justify-center rounded-lg border ${compact ? "h-[42px] self-end px-5" : "py-[14px]"}`}
      style={{ backgroundColor: colour, borderColor: colour, ...cardShadow }}
    >
      <Text className="text-[15px] font-semibold text-white">{label}</Text>
    </Pressable>
  );
}

export function OutlineButton({ label, onPress }: { label: string; onPress?: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="items-center justify-center rounded-lg border border-[#2563eb] py-[14px]"
      style={cardShadow}
    >
      <Text className="text-[15px] font-semibold text-[#2563eb]">{label}</Text>
    </Pressable>
  );
}

export function SearchField({
  label = "Search",
  placeholder,
  value,
  onChangeText,
}: {
  label?: string;
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
}) {
  return (
    <View className="gap-[6px]">
      <Text className="text-[14px] font-medium text-[#374151]">{label}</Text>
      <View className="flex-row items-center rounded-[12px] border border-[#e5e7eb] bg-white px-[17px]">
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#b0b0b0"
          autoCorrect={false}
          className="flex-1 py-[15px] text-[16px] text-black"
        />
        <Ionicons name="search-outline" size={18} color="#111827" />
      </View>
    </View>
  );
}

/** Labelled input row. Without `onChangeText` it renders as a static select (tap it with `onPress`). */
export function FormField({
  label,
  value,
  placeholder,
  icon,
  onChangeText,
  onPress,
  error,
  keyboardType,
}: {
  label: string;
  value: string;
  placeholder?: string;
  icon: ComponentProps<typeof Ionicons>["name"];
  onChangeText?: (text: string) => void;
  onPress?: () => void;
  /** Shown under the field, which also gets a red border. */
  error?: string;
  keyboardType?: ComponentProps<typeof TextInput>["keyboardType"];
}) {
  const content = (
    <View
      className="flex-row items-center rounded-[12px] border bg-white px-[17px]"
      style={{ borderColor: error ? "#ef4444" : "#e5e7eb" }}
    >
      {onChangeText ? (
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#b0b0b0"
          keyboardType={keyboardType}
          className="flex-1 py-[15px] text-[16px] text-black"
        />
      ) : (
        <Text
          className="flex-1 py-[15px] text-[16px]"
          style={{ color: value ? "#000000" : "#b0b0b0" }}
          numberOfLines={1}
        >
          {value || placeholder}
        </Text>
      )}
      <Ionicons name={icon} size={18} color="#111827" />
    </View>
  );

  return (
    <View className="gap-[6px]">
      <Text className="text-[14px] font-medium text-[#374151]">{label}</Text>
      {onPress ? (
        <Pressable accessibilityRole="button" onPress={onPress}>
          {content}
        </Pressable>
      ) : (
        content
      )}
      {error ? <Text className="text-[12px] font-medium text-[#dc2626]">{error}</Text> : null}
    </View>
  );
}

export function NotesCard({
  label,
  placeholder,
  value,
  onChangeText,
  error,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  /** Shown under the card, which also gets a red border. */
  error?: string;
}) {
  return (
    <View className="gap-[6px]">
      <View
        className="min-h-[162px] rounded-[16px] border bg-white p-[17px]"
        style={{ ...cardShadow, borderColor: error ? "#ef4444" : "#e0e2ec" }}
      >
        <CardLabel>{label}</CardLabel>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#ababab"
          multiline
          textAlignVertical="top"
          className="mt-1 min-h-[100px] text-[14px] leading-5 text-[#191b23]"
        />
      </View>
      {error ? <Text className="text-[12px] font-medium text-[#dc2626]">{error}</Text> : null}
    </View>
  );
}

const BANNER_TONES = {
  danger: { background: "#fff5f6", border: "#ffe2e5", color: "#e11d48" },
  success: { background: "#ecffea", border: "#e7ffe2", color: "#16a34a" },
  warning: { background: "#fffdd0", border: "#fdf3a1", color: "#a16207" },
} as const;

export function AlertBanner({ tone, text }: { tone: keyof typeof BANNER_TONES; text: string }) {
  const style = BANNER_TONES[tone];

  return (
    <View
      className="justify-center rounded-[16px] border p-4"
      style={{ backgroundColor: style.background, borderColor: style.border }}
    >
      <Text className="text-[13px] font-medium leading-[20px]" style={{ color: style.color }}>
        {text}
      </Text>
    </View>
  );
}

/** The document's file with an Open button (decision D8: a file card, not a page thumbnail). */
export function FileCard({ name, onOpen }: { name: string; onOpen?: () => void }) {
  return (
    <View className="flex-row items-center rounded-[16px] border border-[#e5e5e5] bg-white p-4" style={cardShadow}>
      <Image source={require("@/assets/images/whs/pdf.png")} style={{ width: 28, height: 28 }} resizeMode="contain" />
      <Text className="ml-3 flex-1 text-[14px] font-medium text-[#111827]" numberOfLines={2}>
        {name}
      </Text>
      {onOpen ? (
        <Pressable accessibilityRole="button" onPress={onOpen} className="ml-3 rounded-lg bg-[#eff6ff] px-4 py-2">
          <Text className="text-[14px] font-semibold text-[#2563eb]">Open</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Full-screen confirmation shown after an upload or inspection is submitted. */
export function CompletionScreen({
  title,
  message,
  onDone,
}: {
  title: string;
  message: string;
  onDone: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-[#edf1f3]" style={{ paddingTop: insets.top }}>
      <View className="items-center pt-6">
        <Image
          source={require("@/assets/images/western-usi-logo.png")}
          style={{ width: 270, height: 33 }}
          resizeMode="contain"
        />
      </View>

      <View className="flex-1 justify-center px-6 pb-16">
        <View className="items-center gap-3">
          <Image
            source={require("@/assets/images/whs/approval.png")}
            style={{ width: 120, height: 120 }}
            resizeMode="contain"
          />
          <Text className="text-center text-[32px] font-bold leading-[41px] tracking-[-0.64px] text-[#1a1c1e]">
            {title}
          </Text>
          <Text className="text-center text-[14px] font-medium leading-[19.6px] text-[#6c7278]">{message}</Text>
        </View>

        <View className="mt-8 items-center">
          <Pressable
            accessibilityRole="button"
            onPress={onDone}
            className="h-12 w-[272px] items-center justify-center rounded-[10px] border border-white bg-[#2563eb]"
          >
            <Text className="text-[17px] font-semibold text-white">Done</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
