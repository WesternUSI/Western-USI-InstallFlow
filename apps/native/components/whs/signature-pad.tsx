import { useRef, useState } from "react";
import { type LayoutChangeEvent, PanResponder, Pressable, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";

/** A signature as the backend stores it: SVG path data in the pad's own coordinates. */
export interface SignatureData {
  paths: string[];
  width: number;
  height: number;
}

const PAD_HEIGHT = 180;
const STROKE = { stroke: "#111827", strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round", fill: "none" } as const;

function point(x: number, y: number) {
  return `${Math.round(x * 10) / 10} ${Math.round(y * 10) / 10}`;
}

/**
 * Draw-with-your-finger signature box (decision D1). Built on PanResponder and
 * react-native-svg, both already in the app, so no new native module. Inside a
 * scrolling screen, use `onDrawingChange` to stop the scroll while signing.
 */
export function SignaturePad({
  onChange,
  onDrawingChange,
  error,
}: {
  onChange: (signature: SignatureData | null) => void;
  /** True while a finger is on the pad, so a screen that scrolls can stop scrolling meanwhile. */
  onDrawingChange?: (drawing: boolean) => void;
  error?: string;
}) {
  const [paths, setPaths] = useState<string[]>([]);
  const [width, setWidth] = useState(0);
  const current = useRef("");
  const pathsRef = useRef<string[]>([]);
  const widthRef = useRef(0);
  // The responder is created once, so it reads the latest callback through a ref.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onDrawingRef = useRef(onDrawingChange);
  onDrawingRef.current = onDrawingChange;

  const publish = (next: string[]) => {
    pathsRef.current = next;
    setPaths(next);
    onChangeRef.current(next.length === 0 ? null : { paths: next, width: widthRef.current, height: PAD_HEIGHT });
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (event) => {
        onDrawingRef.current?.(true);
        const { locationX, locationY } = event.nativeEvent;
        current.current = `M ${point(locationX, locationY)}`;
        // A tap leaves a dot.
        setPaths([...pathsRef.current, `${current.current} L ${point(locationX + 0.1, locationY)}`]);
      },
      onPanResponderMove: (event) => {
        const { locationX, locationY } = event.nativeEvent;
        current.current += ` L ${point(locationX, locationY)}`;
        setPaths([...pathsRef.current, current.current]);
      },
      onPanResponderTerminate: () => onDrawingRef.current?.(false),
      onPanResponderRelease: () => {
        onDrawingRef.current?.(false);
        const stroke = current.current.includes(" L ") ? current.current : `${current.current} L ${current.current.slice(2)}`;
        current.current = "";
        publish([...pathsRef.current, stroke]);
      },
    }),
  ).current;

  const onLayout = (event: LayoutChangeEvent) => {
    widthRef.current = event.nativeEvent.layout.width;
    setWidth(event.nativeEvent.layout.width);
  };

  return (
    <View className="gap-[6px]">
      <View
        onLayout={onLayout}
        className="overflow-hidden rounded-[12px] border bg-white"
        style={{ height: PAD_HEIGHT, borderColor: error ? "#ef4444" : "#e5e7eb" }}
        {...responder.panHandlers}
      >
        {width > 0 ? (
          <Svg width={width} height={PAD_HEIGHT} pointerEvents="none">
            {paths.map((d, index) => (
              <Path key={index} d={d} {...STROKE} />
            ))}
          </Svg>
        ) : null}
        {paths.length === 0 ? (
          <View className="absolute inset-0 items-center justify-center" pointerEvents="none">
            <Text className="text-[14px] text-[#9ca3af]">Sign here with your finger</Text>
          </View>
        ) : null}
      </View>
      {error ? <Text className="text-[12px] font-medium text-[#dc2626]">{error}</Text> : null}
      <Pressable accessibilityRole="button" onPress={() => publish([])} className="self-end px-1 py-1">
        <Text className="text-[14px] font-semibold text-[#2563eb]">Clear</Text>
      </Pressable>
    </View>
  );
}

/** Shows a saved signature, scaled to fit. */
export function SignatureView({ signature }: { signature: SignatureData }) {
  return (
    <View className="overflow-hidden rounded-[12px] border border-[#e5e7eb] bg-white" style={{ aspectRatio: signature.width / signature.height }}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${signature.width} ${signature.height}`}>
        {signature.paths.map((d, index) => (
          <Path key={index} d={d} {...STROKE} />
        ))}
      </Svg>
    </View>
  );
}
