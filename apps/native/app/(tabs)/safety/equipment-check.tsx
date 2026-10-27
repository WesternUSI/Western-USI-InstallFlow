import { Ionicons } from "@expo/vector-icons";
import { api } from "@usi-installer/backend/convex/_generated/api";
import type { Id } from "@usi-installer/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import * as ImagePicker from "expo-image-picker";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, Text, View } from "react-native";

import { type PickedFile, uploadToStorage } from "@/components/whs/upload-form";
import { NotesCard, PrimaryButton, WhsHeader, WhsScreen } from "@/components/whs/whs-ui";
import { compressPhoto } from "@/lib/compress-photo";
import { toUserMessage } from "@/lib/errors";
import { useAppToast } from "@/lib/toast";
import { formatIsoDate } from "@/lib/whs-format";

interface Errors {
  damage?: string;
  description?: string;
}

function Choice({ label, icon, background, color, selected, onPress }: { label: string; icon: keyof typeof Ionicons.glyphMap; background: string; color: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      className="h-[42px] flex-1 flex-row items-center justify-center rounded-[12px] border"
      style={{ backgroundColor: background, borderColor: selected ? color : "transparent" }}
    >
      <Ionicons name={icon} size={16} color={color} />
      <Text className="ml-[6px] text-[11px] font-bold uppercase tracking-[0.275px]" style={{ color }}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * One equipment check (decision AD49, Mitch 23 Oct): "Any damage?" Yes/No,
 * with a description and optional photo when Yes, and a recommendation.
 * Done once; the office reviews any damage found.
 */
export default function EquipmentCheckScreen() {
  const router = useRouter();
  const { check: checkParam } = useLocalSearchParams<{ check: string }>();
  const check = useQuery(api.equipment.checkDetail, { check_id: checkParam ?? "" });
  const generateUploadUrl = useMutation(api.equipment.generateUploadUrl);
  const submitCheck = useMutation(api.equipment.submitCheck);
  const { showError } = useAppToast();

  const [damage, setDamage] = useState<boolean | null>(null);
  const [description, setDescription] = useState("");
  const [recommendation, setRecommendation] = useState("");
  const [photo, setPhoto] = useState<PickedFile | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);

  if (check === undefined || check === null) {
    return (
      <WhsScreen>
        <WhsHeader title="Equipment Check" subtitle="Check the item" />
        {check === undefined ? (
          <ActivityIndicator className="mt-10" />
        ) : (
          <Text className="text-[15px] text-[#4b5563]">This check has already been done or is no longer assigned to you.</Text>
        )}
      </WhsScreen>
    );
  }

  const addPhoto = async (source: "camera" | "library") => {
    if (source === "camera") {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Camera permission needed", "Enable camera access for this app in your device Settings.");
        return;
      }
    }
    const result =
      source === "camera"
        ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (!result.canceled && result.assets.length > 0) {
      const uri = await compressPhoto(result.assets[0]);
      setPhoto({ uri, name: `equipment-${Date.now()}.jpg`, mimeType: "image/jpeg" });
    }
  };

  const pickPhoto = () => {
    Alert.alert("Add a photo", undefined, [
      { text: "Take a photo", onPress: () => void addPhoto("camera") },
      { text: "Choose a photo", onPress: () => void addPhoto("library") },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const handleSubmit = async () => {
    const found: Errors = {};
    if (damage === null) found.damage = "Say whether there is any damage.";
    if (damage === true && description.trim() === "") found.description = "Describe the damage.";
    setErrors(found);
    const first = found.damage ?? found.description;
    if (first !== undefined || damage === null) {
      showError(first ?? "Check the details and try again.");
      return;
    }

    setSubmitting(true);
    try {
      const photoId: Id<"_storage"> | undefined =
        damage && photo !== null ? await uploadToStorage(await generateUploadUrl(), photo) : undefined;
      const result = await submitCheck({
        check_id: check.id,
        damage_found: damage,
        damage_description: damage ? description.trim() : undefined,
        recommendation: recommendation.trim() || undefined,
        photo: photoId,
      });
      router.replace(`/safety/equipment-check-done?issue=${result.issue ? 1 : 0}` as Href);
    } catch (caught) {
      showError(toUserMessage(caught, "Could not submit the check. Please try again."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <WhsScreen>
      <WhsHeader title="Equipment Check" subtitle={`${check.title} | ${check.subtitle}`} />

      <Text className="mb-3 text-[13px] text-[#64748b]">
        Check by {formatIsoDate(check.due)}
        {check.damage && check.damage.toLowerCase() !== "nil" ? `. Known damage: ${check.damage}` : ""}
      </Text>

      <View className="gap-4">
        <View
          className="rounded-[16px] border bg-white p-[17px]"
          style={{
            borderColor: errors.damage ? "#ef4444" : "#f3f4f6",
            shadowColor: "#000000",
            shadowOpacity: 0.03,
            shadowRadius: 4,
            shadowOffset: { width: 0, height: 2 },
            elevation: 1,
          }}
        >
          <Text className="pb-[14px] text-[15px] font-bold leading-[20.6px] text-[#0f172a]">Any damage?</Text>
          <View className="flex-row gap-2">
            <Choice
              label="No"
              icon="checkmark-circle"
              background="#f0fdf4"
              color="#16a34a"
              selected={damage === false}
              onPress={() => {
                setDamage(false);
                setErrors({});
              }}
            />
            <Choice
              label="Yes"
              icon="warning"
              background="#fef2f2"
              color="#dc2626"
              selected={damage === true}
              onPress={() => {
                setDamage(true);
                setErrors((current) => ({ ...current, damage: undefined }));
              }}
            />
          </View>
        </View>
        {errors.damage ? <Text className="text-[12px] font-medium text-[#dc2626]">{errors.damage}</Text> : null}

        {damage ? (
          <>
            <NotesCard
              label="Describe the damage"
              placeholder="e.g. Rope frayed near the pulley"
              value={description}
              onChangeText={(value) => {
                setDescription(value.slice(0, 1000));
                setErrors((current) => ({ ...current, description: undefined }));
              }}
              error={errors.description}
            />
            {photo !== null ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Remove photo" onPress={() => setPhoto(null)}>
                <Image source={{ uri: photo.uri }} className="h-[180px] w-full rounded-[16px] border border-[#e5e5e5]" resizeMode="cover" />
                <Text className="mt-1 text-center text-[12px] text-[#64748b]">Tap to remove</Text>
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={pickPhoto}
                className="flex-row items-center rounded-[16px] border-2 border-dashed border-[#cbd5e1] bg-[#f8fafc] px-[18px] pb-[14px] pt-[18px]"
              >
                <View className="h-10 w-10 items-center justify-center rounded-xl border border-[#e5e7eb] bg-white">
                  <Ionicons name="camera-outline" size={20} color="#1e40af" />
                </View>
                <View className="ml-[14px] gap-[2px]">
                  <Text className="text-[14px] font-semibold text-[#1e40af]">
                    Add Photo <Text className="font-normal text-[#64748b]">(optional)</Text>
                  </Text>
                  <Text className="text-[12px] text-[#64748b]">Attach a photo of the damage</Text>
                </View>
              </Pressable>
            )}
          </>
        ) : null}

        <NotesCard
          label="Recommendation (optional)"
          placeholder="e.g. Replace the rope before next use"
          value={recommendation}
          onChangeText={(value) => setRecommendation(value.slice(0, 1000))}
        />
      </View>

      <View className="mt-4">
        {submitting ? (
          <View className="items-center py-[14px]">
            <ActivityIndicator />
          </View>
        ) : (
          <PrimaryButton label="Submit Check" onPress={() => void handleSubmit()} />
        )}
      </View>
    </WhsScreen>
  );
}
