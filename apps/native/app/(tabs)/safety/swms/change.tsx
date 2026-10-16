import { Ionicons } from "@expo/vector-icons";
import { api } from "@usi-installer/backend/convex/_generated/api";
import type { Id } from "@usi-installer/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import * as ImagePicker from "expo-image-picker";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, Image, Modal, Pressable, Text, View } from "react-native";

import { DateField } from "@/components/whs/date-field";
import { type SignatureData, SignaturePad, SignatureView } from "@/components/whs/signature-pad";
import { type PickedFile, uploadToStorage } from "@/components/whs/upload-form";
import { FormField, NotesCard, PrimaryButton, WhsHeader, WhsScreen } from "@/components/whs/whs-ui";
import { compressPhoto } from "@/lib/compress-photo";
import { toUserMessage } from "@/lib/errors";
import { useAppToast } from "@/lib/toast";
import { parseDisplayDate } from "@/lib/whs-format";

/** The client's SWMS risk matrix (section 6): likelihood rows 1-4, consequence columns A-D. */
const LIKELIHOOD = [
  { row: "1", label: "Almost certain" },
  { row: "2", label: "Likely" },
  { row: "3", label: "Moderate" },
  { row: "4", label: "Unlikely" },
];
const CONSEQUENCE = [
  { col: "A", label: "Death / catastrophic" },
  { col: "B", label: "Major, extensive injuries" },
  { col: "C", label: "Moderate, medical treatment" },
  { col: "D", label: "Minor, no injuries" },
];

const MAX_PHOTOS = 6;
const TEXT_LIMIT = 1000;

type Field = "date" | "time" | "change" | "riskBefore" | "control" | "riskAfter" | "approvedBy" | "signature";
type Errors = Partial<Record<Field, string>>;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

/**
 * Record an on-site change to a SWMS (decision D3, section 11 of the client's
 * SWMS) and sign it in the same step. Work isn't held up: the admin is emailed
 * and validates it later.
 */
export default function SwmsChangeScreen() {
  const router = useRouter();
  const { document, title } = useLocalSearchParams<{ document: string; title?: string }>();
  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
  const reportChange = useMutation(api.documents.reportChange);
  const savedSignature = useQuery(api.documents.mySignature);
  const saveSignature = useMutation(api.documents.saveSignature);
  const { showError, showSuccess } = useAppToast();

  const now = new Date();
  const [date, setDate] = useState(`${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`);
  const [time, setTime] = useState(`${pad(now.getHours())}:${pad(now.getMinutes())}`);
  const [change, setChange] = useState("");
  const [riskBefore, setRiskBefore] = useState<string | null>(null);
  const [control, setControl] = useState("");
  const [riskAfter, setRiskAfter] = useState<string | null>(null);
  const [approvedBy, setApprovedBy] = useState("");
  const [trigger, setTrigger] = useState("");
  const [site, setSite] = useState("");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<PickedFile[]>([]);
  const [picking, setPicking] = useState<"riskBefore" | "riskAfter" | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [redraw, setRedraw] = useState(false);
  const [drawn, setDrawn] = useState<SignatureData | null>(null);
  const [signing, setSigning] = useState(false);

  const drawing = savedSignature === null || redraw;

  const clear = (field: Field) => setErrors((current) => ({ ...current, [field]: undefined }));

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
      setPhotos((current) => [...current, { uri, name: `photo-${Date.now()}.jpg`, mimeType: "image/jpeg" }]);
    }
  };

  const pickPhoto = () => {
    if (photos.length >= MAX_PHOTOS) {
      showError(`You can add up to ${MAX_PHOTOS} photos.`);
      return;
    }
    Alert.alert("Add a photo", undefined, [
      { text: "Take a photo", onPress: () => void addPhoto("camera") },
      { text: "Choose a photo", onPress: () => void addPhoto("library") },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const handleSubmit = async () => {
    const found: Errors = {};
    const dateIso = parseDisplayDate(date);
    if (dateIso === null) found.date = "Select the date of the change.";
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time.trim())) found.time = "Enter the time as hh:mm, e.g. 14:30.";
    if (change.trim() === "") found.change = "Describe the change or new hazard.";
    if (riskBefore === null) found.riskBefore = "Select the risk rating before the new control.";
    if (control.trim() === "") found.control = "Describe the additional control or revised method.";
    if (riskAfter === null) found.riskAfter = "Select the risk rating after the new control.";
    if (approvedBy.trim() === "") found.approvedBy = "Enter who approved or briefed the change.";
    if (drawing && drawn === null) found.signature = "Sign in the box to confirm you've been briefed.";

    setErrors(found);
    const first = Object.values(found).find((message) => message !== undefined);
    if (first !== undefined || dateIso === null || riskBefore === null || riskAfter === null) {
      showError(first ?? "Check the details and try again.");
      return;
    }

    setSubmitting(true);
    try {
      if (drawing && drawn !== null) await saveSignature(drawn);
      const photoIds: Id<"_storage">[] = [];
      for (const photo of photos) {
        photoIds.push(await uploadToStorage(await generateUploadUrl(), photo));
      }
      const { change_id } = await reportChange({
        document_id: document as Id<"whs_documents">,
        date: dateIso,
        time: time.trim(),
        change: change.trim(),
        risk_before: riskBefore,
        control: control.trim(),
        risk_after: riskAfter,
        approved_by: approvedBy.trim(),
        trigger: trigger.trim() || undefined,
        site: site.trim() || undefined,
        photos: photoIds,
        notes: notes.trim() || undefined,
      });
      showSuccess("Change recorded and signed", "The office has been told. Everyone else affected signs it in their app.");
      router.replace(`/safety/swms/changes/${change_id}` as Href);
    } catch (caught) {
      showError(toUserMessage(caught, "Could not record the change. Please try again."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <WhsScreen scroll={!signing}>
      <WhsHeader title="On-site Change" subtitle={title ?? "Dynamic SWMS review"} />

      <View className="gap-4">
        <View className="flex-row gap-3">
          <View className="flex-1">
            <DateField
              label="Date"
              value={date}
              onChange={(text) => {
                setDate(text);
                clear("date");
              }}
              error={errors.date}
            />
          </View>
          <View className="flex-1">
            <FormField
              label="Time"
              value={time}
              placeholder="hh:mm"
              icon="time-outline"
              keyboardType="numbers-and-punctuation"
              onChangeText={(text) => {
                setTime(text);
                clear("time");
              }}
              error={errors.time}
            />
          </View>
        </View>

        <NotesCard
          label="Change / new hazard"
          placeholder="What changed on site, or what new hazard did you find?"
          value={change}
          onChangeText={(text) => {
            setChange(text.slice(0, TEXT_LIMIT));
            clear("change");
          }}
          error={errors.change}
        />
        <FormField
          label="Risk before"
          value={riskBefore ?? ""}
          placeholder="Select a rating (1A-4D)"
          icon="chevron-down"
          onPress={() => setPicking("riskBefore")}
          error={errors.riskBefore}
        />
        <NotesCard
          label="Additional control / revised method"
          placeholder="What are you doing differently to control it?"
          value={control}
          onChangeText={(text) => {
            setControl(text.slice(0, TEXT_LIMIT));
            clear("control");
          }}
          error={errors.control}
        />
        <FormField
          label="Risk after"
          value={riskAfter ?? ""}
          placeholder="Select a rating (1A-4D)"
          icon="chevron-down"
          onPress={() => setPicking("riskAfter")}
          error={errors.riskAfter}
        />
        <FormField
          label="Approved / briefed by"
          value={approvedBy}
          placeholder="Name of the supervisor or person in charge"
          icon="person-outline"
          onChangeText={(text) => {
            setApprovedBy(text.slice(0, 200));
            clear("approvedBy");
          }}
          error={errors.approvedBy}
        />

        <FormField
          label="What triggered it (optional)"
          value={trigger}
          placeholder="e.g., weather, traffic, access"
          icon="flash-outline"
          onChangeText={(text) => setTrigger(text.slice(0, 200))}
        />
        <FormField
          label="Site (optional)"
          value={site}
          placeholder="Where this happened"
          icon="location-outline"
          onChangeText={(text) => setSite(text.slice(0, 200))}
        />

        <View className="gap-[6px]">
          <Text className="text-[14px] font-medium text-[#374151]">Photos (optional)</Text>
          <View className="flex-row flex-wrap gap-3">
            {photos.map((photo, index) => (
              <Pressable
                key={photo.uri}
                accessibilityRole="button"
                accessibilityLabel="Remove photo"
                onPress={() => setPhotos((current) => current.filter((_, at) => at !== index))}
              >
                <Image source={{ uri: photo.uri }} className="h-[84px] w-[84px] rounded-[12px]" />
                <View className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5">
                  <Ionicons name="close" size={14} color="#ffffff" />
                </View>
              </Pressable>
            ))}
            <Pressable
              accessibilityRole="button"
              onPress={pickPhoto}
              className="h-[84px] w-[84px] items-center justify-center rounded-[12px] border-2 border-dashed border-[#d1d5db] bg-[#f9fafb]"
            >
              <Ionicons name="camera-outline" size={26} color="#2563eb" />
            </Pressable>
          </View>
        </View>

        <NotesCard
          label="Notes (Optional)"
          placeholder="Anything else the office should know"
          value={notes}
          onChangeText={(text) => setNotes(text.slice(0, TEXT_LIMIT))}
        />

        <View className="gap-2">
          <Text className="text-[14px] font-medium text-[#374151]">Your signature</Text>
          <Text className="text-[13px] leading-5 text-[#64748b]">
            I have been briefed on this change and will follow the revised controls.
          </Text>
          {savedSignature === undefined ? (
            <ActivityIndicator />
          ) : drawing ? (
            <SignaturePad
              onChange={(signature) => {
                setDrawn(signature);
                if (signature !== null) clear("signature");
              }}
              onDrawingChange={setSigning}
              error={errors.signature}
            />
          ) : (
            <>
              <SignatureView signature={savedSignature} />
              <Pressable accessibilityRole="button" onPress={() => setRedraw(true)} className="self-end px-1 py-1">
                <Text className="text-[14px] font-semibold text-[#2563eb]">Draw a new signature</Text>
              </Pressable>
            </>
          )}
        </View>

        {submitting ? (
          <View className="items-center py-[14px]">
            <ActivityIndicator />
          </View>
        ) : (
          <PrimaryButton label="Record & Sign" onPress={() => void handleSubmit()} />
        )}
      </View>

      <Modal visible={picking !== null} transparent animationType="slide" onRequestClose={() => setPicking(null)}>
        <Pressable className="flex-1 justify-end bg-black/40" onPress={() => setPicking(null)}>
          <Pressable className="rounded-t-[20px] bg-white p-4 pb-10" onPress={() => undefined}>
            <Text className="text-[16px] font-bold text-[#0f172a]">
              {picking === "riskAfter" ? "Risk after the new control" : "Risk before the new control"}
            </Text>
            <Text className="mb-3 mt-1 text-[13px] leading-5 text-[#64748b]">
              Pick the likelihood row and the consequence column.
            </Text>

            <View className="flex-row">
              <View className="w-[110px]" />
              {CONSEQUENCE.map((column) => (
                <Text key={column.col} className="flex-1 text-center text-[13px] font-bold text-[#374151]">
                  {column.col}
                </Text>
              ))}
            </View>
            {LIKELIHOOD.map((row) => (
              <View key={row.row} className="mt-2 flex-row items-center">
                <Text className="w-[110px] text-[13px] text-[#374151]">
                  {row.row} {row.label}
                </Text>
                {CONSEQUENCE.map((column) => {
                  const code = `${row.row}${column.col}`;
                  const chosen = (picking === "riskAfter" ? riskAfter : riskBefore) === code;
                  return (
                    <View key={code} className="flex-1 px-1">
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => {
                          if (picking === "riskAfter") {
                            setRiskAfter(code);
                            clear("riskAfter");
                          } else {
                            setRiskBefore(code);
                            clear("riskBefore");
                          }
                          setPicking(null);
                        }}
                        className="h-11 items-center justify-center rounded-lg border"
                        style={{
                          borderColor: chosen ? "#2563eb" : "#e5e7eb",
                          backgroundColor: chosen ? "#eff6ff" : "#ffffff",
                        }}
                      >
                        <Text className="text-[14px] font-semibold text-[#111827]">{code}</Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            ))}

            <View className="mt-4 gap-1">
              {CONSEQUENCE.map((column) => (
                <Text key={column.col} className="text-[12px] text-[#64748b]">
                  {column.col}: {column.label}
                </Text>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </WhsScreen>
  );
}
