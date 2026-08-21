import { api } from "@usi-installer/backend/convex/_generated/api";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "convex/react";
import { type Href, useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTeamContext } from "@/contexts/team-context";
import { listWorkOrderCards, type WorkOrderCard } from "@/lib/groupWorkOrders";

const ALL_AREAS = "All areas";
const PAGE_SIZE = 5;

function DropdownField({
  label,
  value,
  open,
  onToggle,
  children,
}: {
  label: string;
  value: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <View className="mt-4" style={{ zIndex: open ? 50 : 1, elevation: open ? 6 : 0 }}>
      <Text className="mb-1 text-[12px] font-semibold text-[#6c7278]">{label}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onToggle}
        className="flex-row items-center justify-between rounded-xl border border-[#e2e8f0] bg-white px-3.5 py-3"
      >
        <Text className="flex-1 text-[14px] font-semibold text-[#1a1c1e]" numberOfLines={1}>
          {value}
        </Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color="#6c7278" />
      </Pressable>

      {open && (
        <View
          className="rounded-xl border border-[#e2e8f0] bg-white"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: 4,
            shadowColor: "#0f172a",
            shadowOpacity: 0.12,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 4 },
            elevation: 8,
          }}
        >
          {children}
        </View>
      )}
    </View>
  );
}

function OptionRow({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="flex-row items-center justify-between border-b border-[#f1f5f9] px-3.5 py-3"
    >
      <Text className="text-[14px] font-medium text-[#1a1c1e]">{label}</Text>
      {selected && <Ionicons name="checkmark" size={16} color="#2563eb" />}
    </Pressable>
  );
}

function AreaProgressRow({
  line,
  completed,
  imported,
}: {
  line: string;
  completed: number;
  imported: number;
}) {
  return (
    <View className="mb-3 flex-row items-center justify-between rounded-2xl border border-[#e2e8f0] bg-white px-4 py-4">
      <Text className="text-[15px] font-bold text-[#1a1c1e]">{line}</Text>
      <Text className="text-[14px] font-semibold text-[#2563eb]">
        {completed}/{imported} comp
      </Text>
    </View>
  );
}

function SiteCard({ card }: { card: WorkOrderCard }) {
  const router = useRouter();
  const goToDetail = () =>
    router.push(
      `/work-orders/install-detail?ids=${encodeURIComponent(card.workOrderIds.join(","))}` as Href,
    );

  return (
    <View
      className={`mb-3.5 rounded-2xl bg-white px-4 py-4 ${
        card.priority ? "border-2 border-[#ef4444]" : "border border-[#e2e8f0]"
      }`}
    >
      <Pressable accessibilityRole="button" onPress={goToDetail} className="flex-row items-start justify-between">
        <View className="flex-1 pr-2">
          <Text className="text-[15px] font-bold text-[#1a1c1e]">{card.panelNameLabel}</Text>
          <Text className="mt-0.5 text-[13px] font-medium text-[#6c7278]">{card.site}</Text>
          <Text className="mt-0.5 text-[12px] font-medium text-[#94a3b8]">
            {card.panelIdsLabel}
          </Text>
        </View>
        <View className="items-end" style={{ gap: 5 }}>
          {card.assignedTeam.length > 0 && (
            <View className="rounded-full bg-[#e8f0ff] px-2.5 py-1">
              <Text className="text-[10px] font-semibold text-[#2563eb]">
                {card.assignedTeam.join(" & ")}
              </Text>
            </View>
          )}
          {card.priority && (
            <View className="rounded-full bg-[#fee2e2] px-2.5 py-1">
              <Text className="text-[10px] font-semibold text-[#dc2626]">Priority Pulldown</Text>
            </View>
          )}
        </View>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        onPress={goToDetail}
        className="mt-3.5 h-[44px] items-center justify-center rounded-xl bg-[#16a34a]"
      >
        <Text className="text-[14px] font-bold text-white">Complete Installation</Text>
      </Pressable>
    </View>
  );
}

export default function CompleteInstallsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isLoaded, primaryTeam } = useTeamContext();

  const byArea = useQuery(api.workorders.byArea);
  const rows = useQuery(
    api.workorders.listAllocatedWorkOrders,
    primaryTeam === undefined
      ? "skip"
      : { team: primaryTeam },
  );

  const [areaDropdownOpen, setAreaDropdownOpen] = React.useState(false);
  const [selectedArea, setSelectedArea] = React.useState(ALL_AREAS);
  const [reversed, setReversed] = React.useState(false);
  const [visibleCount, setVisibleCount] = React.useState(PAGE_SIZE);

  const areaOptions = React.useMemo(() => {
    if (!rows) return [ALL_AREAS];
    const areas = [...new Set(rows.map((r) => r.area_progress?.trim() || "Unassigned"))].sort(
      (a, b) => a.localeCompare(b),
    );
    return [ALL_AREAS, ...areas];
  }, [rows]);

  const filteredRows = React.useMemo(() => {
    if (!rows) return [];
    if (selectedArea === ALL_AREAS) return rows;
    return rows.filter((row) => (row.area_progress?.trim() || "Unassigned") === selectedArea);
  }, [rows, selectedArea]);

  const cards = React.useMemo(() => {
    const built = listWorkOrderCards(filteredRows);
    // SRS FR-CI-6: default is furthest-from-East-Perth first, Reverse Order
    // flips to nearest-first. Cards whose site has no usable GPS coordinates
    // can't be placed either way, so they sort last regardless of direction.
    const withDistance = built.filter((card) => card.distanceKm !== null);
    const withoutDistance = built.filter((card) => card.distanceKm === null);
    withDistance.sort((a, b) =>
      reversed ? a.distanceKm! - b.distanceKm! : b.distanceKm! - a.distanceKm!,
    );
    return [...withDistance, ...withoutDistance];
  }, [filteredRows, reversed]);

  const visibleCards = cards.slice(0, visibleCount);
  const canShowMore = visibleCount < cards.length;

  const teamSummary = primaryTeam ?? "No team";

  const isFiltered = selectedArea !== ALL_AREAS || visibleCount > PAGE_SIZE;

  const handleShowAll = () => {
    setSelectedArea(ALL_AREAS);
    setVisibleCount(PAGE_SIZE);
  };

  const header = (
    <View className="flex-row items-start px-4 pt-2">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={12}
        onPress={() => router.back()}
        className="mt-1 mr-3"
      >
        <Ionicons name="chevron-back" size={24} color="#1a1c1e" />
      </Pressable>
      <View className="flex-1">
        <Text className="text-[22px] font-extrabold text-[#1a1c1e]">Complete Installs</Text>
        <Text className="mt-0.5 text-[13px] font-medium text-[#6c7278]">
          Search and manage all sites
        </Text>
      </View>
    </View>
  );

  const isLoading = !isLoaded || byArea === undefined || (primaryTeam !== undefined && rows === undefined);

  if (isLoading) {
    return (
      <View className="flex-1 bg-[#f7f9fb]" style={{ paddingTop: insets.top }}>
        {header}
        <View className="mt-16 items-center">
          <ActivityIndicator color="#2563eb" />
        </View>
      </View>
    );
  }

  if (primaryTeam === undefined) {
    return (
      <View className="flex-1 bg-[#f7f9fb]" style={{ paddingTop: insets.top }}>
        {header}
        <View className="mx-4 mt-8 rounded-2xl border border-[#fde68a] bg-[#fffbeb] px-5 py-6">
          <Text className="text-[15px] font-bold text-[#92400e]">No primary team assigned</Text>
          <Text className="mt-2 text-[13px] font-medium text-[#92400e]">
            Ask your admin to assign your primary team before completing installs.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#f7f9fb]" style={{ paddingTop: insets.top }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
      >
        {header}

        <View className="mt-5 px-4">
          <Text className="mb-1 text-[12px] font-semibold text-[#6c7278]">Select Team</Text>
          <View className="flex-row items-center justify-between rounded-xl border border-[#e2e8f0] bg-[#f1f5f9] px-3.5 py-3">
            <Text className="flex-1 text-[14px] font-semibold text-[#94a3b8]" numberOfLines={1}>
              {teamSummary}
            </Text>
            <Ionicons name="lock-closed" size={14} color="#94a3b8" />
          </View>

          <DropdownField
            label="Installation Area"
            value={selectedArea}
            open={areaDropdownOpen}
            onToggle={() => setAreaDropdownOpen((open) => !open)}
          >
            <ScrollView style={{ maxHeight: 240 }} showsVerticalScrollIndicator={false}>
              {areaOptions.map((option) => (
                <OptionRow
                  key={option}
                  label={option}
                  selected={option === selectedArea}
                  onPress={() => {
                    setSelectedArea(option);
                    setAreaDropdownOpen(false);
                  }}
                />
              ))}
            </ScrollView>
          </DropdownField>

          <View className="mt-4 flex-row" style={{ gap: 10 }}>
            <Pressable
              accessibilityRole="button"
              disabled={!isFiltered}
              onPress={handleShowAll}
              className="h-[44px] flex-1 flex-row items-center justify-center rounded-2xl border"
              style={{
                borderColor: isFiltered ? "#e2e8f0" : "#f1f5f9",
                backgroundColor: isFiltered ? "#ffffff" : "#f7f9fb",
                gap: 6,
              }}
            >
              <Ionicons name="refresh" size={15} color={isFiltered ? "#1a1c1e" : "#cbd5e1"} />
              <Text
                className="text-[14px] font-bold"
                style={{ color: isFiltered ? "#1a1c1e" : "#cbd5e1" }}
              >
                Show All
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setReversed((current) => !current)}
              className="h-[44px] flex-1 items-center justify-center rounded-2xl bg-[#2563eb]"
            >
              <Text className="text-[14px] font-bold text-white">
                {reversed ? "Restore Original" : "Reverse Order"}
              </Text>
            </Pressable>
          </View>
        </View>
        <View className="mt-5 px-4">
          {(byArea ?? []).map((row) => (
            <AreaProgressRow
              key={row.train_line}
              line={row.train_line}
              completed={row.completed}
              imported={row.imported}
            />
          ))}
        </View>

        <View className="mt-2 px-4">
          <Text className="mb-3 text-[16px] font-bold text-[#1a1c1e]">Site Locations</Text>

          {cards.length === 0 ? (
            <Text className="text-[13px] font-medium text-[#6c7278]">
              No allocated installs for the selected team(s).
            </Text>
          ) : (
            visibleCards.map((card) => <SiteCard key={card.key} card={card} />)
          )}
        </View>

        {canShowMore && (
          <Pressable
            accessibilityRole="button"
            onPress={() => setVisibleCount((count) => count + PAGE_SIZE)}
            className="mx-4 mt-1 h-[46px] items-center justify-center rounded-2xl bg-[#2563eb]"
          >
            <Text className="text-[14px] font-bold text-white">Show More Installs</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}
