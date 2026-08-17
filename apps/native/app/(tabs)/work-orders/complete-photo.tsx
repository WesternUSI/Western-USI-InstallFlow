import { api } from "@usi-installer/backend/convex/_generated/api";
import type { Id } from "@usi-installer/backend/convex/_generated/dataModel";
import { Ionicons } from "@expo/vector-icons";
import { useMutation } from "convex/react";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
// The new default `expo-file-system` API (File/Directory classes) has no
// uploadAsync — that lives under the legacy subpath, which is also the
// documented, reliable way to upload a local file in React Native: it reads
// the file natively instead of going through RN's fetch/Blob path, which has
// a long-standing Android bug that corrupts the Content-Type header.
import { FileSystemUploadType, uploadAsync } from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import React from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function CompletePhotoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { ids: idsParam } = useLocalSearchParams<{ ids: string }>();
  const ids = (idsParam ?? "").split(",").filter(Boolean) as Id<"workorders">[];

  const generateUploadUrl = useMutation(api.workorders.generateUploadUrl);
  const completeWorkOrder = useMutation(api.workorders.completeWorkOrder);

  const [photoUri, setPhotoUri] = React.useState<string | null>(null);
  const [notes, setNotes] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const handleTakePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Camera permission needed",
        "Enable camera access for this app in your device Settings to take a completion photo.",
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!result.canceled && result.assets.length > 0) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const handleRetake = () => setPhotoUri(null);

  const handleSubmit = async () => {
    if (!photoUri) return;
    setSubmitting(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const uploadResult = await uploadAsync(uploadUrl, photoUri, {
        httpMethod: "POST",
        uploadType: FileSystemUploadType.BINARY_CONTENT,
        headers: { "Content-Type": "image/jpeg" },
      });
      if (uploadResult.status < 200 || uploadResult.status >= 300) {
        throw new Error(`Photo upload failed (${uploadResult.status}) ${uploadResult.body}`.trim());
      }
      const { storageId } = JSON.parse(uploadResult.body) as { storageId?: Id<"_storage"> };
      if (!storageId) {
        throw new Error("Photo upload didn't return a storage id");
      }

      await completeWorkOrder({ ids, photo: storageId, notes: notes.trim() || undefined });
      router.replace("/work-orders/install-completed" as Href);
    } catch (error) {
      Alert.alert("Couldn't submit", error instanceof Error ? error.message : "Try again.");
    } finally {
      setSubmitting(false);
    }
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
        <Text className="text-[22px] font-extrabold text-[#1a1c1e]">Complete Install</Text>
        <Text className="mt-0.5 text-[13px] font-medium text-[#6c7278]">
          {photoUri ? "Review the photo before submitting" : "Take a photo of the completed install"}
        </Text>
      </View>
    </View>
  );

  return (
    <View className="flex-1 bg-[#f7f9fb]" style={{ paddingTop: insets.top }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
      >
        {header}

        <View className="mt-5 px-4">
          {photoUri === null ? (
            <Pressable
              accessibilityRole="button"
              onPress={handleTakePhoto}
              className="items-center justify-center rounded-2xl border-2 border-dashed border-[#cbd5e1] bg-white"
              style={{ height: 280 }}
            >
              <Ionicons name="camera" size={40} color="#94a3b8" />
              <Text className="mt-3 text-[15px] font-bold text-[#1a1c1e]">Take Photo</Text>
              <Text className="mt-1 text-[13px] font-medium text-[#94a3b8]">
                Opens your device camera
              </Text>
            </Pressable>
          ) : (
            <>
              <View className="overflow-hidden rounded-2xl bg-[#e2e8f0]" style={{ height: 280 }}>
                <Image
                  source={{ uri: photoUri }}
                  style={{ width: "100%", height: "100%" }}
                  resizeMode="cover"
                />
              </View>

              <Text className="mb-1 mt-4 text-[12px] font-semibold text-[#6c7278]">
                Notes (optional)
              </Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Add a note about this install"
                placeholderTextColor="#94a3b8"
                multiline
                className="min-h-[80px] rounded-xl border border-[#e2e8f0] bg-white px-3.5 py-3 text-[14px] text-[#1a1c1e]"
                style={{ textAlignVertical: "top" }}
              />

              <View className="mt-4 flex-row" style={{ gap: 10 }}>
                <Pressable
                  accessibilityRole="button"
                  disabled={submitting}
                  onPress={handleRetake}
                  className="h-[48px] flex-1 items-center justify-center rounded-2xl border border-[#e2e8f0] bg-white"
                >
                  <Text className="text-[14px] font-bold text-[#1a1c1e]">Retake Photo</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={submitting}
                  onPress={handleSubmit}
                  className="h-[48px] flex-1 items-center justify-center rounded-2xl bg-[#16a34a]"
                >
                  {submitting ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text className="text-[14px] font-bold text-white">Submit Photo</Text>
                  )}
                </Pressable>
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
