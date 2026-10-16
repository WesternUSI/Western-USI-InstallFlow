import { Ionicons } from "@expo/vector-icons";
import { api } from "@usi-installer/backend/convex/_generated/api";
import { useAction, useQuery } from "convex/react";
import * as Location from "expo-location";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Linking, Pressable, Text, View } from "react-native";

import { SearchField, WhsHeader, WhsScreen } from "@/components/whs/whs-ui";
import { openMapsDirections } from "@/lib/openMapsLocation";

type Distance = { distance_km: number; drive_km?: number; drive_minutes?: number };

function distanceLabel(distance: Distance): string {
  if (distance.drive_km !== undefined) {
    const minutes = distance.drive_minutes === undefined ? "" : ` · ${distance.drive_minutes} min drive`;
    return `${distance.drive_km.toFixed(1)} km${minutes}`;
  }
  return `${distance.distance_km.toFixed(1)} km away`;
}

type LocationState = "loading" | "ready" | "off" | "denied" | "failed";

const LOCATION_MESSAGE: Record<"off" | "denied" | "failed", string> = {
  off: "Location is turned off on your phone. Turn it on to see the nearest medical centres first.",
  denied: "Location access is needed to show the nearest medical centres first.",
  failed: "We couldn't get your location. Try again to see the nearest medical centres first.",
};

/**
 * The company's medical centres (framework 3, decision D4), nearest first from
 * the phone's location, the same way Optimize Route uses it. Location is
 * required: until it's on, a banner at the top asks for it (decision D15).
 */
export default function MedicalCentresScreen() {
  const centres = useQuery(api.medicalCentres.list);
  const nearest = useAction(api.medicalCentres.nearest);
  const [query, setQuery] = useState("");
  const [distances, setDistances] = useState<Map<string, Distance> | null>(null);
  const [order, setOrder] = useState<string[] | null>(null);
  const [locationState, setLocationState] = useState<LocationState>("loading");
  const [canAskAgain, setCanAskAgain] = useState(true);
  const mounted = useRef(true);

  /** Reads the phone's location (asking for permission when `ask`) and sorts the list from it. */
  const locate = useCallback(
    async (ask: boolean) => {
      try {
        if (!(await Location.hasServicesEnabledAsync())) {
          if (mounted.current) setLocationState("off");
          return;
        }
        const permission = ask
          ? await Location.requestForegroundPermissionsAsync()
          : await Location.getForegroundPermissionsAsync();
        if (!mounted.current) return;
        setCanAskAgain(permission.canAskAgain);
        if (permission.status !== "granted") {
          setLocationState("denied");
          return;
        }
        setLocationState("loading");
        const position = await Location.getCurrentPositionAsync({});
        const result = await nearest({
          origin: { lat: position.coords.latitude, lng: position.coords.longitude },
        });
        if (!mounted.current) return;
        setDistances(new Map(result.map((entry) => [entry.id, entry])));
        setOrder(result.map((entry) => entry.id));
        setLocationState("ready");
      } catch {
        if (mounted.current) setLocationState("failed");
      }
    },
    [nearest],
  );

  useEffect(() => {
    mounted.current = true;
    void locate(true);
    // Coming back from the phone's Settings, check again.
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void locate(false);
    });
    return () => {
      mounted.current = false;
      subscription.remove();
    };
  }, [locate]);

  const turnOnLocation = () => {
    // Once the phone won't show the permission prompt again, or location is
    // switched off altogether, only Settings can turn it back on.
    if (locationState === "off" || (locationState === "denied" && !canAskAgain)) {
      void Linking.openSettings();
      return;
    }
    void locate(true);
  };

  const needle = query.trim().toLowerCase();
  const sorted =
    centres === undefined
      ? []
      : order === null
        ? centres
        : [...centres].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  const shown = sorted.filter((centre) =>
    `${centre.name} ${centre.address} ${centre.suburbs.join(" ")}`.toLowerCase().includes(needle),
  );

  return (
    <WhsScreen>
      <WhsHeader
        title="Medical Centers"
        subtitle={locationState === "ready" ? "Sorted by nearest distance from you" : "Nearest first once we know where you are"}
      />

      {centres === undefined ? (
        <ActivityIndicator className="mt-10" />
      ) : (
        <View className="gap-4">
          {locationState === "off" || locationState === "denied" || locationState === "failed" ? (
            <View className="gap-3 rounded-[16px] border border-[#fdf3a1] bg-[#fffdd0] p-4">
              <View className="flex-row items-start gap-3">
                <Ionicons name="location-outline" size={22} color="#a16207" />
                <Text className="flex-1 text-[14px] font-medium leading-5 text-[#a16207]">
                  {LOCATION_MESSAGE[locationState]}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={turnOnLocation}
                className="h-[42px] items-center justify-center rounded-[12px] bg-[#2563eb]"
              >
                <Text className="text-[14px] font-bold text-white">
                  {locationState === "failed" ? "Try Again" : "Turn On Location"}
                </Text>
              </Pressable>
            </View>
          ) : null}

          <SearchField placeholder="Search by name or suburb" value={query} onChangeText={setQuery} />

          {shown.map((centre) => {
            const distance = distances?.get(centre.id);
            return (
              <View key={centre.id} className="rounded-[16px] border border-[#e5e7eb] bg-white p-4">
                <View className="flex-row items-start justify-between gap-2">
                  <Text className="flex-1 text-[17px] font-semibold leading-[25.5px] tracking-[-0.425px] text-[#111827]">
                    {centre.name}
                  </Text>
                  {distance ? (
                    <Text className="pt-[3px] text-right text-[14px] font-semibold tracking-[-0.35px] text-[#2563eb]">
                      {distanceLabel(distance)}
                    </Text>
                  ) : locationState === "loading" ? (
                    <ActivityIndicator size="small" />
                  ) : null}
                </View>
                <Text className="mt-1 text-[13px] leading-[19.5px] text-[#6b7280]">{centre.address}</Text>

                <View className="mt-3 gap-1">
                  <Text className="text-[12px] text-[#374151]">
                    <Text className="font-semibold">Mon–Fri: </Text>
                    {centre.hours_weekdays}
                  </Text>
                  <Text className="text-[12px] text-[#374151]">
                    <Text className="font-semibold">Sat: </Text>
                    {centre.hours_saturday}
                  </Text>
                  <Text className="text-[12px] text-[#374151]">
                    <Text className="font-semibold">Sun: </Text>
                    {centre.hours_sunday}
                  </Text>
                  <Text className="text-[11px] text-[#9ca3af]">Perth time</Text>
                </View>

                {/* Both buttons hand off to the phone's own dialer / maps app. */}
                <View className="mt-3 flex-row gap-3">
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void Linking.openURL(`tel:${centre.phone.replace(/\s+/g, "")}`)}
                    className="h-[42px] flex-1 flex-row items-center justify-center gap-[6px] rounded-[12px] border border-[#e2e8f0] bg-white"
                  >
                    <Ionicons name="call" size={16} color="#2563eb" />
                    <Text className="text-[14px] font-bold text-[#2563eb]">Call</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => openMapsDirections({ latitude: centre.latitude, longitude: centre.longitude })}
                    className="h-[42px] flex-1 flex-row items-center justify-center gap-[6px] rounded-[12px] bg-[#2563eb]"
                  >
                    <Ionicons name="navigate" size={16} color="#ffffff" />
                    <Text className="text-[14px] font-bold text-white">Navigate</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}

          {shown.length === 0 ? (
            <Text className="py-6 text-center text-[14px] text-[#64748b]">
              {centres.length === 0 ? "No medical centres have been added yet." : "No medical centres match your search."}
            </Text>
          ) : null}
        </View>
      )}
    </WhsScreen>
  );
}
