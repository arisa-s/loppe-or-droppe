import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

type Props = {
  uris: string[];
  onRemove: (uri: string) => void;
};

const THUMB = 64;

export default function PhotoAttachmentPreview({ uris, onRemove }: Props) {
  const { t } = useTranslation();

  if (uris.length === 0) {
    return null;
  }

  return (
    <View className="border-t border-neutral-100 px-3 py-2">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        {uris.map((uri) => (
          <View key={uri} style={{ position: "relative" }}>
            <Image
              source={{ uri }}
              style={{ width: THUMB, height: THUMB, borderRadius: 8 }}
              accessibilityLabel={t("chat.bubble.photoAlt")}
            />
            <Pressable
              onPress={() => onRemove(uri)}
              accessibilityLabel={t("chat.composer.removePhotoA11y")}
              style={{
                position: "absolute",
                top: -6,
                right: -6,
                width: 20,
                height: 20,
                borderRadius: 10,
                backgroundColor: "#171717",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: "#ffffff", fontSize: 12, lineHeight: 14 }}>
                {t("common.removeSymbol")}
              </Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
