import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

const THUMB = 52;

type Props = {
  uris: string[];
  onRemove: (uri: string) => void;
};

export default function PhotoAttachmentPreview({ uris, onRemove }: Props) {
  const { t } = useTranslation();

  if (uris.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{
        paddingHorizontal: 12,
        paddingVertical: 8,
        gap: 8,
      }}
      className="border-t border-neutral-100"
    >
      {uris.map((uri) => (
        <View key={uri} style={{ width: THUMB, height: THUMB }}>
          <Image
            source={{ uri }}
            style={{ width: THUMB, height: THUMB, borderRadius: 10 }}
            accessibilityLabel={t("chat.bubble.photoAlt")}
          />
          <Pressable
            onPress={() => onRemove(uri)}
            accessibilityLabel={t("chat.composer.removePhotoA11y")}
            style={{
              position: "absolute",
              top: 3,
              right: 3,
              width: 18,
              height: 18,
              borderRadius: 9,
              backgroundColor: "rgba(0,0,0,0.55)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                color: "#fff",
                fontSize: 12,
                lineHeight: 16,
                fontWeight: "600",
              }}
            >
              ×
            </Text>
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}
