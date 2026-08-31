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

import { ImageLightbox } from "@/components/image-lightbox";

// Matches `completeWorkOrder`'s server-side cap.
const MAX_PHOTOS = 5;

export default function CompletePhotoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { ids: idsParam } = useLocalSearchParams<{ ids: string }>();
  const ids = (idsParam ?? "").split(",").filter(Boolean) as Id<"workorders">[];

  const generateUploadUrl = useMutation(api.workorders.generateUploadUrl);
  const completeWorkOrder = useMutation(api.workorders.completeWorkOrder);

  const [photoUris, setPhotoUris] = React.useState<string[]>([]);
  const [notes, setNotes] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [zoomIndex, setZoomIndex] = React.useState<number | null>(null);

  const handleTakePhoto = async () => {
    if (photoUris.length >= MAX_PHOTOS) return;

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
      setPhotoUris((current) => [...current, result.assets[0].uri]);
    }
  };

  const handleRemove = (index: number) =>
    setPhotoUris((current) => current.filter((_, i) => i !== index));

  const handleSubmit = async () => {
    if (photoUris.length === 0) return;
    setSubmitting(true);
    try {
      const storageIds: Id<"_storage">[] = [];
      for (const uri of photoUris) {
        const uploadUrl = await generateUploadUrl();
        const uploadResult = await uploadAsync(uploadUrl, uri, {
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
        storageIds.push(storageId);
      }

      await completeWorkOrder({ ids, photos: storageIds, notes: notes.trim() || undefined });
      router.replace("/work-orders/install-completed" as Href);
    } catch (error) {
      Alert.alert("Couldn't submit", error instanceof Error ? error.message : "Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const hasPhotos = photoUris.length > 0;

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
          {hasPhotos
            ? "Review the photos before submitting"
            : "Take photos of the completed install"}
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
          {!hasPhotos ? (
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
              <View style={{ gap: 12 }}>
                {photoUris.map((uri, index) => (
                  <View key={`${uri}-${index}`} className="overflow-hidden rounded-2xl bg-[#e2e8f0]">
                    <Pressable
                      accessibilityRole="imagebutton"
                      accessibilityLabel={`Enlarge photo ${index + 1}`}
                      onPress={() => setZoomIndex(index)}
                      style={{ height: 280 }}
                    >
                      <Image
                        source={{ uri }}
                        style={{ width: "100%", height: "100%" }}
                        resizeMode="cover"
                      />
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove photo ${index + 1}`}
                      disabled={submitting}
                      onPress={() => handleRemove(index)}
                      hitSlop={8}
                      className="absolute right-2 top-2 h-8 w-8 items-center justify-center rounded-full bg-black/60"
                    >
                      <Ionicons name="close" size={18} color="#ffffff" />
                    </Pressable>
                  </View>
                ))}
              </View>

              {photoUris.length < MAX_PHOTOS && (
                <Pressable
                  accessibilityRole="button"
                  disabled={submitting}
                  onPress={handleTakePhoto}
                  className="mt-3 h-[48px] flex-row items-center justify-center rounded-2xl border border-[#e2e8f0] bg-white"
                  style={{ gap: 6 }}
                >
                  <Ionicons name="camera" size={16} color="#1a1c1e" />
                  <Text className="text-[14px] font-bold text-[#1a1c1e]">Add Another Photo</Text>
                </Pressable>
              )}

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

              <Pressable
                accessibilityRole="button"
                disabled={submitting}
                onPress={handleSubmit}
                className="mt-4 h-[48px] items-center justify-center rounded-2xl bg-[#16a34a]"
              >
                {submitting ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text className="text-[14px] font-bold text-white">
                    {photoUris.length > 1 ? `Submit ${photoUris.length} Photos` : "Submit Photo"}
                  </Text>
                )}
              </Pressable>
            </>
          )}
        </View>
      </ScrollView>

      <ImageLightbox
        visible={zoomIndex !== null}
        images={photoUris}
        initialIndex={zoomIndex ?? 0}
        onClose={() => setZoomIndex(null)}
      />
    </View>
  );
}
