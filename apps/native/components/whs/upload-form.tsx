import { Ionicons } from "@expo/vector-icons";
import { api } from "@usi-installer/backend/convex/_generated/api";
import type { Id } from "@usi-installer/backend/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { FileSystemUploadType, uploadAsync } from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, Image, Modal, Pressable, Text, View } from "react-native";

import { DateField } from "@/components/whs/date-field";
import { FormField, NotesCard, PrimaryButton, WhsHeader, WhsScreen } from "@/components/whs/whs-ui";
import { useAccreditations } from "@/hooks/use-accreditations";
import { compressPhoto } from "@/lib/compress-photo";
import { toUserMessage } from "@/lib/errors";
import { useAppToast } from "@/lib/toast";
import { parseDisplayDate } from "@/lib/whs-format";

export interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
}

interface FieldErrors {
  type?: string;
  file?: string;
  issued?: string;
  expiry?: string;
}

const NOTES_LIMIT = 1000;

/** Sends one local file to Convex storage and returns its id. */
export async function uploadToStorage(uploadUrl: string, file: PickedFile): Promise<Id<"_storage">> {
  const result = await uploadAsync(uploadUrl, file.uri, {
    httpMethod: "POST",
    uploadType: FileSystemUploadType.BINARY_CONTENT,
    headers: { "Content-Type": file.mimeType },
  });
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`File upload failed (${result.status}) ${result.body}`.trim());
  }
  const { storageId } = JSON.parse(result.body) as { storageId?: Id<"_storage"> };
  if (!storageId) {
    throw new Error("File upload didn't return a storage id");
  }
  return storageId;
}

/**
 * Shared by "Upload Accreditation" (from My Accreditations, with the type
 * already chosen) and "Upload Document" (from the Safety page, where the
 * worker picks the type). The accreditation flow starts under its own title
 * and switches to "Upload Document" once a file is attached; the document flow
 * always uses "Upload Document".
 */
export function UploadForm({ source }: { source: "accreditation" | "document" }) {
  const router = useRouter();
  const { type: typeParam } = useLocalSearchParams<{ type?: string }>();
  const { items } = useAccreditations();
  const generateUploadUrl = useMutation(api.accreditations.generateUploadUrl);
  const submit = useMutation(api.accreditations.submit);
  const { showError } = useAppToast();

  const [typeId, setTypeId] = useState<string | undefined>(typeParam);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [file, setFile] = useState<PickedFile | null>(null);
  const [number, setNumber] = useState("");
  const [issued, setIssued] = useState("");
  const [expiry, setExpiry] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const selected = items?.find((item) => item.type_id === typeId);
  const typeLocked = typeParam !== undefined;
  const title = source === "accreditation" && file === null ? "Upload Accreditation" : "Upload Document";
  const isImage = file?.mimeType.startsWith("image/") ?? false;

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Camera permission needed",
        "Enable camera access for this app in your device Settings to take a photo of your document.",
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!result.canceled && result.assets.length > 0) {
      const uri = await compressPhoto(result.assets[0]);
      setFile({ uri, name: `photo-${Date.now()}.jpg`, mimeType: "image/jpeg" });
    }
  };

  const choosePhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (!result.canceled && result.assets.length > 0) {
      const uri = await compressPhoto(result.assets[0]);
      setFile({ uri, name: `photo-${Date.now()}.jpg`, mimeType: "image/jpeg" });
    }
  };

  const chooseFile = async () => {
    // Loaded on demand: the PDF picker is a native module, so an app build made
    // before it was added doesn't have it. That must not break the whole app.
    let DocumentPicker: typeof import("expo-document-picker");
    try {
      DocumentPicker = await import("expo-document-picker");
    } catch {
      showError("Choosing a PDF needs the latest version of the app. Please update it, or use a photo.");
      return;
    }

    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "image/*"],
      copyToCacheDirectory: true,
    });
    if (!result.canceled && result.assets.length > 0) {
      const asset = result.assets[0];
      setFile({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType ?? "application/pdf" });
    }
  };

  const pickFile = () => {
    setErrors((current) => ({ ...current, file: undefined }));
    Alert.alert("Add your document", undefined, [
      { text: "Take a photo", onPress: () => void takePhoto() },
      { text: "Choose a photo", onPress: () => void choosePhoto() },
      { text: "Choose a PDF or file", onPress: () => void chooseFile() },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const handleSubmit = async () => {
    const found: FieldErrors = {};
    if (selected === undefined) found.type = "Select which accreditation you're uploading.";
    if (file === null) found.file = "Add a photo or PDF of your document.";

    const issuedIso = issued.trim() === "" ? undefined : parseDisplayDate(issued);
    if (issued.trim() !== "" && issuedIso === null) found.issued = "Select a valid issued date.";
    const expiryIso = expiry.trim() === "" ? undefined : parseDisplayDate(expiry);
    if (expiry.trim() !== "" && expiryIso === null) {
      found.expiry = "Select a valid expiry date, or leave it blank if it doesn't expire.";
    }
    if (issuedIso && expiryIso && expiryIso < issuedIso) {
      found.expiry = "The expiry date can't be before the issued date.";
    }

    setErrors(found);
    const firstError = found.type ?? found.file ?? found.issued ?? found.expiry;
    if (firstError !== undefined || selected === undefined || file === null) {
      showError(firstError ?? "Check the details and try again.");
      return;
    }

    setSubmitting(true);
    try {
      const storageId = await uploadToStorage(await generateUploadUrl(), file);
      const { status } = await submit({
        type_id: selected.type_id,
        file_id: storageId,
        file_name: file.name,
        content_type: file.mimeType,
        number: number.trim() || undefined,
        issued: issuedIso ?? undefined,
        expires: expiryIso ?? undefined,
        notes: notes.trim() || undefined,
      });
      router.replace(`/safety/accreditations/done?status=${status}` as Href);
    } catch (error) {
      showError(toUserMessage(error, "Could not upload your document. Please try again."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <WhsScreen>
      <WhsHeader title={title} subtitle="Upload your document for verification" />

      <View className="gap-4">
        <FormField
          label="Document Type"
          value={selected?.name ?? ""}
          placeholder="Select the accreditation"
          icon={typeLocked ? "lock-closed-outline" : "chevron-down"}
          onPress={typeLocked ? undefined : () => setPickerOpen(true)}
          error={errors.type}
        />
        <FormField
          label="Card / licence no. (optional)"
          value={number}
          placeholder="e.g., WC-884213"
          icon="card-outline"
          onChangeText={setNumber}
        />
        <DateField
          label="Issued date"
          value={issued}
          optional
          onChange={(text) => {
            setIssued(text);
            setErrors((current) => ({ ...current, issued: undefined }));
          }}
          error={errors.issued}
        />
        <DateField
          label="Expiry date (if any)"
          value={expiry}
          placeholder="Select a date, or leave blank if it doesn't expire"
          optional
          onChange={(text) => {
            setExpiry(text);
            setErrors((current) => ({ ...current, expiry: undefined }));
          }}
          error={errors.expiry}
        />

        {file !== null ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Replace attached file"
            onPress={pickFile}
            className="rounded-[16px] border border-[#e2e8f0] bg-white p-4"
          >
            {isImage ? (
              <Image source={{ uri: file.uri }} className="h-[248px] w-full rounded-[12px]" resizeMode="cover" />
            ) : (
              <View className="flex-row items-center">
                <Ionicons name="document-text-outline" size={28} color="#dc2626" />
                <Text className="ml-3 flex-1 text-[14px] font-medium text-[#111827]" numberOfLines={1}>
                  {file.name}
                </Text>
              </View>
            )}
            <Text className="mt-3 text-center text-[12px] text-[#64748b]">Tap to replace</Text>
          </Pressable>
        ) : (
          <View>
            <Pressable
              accessibilityRole="button"
              onPress={pickFile}
              className="h-[260px] items-center justify-center rounded-[16px] border-2 border-dashed bg-[#f9fafb] px-8"
              style={{ borderColor: errors.file ? "#ef4444" : "#d1d5db" }}
            >
              <Ionicons name="cloud-upload-outline" size={48} color="#2563eb" />
              <Text className="mt-4 text-center text-[14px] leading-5 text-[#6b7280]">
                Tap to take a photo or choose a file
              </Text>
              <Text className="mt-1 text-center text-[12px] leading-4 text-[#9ca3af]">Photo or PDF</Text>
            </Pressable>
            {errors.file ? <Text className="mt-1.5 text-[12px] font-medium text-[#dc2626]">{errors.file}</Text> : null}
          </View>
        )}

        <NotesCard
          label="Notes (Optional)"
          placeholder="Write down any related notes"
          value={notes}
          onChangeText={(text) => setNotes(text.slice(0, NOTES_LIMIT))}
        />

        {submitting ? (
          <View className="items-center py-[14px]">
            <ActivityIndicator />
          </View>
        ) : (
          <PrimaryButton label="Submit for Verification" onPress={() => void handleSubmit()} />
        )}
      </View>

      <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <Pressable className="flex-1 justify-end bg-black/40" onPress={() => setPickerOpen(false)}>
          <View className="max-h-[70%] rounded-t-[20px] bg-white p-4">
            <Text className="mb-3 text-[16px] font-bold text-[#0f172a]">Select the accreditation</Text>
            {(items ?? []).map((item) => (
              <Pressable
                key={item.type_id}
                accessibilityRole="button"
                onPress={() => {
                  setTypeId(item.type_id);
                  setErrors((current) => ({ ...current, type: undefined }));
                  setPickerOpen(false);
                }}
                className="border-b border-[#f1f5f9] py-3"
              >
                <Text className="text-[15px] text-[#111827]">{item.name}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </WhsScreen>
  );
}
