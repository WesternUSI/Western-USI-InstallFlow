import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Image, Modal, Pressable, Text, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface ImageLightboxProps {
  visible: boolean;
  /** One or more image URLs. Left/right arrows show when there is more than one. */
  images: string[];
  /** Which image to open on. Clamped to the available range. */
  initialIndex?: number;
  onClose: () => void;
}

const MAX_ZOOM = 4;

/**
 * Fullscreen photo viewer: pinch to zoom, drag to pan, double-tap to toggle
 * zoom, swipe down or the X button to dismiss. Rendered in a `Modal` so it
 * covers the whole screen; gestures need their own `GestureHandlerRootView`
 * inside the modal's separate view tree.
 */
export function ImageLightbox({ visible, images, initialIndex = 0, onClose }: ImageLightboxProps) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const clamp = (value: number) => Math.min(Math.max(value, 0), Math.max(images.length - 1, 0));
  const [index, setIndex] = React.useState(() => clamp(initialIndex));

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const resetTransform = React.useCallback(() => {
    scale.value = withTiming(1);
    savedScale.value = 1;
    translateX.value = withTiming(0);
    translateY.value = withTiming(0);
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  }, [savedScale, savedTranslateX, savedTranslateY, scale, translateX, translateY]);

  // Re-clamp and reset zoom whenever the viewer is (re)opened.
  React.useEffect(() => {
    if (visible) {
      setIndex(clamp(initialIndex));
      resetTransform();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initialIndex]);

  const goTo = (next: number) => {
    if (next < 0 || next >= images.length) return;
    setIndex(next);
    resetTransform();
  };

  const pinch = Gesture.Pinch()
    .onUpdate((event) => {
      scale.value = Math.min(Math.max(savedScale.value * event.scale, 1), MAX_ZOOM);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value <= 1) runOnJS(resetTransform)();
    });

  const pan = Gesture.Pan()
    .minDistance(10)
    .onUpdate((event) => {
      translateX.value = savedTranslateX.value + event.translationX;
      translateY.value = savedTranslateY.value + event.translationY;
    })
    .onEnd((event) => {
      if (scale.value <= 1) {
        if (event.translationY > 120) runOnJS(onClose)();
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        savedTranslateX.value = translateX.value;
        savedTranslateY.value = translateY.value;
      }
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (savedScale.value > 1) {
        runOnJS(resetTransform)();
      } else {
        scale.value = withTiming(2.5);
        savedScale.value = 2.5;
      }
    });

  const composed = Gesture.Simultaneous(pinch, pan, doubleTap);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  if (images.length === 0) return null;

  const safeIndex = clamp(index);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.95)" }}>
          <GestureDetector gesture={composed}>
            <Animated.View
              style={[{ flex: 1, alignItems: "center", justifyContent: "center" }, animatedStyle]}
            >
              <Image
                source={{ uri: images[safeIndex] }}
                style={{ width, height }}
                resizeMode="contain"
              />
            </Animated.View>
          </GestureDetector>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
            hitSlop={12}
            style={{
              position: "absolute",
              right: 16,
              top: insets.top + 8,
              height: 40,
              width: 40,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 20,
              backgroundColor: "rgba(0,0,0,0.5)",
            }}
          >
            <Ionicons name="close" size={24} color="#ffffff" />
          </Pressable>

          {images.length > 1 && (
            <>
              <View
                style={{
                  position: "absolute",
                  top: insets.top + 14,
                  left: 0,
                  right: 0,
                  alignItems: "center",
                }}
              >
                <View
                  style={{
                    backgroundColor: "rgba(0,0,0,0.5)",
                    borderRadius: 6,
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                  }}
                >
                  <Text style={{ color: "#ffffff", fontSize: 12, fontWeight: "600" }}>
                    {safeIndex + 1} / {images.length}
                  </Text>
                </View>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Previous image"
                onPress={() => goTo(safeIndex - 1)}
                disabled={safeIndex === 0}
                style={{
                  position: "absolute",
                  left: 12,
                  top: "50%",
                  marginTop: -20,
                  height: 40,
                  width: 40,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 20,
                  backgroundColor: "rgba(0,0,0,0.45)",
                  opacity: safeIndex === 0 ? 0.3 : 1,
                }}
              >
                <Ionicons name="chevron-back" size={22} color="#ffffff" />
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Next image"
                onPress={() => goTo(safeIndex + 1)}
                disabled={safeIndex === images.length - 1}
                style={{
                  position: "absolute",
                  right: 12,
                  top: "50%",
                  marginTop: -20,
                  height: 40,
                  width: 40,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 20,
                  backgroundColor: "rgba(0,0,0,0.45)",
                  opacity: safeIndex === images.length - 1 ? 0.3 : 1,
                }}
              >
                <Ionicons name="chevron-forward" size={22} color="#ffffff" />
              </Pressable>
            </>
          )}
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
