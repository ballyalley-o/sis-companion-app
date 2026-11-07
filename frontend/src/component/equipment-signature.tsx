import { useRef, useState } from "react"
import { Platform, View, type GestureResponderEvent, type ViewStyle } from "react-native"
import { Body, Button, Label } from "./ui"

type Point = [number, number]
export type Signature = Point[][]

export function hasInk(signature: Signature) {
  return signature.some((stroke) => stroke.some(([x, y]) => x !== stroke[0][0] || y !== stroke[0][1]))
}

export function EquipmentSignature({ value, onChange }: {
  value: Signature
  onChange?: (value: Signature) => void
}) {
  const [width, setWidth] = useState(0)
  const height = 150
  const gesture = useRef<{ x: number; y: number; strokes: Signature } | null>(null)

  function point(x: number, y: number): Point {
    const normalize = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 1000)
    return [normalize(x / width), normalize(y / height)]
  }

  function start({ nativeEvent: e }: GestureResponderEvent) {
    if (!onChange || !width || value.length >= 32) return
    const strokes = [...value, [point(e.locationX, e.locationY)]]
    gesture.current = { x: e.pageX - e.locationX, y: e.pageY - e.locationY, strokes }
    onChange(strokes)
  }

  function move({ nativeEvent: e }: GestureResponderEvent) {
    const active = gesture.current
    if (!active || !onChange) return
    const stroke = active.strokes[active.strokes.length - 1]
    const next = point(e.pageX - active.x, e.pageY - active.y)
    const last = stroke[stroke.length - 1]
    if (stroke.length >= 256 || Math.hypot(next[0] - last[0], next[1] - last[1]) < 5) return
    active.strokes = [...active.strokes.slice(0, -1), [...stroke, next]]
    onChange(active.strokes)
  }

  return (
    <View style={{ gap: 8 }}>
      <Label>Collector signature{onChange ? " (required)" : ""}</Label>
      {onChange && <Body>By signing, I confirm I collected this equipment.</Body>}
      <View
        testID="equipment-signature-pad"
        accessibilityLabel={onChange ? "Draw the collector signature here" : "Recorded collector signature"}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => Boolean(onChange)}
        onResponderGrant={start}
        onResponderMove={move}
        onResponderRelease={() => { gesture.current = null }}
        onResponderTerminate={() => { gesture.current = null }}
        onResponderTerminationRequest={() => false}
        style={{
          height, maxWidth: 480, width: "100%", backgroundColor: "#fff",
          borderRadius: 8, borderWidth: 1, borderColor: "#64748b", overflow: "hidden",
          ...(onChange && Platform.OS === "web" ? { touchAction: "none", userSelect: "none" } as ViewStyle : {}),
        }}
      >
        <View pointerEvents="none" style={{ position: "absolute", inset: 0 }}>
          {value.map((stroke, i) => stroke.slice(1).map(([x, y], j) => {
            const [px, py] = stroke[j]
            const dx = (x - px) * width / 1000
            const dy = (y - py) * height / 1000
            const length = Math.hypot(dx, dy)
            return <View key={i + "-" + j} style={{
              position: "absolute", backgroundColor: "#0f172a", borderRadius: 2,
              width: length + 2, height: 2,
              left: (x + px) * width / 2000 - length / 2 - 1,
              top: (y + py) * height / 2000 - 1,
              transform: [{ rotate: Math.atan2(dy, dx) + "rad" }],
            }} />
          }))}
        </View>
      </View>
      {onChange && value.length > 0 && <Button title="Clear signature" variant="ghost" onPress={() => onChange([])} />}
    </View>
  )
}
