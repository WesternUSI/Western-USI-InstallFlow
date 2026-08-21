import { api } from "@usi-installer/backend/convex/_generated/api";
import type { Id } from "@usi-installer/backend/convex/_generated/dataModel";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { useToast } from "heroui-native";
import React from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTeamContext } from "@/contexts/team-context";
import { useCurrentUser } from "@/hooks/use-current-user";
import { listWorkOrderCards, type WorkOrderCard } from "@/lib/groupWorkOrders";

const ALL_AREAS = "All areas";
const ALL_ADVERTISERS = "All advertisers";
const PAGE_SIZE = 5;

type OpenDropdown = "team" | "area" | "advertiser" | null;

/**
 * A dropdown that opens directly beneath its own input, as an overlay that
 * floats above whatever comes after it rather than pushing it down. `open`
 * pushes this field's stacking order above later siblings so its panel isn't
 * painted over by the next field in the column.
 */
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

function WorkOrderAllocateCard({
  card,
  checked,
  isAllocated,
  onToggle,
}: {
  card: WorkOrderCard;
  checked: boolean;
  isAllocated: boolean;
  onToggle: () => void;
}) {
  const mutedText = isAllocated ? "text-[#94a3b8]" : "text-[#1a1c1e]";
  const mutedSubtext = isAllocated ? "text-[#b7bec6]" : "text-[#6c7278]";

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={onToggle}
      className={`mb-3.5 rounded-2xl bg-white px-4 py-4 ${
        card.priority ? "border-2 border-[#ef4444]" : "border border-[#e2e8f0]"
      }`}
    >
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-2">
          <Text className={`text-[15px] font-bold ${mutedText}`}>{card.panelNameLabel}</Text>
          <Text className={`mt-0.5 text-[13px] font-medium ${mutedSubtext}`}>{card.site}</Text>
          <Text className={`mt-0.5 text-[12px] font-medium ${mutedSubtext}`}>
            {card.panelIdsLabel}
          </Text>
        </View>

        <View className="items-end">
          <View
            className="items-center justify-center rounded-md"
            style={{
              width: 20,
              height: 20,
              borderWidth: 2,
              borderColor: checked ? "#2563eb" : "#cbd5e1",
              backgroundColor: checked ? "#2563eb" : "transparent",
            }}
          >
            {checked && <Ionicons name="checkmark" size={14} color="#ffffff" />}
          </View>
          <View className="mt-2 items-end" style={{ gap: 5 }}>
            {isAllocated && (
              <View className="rounded-full bg-[#dcfce7] px-2.5 py-1">
                <Text className="text-[10px] font-semibold text-[#16a34a]">
                  Allocated · {card.assignedTeam.join(" & ")}
                </Text>
              </View>
            )}
            {card.priority && (
              <View className="rounded-full bg-[#fee2e2] px-2.5 py-1">
                <Text className="text-[10px] font-semibold text-[#dc2626]">Priority Pulldown</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      <View className="my-3 h-px bg-[#e2e8f0]" />

      <View className="flex-row">
        <View className="flex-1">
          <Text className="text-[10px] font-bold tracking-[1px] text-[#94a3b8]">ADVERTISER</Text>
          <Text className={`mt-0.5 text-[13px] font-bold ${mutedText}`}>
            {card.advertisersLabel}
          </Text>
        </View>
        <View className="flex-1">
          <Text className="text-[10px] font-bold tracking-[1px] text-[#94a3b8]">SIZE</Text>
          <Text className={`mt-0.5 text-[13px] font-bold ${mutedText}`}>{card.size ?? "—"}</Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function AllocateInstallsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isLoaded: userLoaded } = useCurrentUser();
  const { primaryTeam, teams: allTeams } = useTeamContext();
  const { toast } = useToast();

  const rows = useQuery(api.workorders.listActiveWorkOrders);
  const byArea = useQuery(api.workorders.byArea);
  const searchOptions = useQuery(api.workorders.searchOptions);
  const allocateWorkOrders = useMutation(api.workorders.allocateWorkOrders);
  const unallocateWorkOrders = useMutation(api.workorders.unallocateWorkOrders);

  // Which team this screen is currently acting on behalf of. Independent of
  // `primaryTeam` on purpose — anyone can pick any team here and allocate or
  // unallocate on its behalf, it's never saved, and it always starts back on
  // the user's own primary team the next time this screen is opened.
  const [selectedTeam, setSelectedTeam] = React.useState<string | undefined>(undefined);
  React.useEffect(() => {
    if (primaryTeam !== undefined) setSelectedTeam(primaryTeam);
  }, [primaryTeam]);

  const [checkedOrderIds, setCheckedOrderIds] = React.useState<Set<string>>(new Set());
  const [visibleCount, setVisibleCount] = React.useState(PAGE_SIZE);
  const [busy, setBusy] = React.useState(false);

  const [openDropdown, setOpenDropdown] = React.useState<OpenDropdown>(null);
  const [selectedArea, setSelectedArea] = React.useState(ALL_AREAS);
  const [selectedAdvertiser, setSelectedAdvertiser] = React.useState(ALL_ADVERTISERS);

  const toggleDropdown = (name: Exclude<OpenDropdown, null>) =>
    setOpenDropdown((current) => (current === name ? null : name));

  const areaOptions = React.useMemo(() => {
    if (!rows) return [ALL_AREAS];
    const areas = [...new Set(rows.map((r) => r.area_progress?.trim() || "Unassigned"))].sort(
      (a, b) => a.localeCompare(b),
    );
    return [ALL_AREAS, ...areas];
  }, [rows]);

  const advertiserOptions = React.useMemo(() => {
    const advertisers = (searchOptions ?? [])
      .filter((o) => o.kind === "Advertiser")
      .map((o) => o.value)
      .sort((a, b) => a.localeCompare(b));
    return [ALL_ADVERTISERS, ...advertisers];
  }, [searchOptions]);

  const filteredRows = React.useMemo(() => {
    if (!rows) return [];
    return rows.filter((row) => {
      const areaMatches =
        selectedArea === ALL_AREAS || (row.area_progress?.trim() || "Unassigned") === selectedArea;
      const advertiserMatches =
        selectedAdvertiser === ALL_ADVERTISERS || row.advertiser_campaign === selectedAdvertiser;
      // Work orders already allocated to a team other than the one currently
      // selected here are none of this view's business — only unallocated
      // rows and rows for the selected team show up.
      const teamVisible = row.assigned_team === undefined || row.assigned_team === selectedTeam;
      return areaMatches && advertiserMatches && teamVisible;
    });
  }, [rows, selectedArea, selectedAdvertiser, selectedTeam]);

  const cards = React.useMemo(() => listWorkOrderCards(filteredRows), [filteredRows]);
  const visibleCards = cards.slice(0, visibleCount);
  const canShowMore = visibleCount < cards.length;

  const isLoading = !userLoaded || rows === undefined || byArea === undefined;

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
        <Text className="text-[22px] font-extrabold text-[#1a1c1e]">Allocate Installs</Text>
        <Text className="mt-0.5 text-[13px] font-medium text-[#6c7278]">
          Choose installation orders to complete
        </Text>
      </View>
    </View>
  );

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
            Ask your admin to assign your primary team before allocating installs.
          </Text>
        </View>
      </View>
    );
  }

  const toggleOrder = (key: string) => {
    setCheckedOrderIds((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleShowAll = () => {
    setSelectedArea(ALL_AREAS);
    setSelectedAdvertiser(ALL_ADVERTISERS);
    setVisibleCount(PAGE_SIZE);
  };

  const checkedCards = cards.filter((card) => checkedOrderIds.has(card.key));
  const toAllocate = checkedCards.filter((card) => !card.assignedTeam.includes(selectedTeam ?? ""));
  const toUnallocate = checkedCards.filter((card) => card.assignedTeam.includes(selectedTeam ?? ""));

  const runBulkAction = async (
    action: "allocate" | "unallocate",
    targetCards: WorkOrderCard[],
  ) => {
    if (selectedTeam === undefined || targetCards.length === 0) return;

    const team = selectedTeam;
    const ids = targetCards.flatMap((card) => card.workOrderIds) as Id<"workorders">[];

    setBusy(true);
    try {
      if (action === "allocate") {
        await allocateWorkOrders({ ids, team });
      } else {
        await unallocateWorkOrders({ ids, team });
      }
      setCheckedOrderIds((current) => {
        const next = new Set(current);
        for (const card of targetCards) next.delete(card.key);
        return next;
      });
      toast.show({
        label: action === "allocate" ? "Allocated" : "Unallocated",
        description: `${targetCards.length} install${targetCards.length === 1 ? "" : "s"} ${
          action === "allocate" ? "allocated to" : "removed from"
        } ${team}.`,
        variant: "success",
      });
    } catch (error) {
      toast.show({
        label: action === "allocate" ? "Couldn't allocate" : "Couldn't unallocate",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "danger",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="flex-1 bg-[#f7f9fb]" style={{ paddingTop: insets.top }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
      >
        {header}

        <View className="mt-5 px-4">
          <DropdownField
            label="Select Team"
            value={selectedTeam ?? "Select a team"}
            open={openDropdown === "team"}
            onToggle={() => toggleDropdown("team")}
          >
            {allTeams.map((team) => (
              <OptionRow
                key={team}
                label={team === primaryTeam ? `${team} (Primary)` : team}
                selected={team === selectedTeam}
                onPress={() => {
                  setSelectedTeam(team);
                  setOpenDropdown(null);
                }}
              />
            ))}
          </DropdownField>

          <DropdownField
            label="Installation Area"
            value={selectedArea}
            open={openDropdown === "area"}
            onToggle={() => toggleDropdown("area")}
          >
            <ScrollView style={{ maxHeight: 240 }} showsVerticalScrollIndicator={false}>
              {areaOptions.map((option) => (
                <OptionRow
                  key={option}
                  label={option}
                  selected={option === selectedArea}
                  onPress={() => {
                    setSelectedArea(option);
                    setOpenDropdown(null);
                  }}
                />
              ))}
            </ScrollView>
          </DropdownField>

          <DropdownField
            label="Advertiser"
            value={selectedAdvertiser}
            open={openDropdown === "advertiser"}
            onToggle={() => toggleDropdown("advertiser")}
          >
            <ScrollView style={{ maxHeight: 240 }} showsVerticalScrollIndicator={false}>
              {advertiserOptions.map((option) => (
                <OptionRow
                  key={option}
                  label={option}
                  selected={option === selectedAdvertiser}
                  onPress={() => {
                    setSelectedAdvertiser(option);
                    setOpenDropdown(null);
                  }}
                />
              ))}
            </ScrollView>
          </DropdownField>

          <Pressable
            accessibilityRole="button"
            onPress={handleShowAll}
            className="mt-4 h-[44px] items-center justify-center rounded-2xl bg-[#2563eb]"
          >
            <Text className="text-[14px] font-bold text-white">Show All</Text>
          </Pressable>
        </View>

        <View className="mt-5 px-4">
          {byArea.map((row) => (
            <AreaProgressRow
              key={row.train_line}
              line={row.train_line}
              completed={row.completed}
              imported={row.imported}
            />
          ))}
        </View>

        <View className="px-4">
          {cards.length === 0 ? (
            <Text className="text-[13px] font-medium text-[#6c7278]">
              No work orders match these filters.
            </Text>
          ) : (
            visibleCards.map((card) => (
              <WorkOrderAllocateCard
                key={card.key}
                card={card}
                checked={checkedOrderIds.has(card.key)}
                isAllocated={card.assignedTeam.includes(selectedTeam ?? "")}
                onToggle={() => toggleOrder(card.key)}
              />
            ))
          )}
        </View>

        {canShowMore && (
          <Pressable
            accessibilityRole="button"
            onPress={() => setVisibleCount((count) => count + PAGE_SIZE)}
            className="mx-4 mt-1 h-[46px] items-center justify-center rounded-2xl border border-[#bfdbfe] bg-[#eff6ff]"
          >
            <Text className="text-[14px] font-bold text-[#2563eb]">Show More</Text>
          </Pressable>
        )}
      </ScrollView>

      <View
        className="border-t border-[#e2e8f0] bg-[#f7f9fb] px-4 pt-3"
        style={{ paddingBottom: Math.max(insets.bottom, 12) }}
      >
        {toAllocate.length > 0 && (
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => runBulkAction("allocate", toAllocate)}
            className="h-[48px] items-center justify-center rounded-2xl bg-[#2563eb]"
          >
            <Text className="text-[14px] font-bold text-white">
              Allocate Installs ({toAllocate.length})
            </Text>
          </Pressable>
        )}

        {toUnallocate.length > 0 && (
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => runBulkAction("unallocate", toUnallocate)}
            className="mt-2 h-[44px] items-center justify-center rounded-2xl bg-[#fee2e2]"
          >
            <Text className="text-[14px] font-bold text-[#dc2626]">
              Unallocate Installs ({toUnallocate.length})
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
