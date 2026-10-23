import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Image, Pressable, Text, View } from "react-native";

import { PrimaryButton, WhsHeader, WhsScreen } from "@/components/whs/whs-ui";
import { useAccreditations } from "@/hooks/use-accreditations";
import { useWhsAttention } from "@/hooks/use-whs-attention";
import { useDocuments } from "@/hooks/use-documents";
import { useEquipmentChecks } from "@/hooks/use-equipment-checks";
import { useKits } from "@/hooks/use-kits";

function SafetyTile({
  icon,
  iconBackground,
  title,
  subtitle,
  onPress,
}: {
  icon: ReactNode;
  iconBackground: string;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="h-[150px] flex-1 justify-between rounded-[16px] border border-[#f1f5f9] bg-white p-4"
      style={{
        shadowColor: "#000000",
        shadowOpacity: 0.05,
        shadowRadius: 5,
        shadowOffset: { width: 0, height: 2 },
        elevation: 1,
      }}
    >
      <View
        className="h-12 w-12 items-center justify-center rounded-[16px]"
        style={{ backgroundColor: iconBackground }}
      >
        {icon}
      </View>
      <View className="gap-1">
        <View className="flex-row items-center justify-between">
          <Text className="flex-1 pr-1 text-[14.5px] font-bold leading-[18px] text-[#0f172a]">{title}</Text>
          <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
        </View>
        <Text className="text-[12px] leading-[18px] text-[#64748b]">{subtitle}</Text>
      </View>
    </Pressable>
  );
}

function TileImage({ source, size = 24 }: { source: number; size?: number }) {
  return <Image source={source} style={{ width: size, height: size }} resizeMode="contain" />;
}

/**
 * "Upload a Document" is hidden for now (decision U7): workers upload
 * accreditation evidence from My Accreditations, and nothing else (framework
 * 10). The button and its screen are kept; set this to true to show it again.
 */
const SHOW_UPLOAD_DOCUMENT = false;

export default function SafetyScreen() {
  const router = useRouter();
  const go = (path: string) => router.push(path as Href);

  const { count: attentionCount } = useWhsAttention();
  const { items: accreditations } = useAccreditations();
  const currentAccreditations = (accreditations ?? []).filter((item) => item.status === "current").length;
  const { items: documents } = useDocuments();
  const { items: kits } = useKits();
  const { items: equipmentChecks } = useEquipmentChecks();
  const countOf = (kind: "swms" | "sds" | "document", noun: string) =>
    documents === undefined ? "Loading…" : `${documents.filter((item) => item.kind === kind).length} ${noun}`;

  return (
    <WhsScreen>
      <WhsHeader title="Safety" subtitle="SWMS, SDS, accreditations & tasks" />

      {attentionCount > 0 && (
        <Pressable
          accessibilityRole="button"
          onPress={() => go("/safety/attention")}
          className="h-24 flex-row items-center rounded-[16px] border border-[#ffe2e5] bg-[#fff5f6] p-[17px]"
        >
          <View className="h-12 w-12 items-center justify-center rounded-xl bg-[#ffebef]">
            <TileImage source={require("@/assets/images/whs/error.png")} size={26} />
          </View>
          <View className="ml-[14px] flex-1">
            <Text className="text-[16px] font-medium text-[#e11d48]">
              {attentionCount} {attentionCount === 1 ? "item needs" : "items need"} your attention
            </Text>
            <Text className="mt-0.5 text-[13px] text-[#64748b]">Tap to see what to do</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#e11d48" />
        </Pressable>
      )}

      <View className="mt-4 gap-[14px]">
        <View className="flex-row gap-[14px]">
          <SafetyTile
            icon={<TileImage source={require("@/assets/images/whs/certificate.png")} size={26} />}
            iconBackground="#eff6ff"
            title={"My\nAccreditations"}
            subtitle={accreditations === undefined ? "Loading…" : `${currentAccreditations} of ${accreditations.length} current`}
            onPress={() => go("/safety/accreditations")}
          />
          <SafetyTile
            icon={<TileImage source={require("@/assets/images/whs/document.png")} />}
            iconBackground="#eff6ff"
            title="SWMS"
            subtitle={countOf("swms", "documents")}
            onPress={() => go("/safety/swms")}
          />
        </View>
        <View className="flex-row gap-[14px]">
          <SafetyTile
            icon={<TileImage source={require("@/assets/images/whs/sds.png")} size={26} />}
            iconBackground="#eff6ff"
            title="SDS"
            subtitle={countOf("sds", "sheets")}
            onPress={() => go("/safety/sds")}
          />
          <SafetyTile
            icon={<TileImage source={require("@/assets/images/whs/safety-documents.png")} />}
            iconBackground="#eff6ff"
            title={"Safety\nDocuments"}
            subtitle={countOf("document", "documents")}
            onPress={() => go("/safety/documents")}
          />
        </View>
        <View className="flex-row gap-[14px]">
          <SafetyTile
            icon={<TileImage source={require("@/assets/images/whs/hospital.png")} />}
            iconBackground="#e4ffe2"
            title={"Medical\nCentres"}
            subtitle="Nearest first"
            onPress={() => go("/safety/medical-centres")}
          />
          <SafetyTile
            icon={<Ionicons name="medkit" size={24} color="#dc2626" />}
            iconBackground="#ffefef"
            title="First-Aid Kits"
            subtitle={kits === undefined ? "Loading…" : `${kits.length} assigned to you`}
            onPress={() => go("/safety/kits")}
          />
        </View>
        <View className="flex-row gap-[14px]">
          <SafetyTile
            icon={<Ionicons name="construct" size={24} color="#d97706" />}
            iconBackground="#fef7ee"
            title={"Equipment\nChecks"}
            subtitle={equipmentChecks === undefined ? "Loading…" : `${equipmentChecks.length} assigned to you`}
            onPress={() => go("/safety/equipment")}
          />
          <View className="flex-1" />
        </View>
      </View>

      <View className="mt-6 gap-4">
        {SHOW_UPLOAD_DOCUMENT ? (
          <PrimaryButton label="Upload a Document" onPress={() => go("/safety/upload-document")} />
        ) : null}
        <Text className="text-center text-[12.5px] leading-[18.75px] text-[#64748b]">
          You only see documents and actions assigned to you.
        </Text>
      </View>
    </WhsScreen>
  );
}
