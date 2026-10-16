import { Ionicons } from "@expo/vector-icons";
import { api } from "@usi-installer/backend/convex/_generated/api";
import type { Id } from "@usi-installer/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import * as ImagePicker from "expo-image-picker";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, Text, TextInput, View } from "react-native";

import { DateField } from "@/components/whs/date-field";
import { type PickedFile, uploadToStorage } from "@/components/whs/upload-form";
import { NotesCard, PrimaryButton, WhsHeader, WhsScreen } from "@/components/whs/whs-ui";
import { compressPhoto } from "@/lib/compress-photo";
import { toUserMessage } from "@/lib/errors";
import { useAppToast } from "@/lib/toast";
import { parseDisplayDate } from "@/lib/whs-format";
import { KIT_CHECKS, type KitAnswer } from "@/lib/whs-mock";

const NOTES_LIMIT = 500;

const ANSWERS: {
  value: KitAnswer;
  label: string;
  icon: "checkmark-circle" | "warning" | "remove-circle-outline";
  background: string;
  color: string;
  selectedBorder: string;
}[] = [
  { value: "pass", label: "Pass", icon: "checkmark-circle", background: "#f0fdf4", color: "#16a34a", selectedBorder: "#16a34a" },
  { value: "action", label: "Action", icon: "warning", background: "#fef7ee", color: "#d97706", selectedBorder: "#d97706" },
  { value: "na", label: "N/A", icon: "remove-circle-outline", background: "#f8fafc", color: "#64748b", selectedBorder: "#bcbcbc" },
];

interface Errors {
  checks?: string;
  expiry?: string;
  corrective?: string;
}

/**
 * The first-aid kit inspection, on one screen (framework 4F, 8). Submitting
 * sets the next date; no one reviews it afterwards (decision K1).
 */
export default function KitInspectionScreen() {
  const router = useRouter();
  const { kit: kitParam } = useLocalSearchParams<{ kit: string }>();
  const kit = useQuery(api.kits.detail, { kit_id: kitParam ?? "" });
  const generateUploadUrl = useMutation(api.kits.generateUploadUrl);
  const submitInspection = useMutation(api.kits.submitInspection);
  const { showError } = useAppToast();

  const [answers, setAnswers] = useState<Record<string, KitAnswer>>({});
  const [itemsReplaced, setItemsReplaced] = useState("");
  const [earliestExpiry, setEarliestExpiry] = useState("");
  const [corrective, setCorrective] = useState("");
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<PickedFile | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);

  const completed = KIT_CHECKS.filter((check) => answers[check.id]).length;
  const issues = Object.values(answers).filter((answer) => answer === "action").length;

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
      setPhoto({ uri, name: `kit-${Date.now()}.jpg`, mimeType: "image/jpeg" });
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
    if (!kit) return;
    const found: Errors = {};
    if (completed < KIT_CHECKS.length) {
      found.checks = `Answer all ${KIT_CHECKS.length} checks: Pass, Action or N/A.`;
    }
    const expiryIso = parseDisplayDate(earliestExpiry);
    if (expiryIso === null) found.expiry = "Select the earliest expiry date of the stock in the kit.";
    if (issues > 0 && corrective.trim() === "") {
      found.corrective = "Describe the corrective action needed for the checks marked Action.";
    }

    setErrors(found);
    const first = found.checks ?? found.expiry ?? found.corrective;
    if (first !== undefined || expiryIso === null) {
      showError(first ?? "Check the details and try again.");
      return;
    }

    setSubmitting(true);
    try {
      const photoId: Id<"_storage"> | undefined =
        photo === null ? undefined : await uploadToStorage(await generateUploadUrl(), photo);
      const result = await submitInspection({
        kit_id: kit.id,
        answers: KIT_CHECKS.map((check) => ({ check: check.id, answer: answers[check.id] })),
        earliest_expiry: expiryIso,
        items_replaced: itemsReplaced.trim() || undefined,
        corrective_action: issues > 0 ? corrective.trim() : undefined,
        photo: photoId,
        notes: notes.trim() || undefined,
      });
      router.replace(
        `/safety/kit-inspection-done?issues=${result.issues}&next=${result.next_inspection}` as Href,
      );
    } catch (caught) {
      showError(toUserMessage(caught, "Could not submit the inspection. Please try again."));
    } finally {
      setSubmitting(false);
    }
  };

  if (kit === undefined || kit === null) {
    return (
      <WhsScreen>
        <WhsHeader title="Kit Inspection" subtitle="Conduct the kit inspection" />
        {kit === undefined ? (
          <ActivityIndicator className="mt-10" />
        ) : (
          <Text className="text-[15px] text-[#4b5563]">This kit could not be found.</Text>
        )}
      </WhsScreen>
    );
  }

  return (
    <WhsScreen>
      <WhsHeader title="Kit Inspection" subtitle={`Kit ${kit.code} | ${kit.location}`} />

      <View className="gap-[14px]">
        {KIT_CHECKS.map((check) => (
          <View
            key={check.id}
            className="rounded-[16px] border bg-white p-[17px]"
            style={{
              borderColor: errors.checks && !answers[check.id] ? "#ef4444" : "#f3f4f6",
              shadowColor: "#000000",
              shadowOpacity: 0.03,
              shadowRadius: 4,
              shadowOffset: { width: 0, height: 2 },
              elevation: 1,
            }}
          >
            <View className="flex-row items-start pb-[14px]">
              <View className="h-10 w-10 items-center justify-center rounded-xl bg-[#eef5fc]">
                <Ionicons name={check.icon} size={20} color="#2563eb" />
              </View>
              <View className="ml-3 flex-1">
                <Text className="text-[15px] font-bold leading-[20.6px] text-[#0f172a]">{check.title}</Text>
                <Text className="text-[13px] leading-[21px] text-[#64748b]">{check.description}</Text>
              </View>
            </View>

            <View className="flex-row gap-2">
              {ANSWERS.map((option) => {
                const selected = answers[check.id] === option.value;

                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      setAnswers((current) => ({ ...current, [check.id]: option.value }));
                      setErrors((current) => ({ ...current, checks: undefined, corrective: undefined }));
                    }}
                    className="h-[42px] flex-1 flex-row items-center justify-center rounded-[12px] border"
                    style={{
                      backgroundColor: option.background,
                      borderColor: selected ? option.selectedBorder : "transparent",
                    }}
                  >
                    <Ionicons name={option.icon} size={16} color={option.color} />
                    <Text
                      className="ml-[6px] text-[11px] font-bold uppercase tracking-[0.275px]"
                      style={{ color: option.color }}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </View>

      {errors.checks ? (
        <Text className="mt-2 text-[12px] font-medium text-[#dc2626]">{errors.checks}</Text>
      ) : null}

      <View className="mt-4 gap-4">
        <DateField
          label="Earliest stock expiry date"
          value={earliestExpiry}
          onChange={(text) => {
            setEarliestExpiry(text);
            setErrors((current) => ({ ...current, expiry: undefined }));
          }}
          error={errors.expiry}
        />

        {issues > 0 ? (
          <NotesCard
            label="Corrective action required"
            placeholder="What needs to be done, e.g. replace the burn gel and bandages"
            value={corrective}
            onChangeText={(text) => {
              setCorrective(text.slice(0, 1000));
              setErrors((current) => ({ ...current, corrective: undefined }));
            }}
            error={errors.corrective}
          />
        ) : null}

        <View className="gap-[6px]">
          <Text className="text-[13.5px] font-medium leading-[20px] text-[#475569]">Items replaced (optional)</Text>
          <View className="rounded-[16px] border border-[#e5e7eb] bg-white p-[13px]">
            <TextInput
              value={itemsReplaced}
              onChangeText={(text) => setItemsReplaced(text.slice(0, NOTES_LIMIT))}
              placeholder="List any items you replaced..."
              placeholderTextColor="#94a3b8"
              multiline
              textAlignVertical="top"
              className="min-h-[68px] text-[14px] leading-[22.75px] text-[#191b23]"
            />
            <Text className="pt-1 text-right text-[11px] font-medium text-[#94a3b8]">
              {itemsReplaced.length}/{NOTES_LIMIT}
            </Text>
          </View>
        </View>

        <View className="gap-[6px]">
          <Text className="text-[13.5px] font-medium leading-[20px] text-[#475569]">Notes (optional)</Text>
          <View className="rounded-[16px] border border-[#e5e7eb] bg-white p-[13px]">
            <TextInput
              value={notes}
              onChangeText={(text) => setNotes(text.slice(0, NOTES_LIMIT))}
              placeholder="Anything else about the kit..."
              placeholderTextColor="#94a3b8"
              multiline
              textAlignVertical="top"
              className="min-h-[68px] text-[14px] leading-[22.75px] text-[#191b23]"
            />
          </View>
        </View>
      </View>

      <View className="mt-[14px]">
        {photo !== null ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Remove photo" onPress={() => setPhoto(null)}>
            <Image
              source={{ uri: photo.uri }}
              className="h-[180px] w-full rounded-[16px] border border-[#e5e5e5]"
              resizeMode="cover"
            />
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
              <Text className="text-[12px] text-[#64748b]">Attach a photo of the kit, items or issues</Text>
            </View>
          </Pressable>
        )}
      </View>

      <View className="mt-4 gap-[10px]">
        <Text className="px-[2px] text-[12.5px] leading-[18.75px] text-[#64748b]">
          {completed} of {KIT_CHECKS.length} checks completed
        </Text>
        {submitting ? (
          <View className="items-center py-[14px]">
            <ActivityIndicator />
          </View>
        ) : (
          <PrimaryButton label="Submit Inspection" onPress={() => void handleSubmit()} />
        )}
      </View>
    </WhsScreen>
  );
}
