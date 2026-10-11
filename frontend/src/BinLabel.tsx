import { Text, View } from "react-native";
import { Image } from "expo-image";
import { LABEL, splitCode } from "@/src/label";

/** On-screen preview of the 100x50mm bin sticker (2:1). Fixed print colors. */
export function BinLabel({ code, title, qr, testID }: { code: string; title: string; qr?: string; testID?: string }) {
  const [head, rest] = splitCode(code);
  return (
    <View testID={testID} style={{ aspectRatio: 2, width: "100%", backgroundColor: LABEL.bg, borderRadius: 8, flexDirection: "row", alignItems: "center", paddingLeft: "7%", paddingRight: "5%" }}>
      <View style={{ flex: 1, gap: 10 }}>
        <Text style={{ fontSize: 30, fontWeight: "800", color: LABEL.ink }} numberOfLines={1} adjustsFontSizeToFit>{title}</Text>
        <Text style={{ fontSize: 18, fontWeight: "800", color: LABEL.ink }} numberOfLines={1} adjustsFontSizeToFit>
          <Text style={{ color: LABEL.accent }}>{head}</Text>{rest}
        </Text>
      </View>
      <View style={{ height: "80%", aspectRatio: 1, backgroundColor: LABEL.qrBg, borderRadius: 6, padding: 4 }}>
        {qr ? <Image source={{ uri: qr }} style={{ flex: 1 }} contentFit="contain" /> : null}
      </View>
    </View>
  );
}
