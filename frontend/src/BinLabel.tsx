import { useState } from "react";
import { Text, View } from "react-native";
import { Image } from "expo-image";
import { LABEL, LABEL_RATIO, labelAccent, splitCode } from "@/src/label";

/** Wide sticker preview matching the print layout. Fixed high-contrast print colours. */
export function BinLabel({ code, title, qr, testID }: { code: string; title: string; qr?: string; testID?: string }) {
  const [head, rest] = splitCode(code);
  const [width, setWidth] = useState(360);
  const titleSize = Math.min(width * 0.16, width * 0.64 / (Math.max(title.length, 1) * 0.62));
  const codeSize = Math.min(width * 0.067, width * 0.64 / (Math.max(code.length, 1) * 0.62));
  return (
    <View testID={testID} onLayout={event => setWidth(event.nativeEvent.layout.width)} style={{ aspectRatio: LABEL_RATIO, width: "100%", backgroundColor: LABEL.bg, flexDirection: "row", alignItems: "center", paddingLeft: "5.5%", paddingRight: "3%", gap: width * 0.03 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: titleSize, lineHeight: titleSize, fontWeight: "800", color: LABEL.ink }} numberOfLines={1} adjustsFontSizeToFit>{title}</Text>
        <Text style={{ fontSize: codeSize, lineHeight: codeSize * 1.1, fontWeight: "800", color: LABEL.ink }} numberOfLines={1} adjustsFontSizeToFit>
          <Text style={{ color: labelAccent(code) }}>{head}</Text>{rest}
        </Text>
      </View>
      <View style={{ width: width * 0.24, height: width * 0.24, flexShrink: 0, backgroundColor: LABEL.qrBg, alignItems: "center", justifyContent: "center" }}>
        {qr ? <Image accessibilityLabel={`QR code for ${code}`} source={{ uri: qr }} style={{ width: "100%", height: "100%" }} contentFit="contain" /> : <Text style={{ fontSize: 10, color: LABEL.ink }}>Loading QR…</Text>}
      </View>
    </View>
  );
}
