import * as MediaLibrary from "expo-media-library";
import { useEffect, useState } from "react";
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import CameraIcon from "../icons/CameraIcon";

const THUMB = 72;

type Props = {
  onTakePhoto: () => void;
  onSelectFromLibrary: () => void;
  onSelectRecent: (uri: string) => void;
};

export default function PhotoPickerPanel({
  onTakePhoto,
  onSelectFromLibrary,
  onSelectRecent,
}: Props) {
  const { t } = useTranslation();
  const [permission, requestPermission] = MediaLibrary.usePermissions();
  const [recentUris, setRecentUris] = useState<string[]>([]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    if (permission === null) return;
    if (!permission.granted && permission.canAskAgain) {
      void requestPermission();
    }
  }, [permission, requestPermission]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    let cancelled = false;

    async function loadRecents() {
      if (permission === null || !permission.granted) {
        return;
      }
      try {
        const { assets } = await MediaLibrary.getAssetsAsync({
          first: 20,
          mediaType: MediaLibrary.MediaType.photo,
          sortBy: [["creationTime", false]],
        });
        const uris = assets.map((a) => a.uri);
        if (!cancelled) setRecentUris(uris);
      } catch {
        if (!cancelled) setRecentUris([]);
      }
    }

    void loadRecents();
    return () => {
      cancelled = true;
    };
  }, [permission]);

  return (
    <View className="border-t border-neutral-100 bg-white px-4 pt-3 pb-2">
      <View className="mb-2 flex-row items-center justify-between gap-3">
        <Text className="text-base font-semibold text-neutral-900">
          {t("chat.picker.photosLabel")}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("chat.picker.allPhotos")}
          onPress={onSelectFromLibrary}
          hitSlop={8}
        >
          <Text className="text-base font-medium text-blue-600">
            {t("chat.picker.allPhotos")}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
      >
        <Pressable
          onPress={onTakePhoto}
          accessibilityRole="button"
          accessibilityLabel={t("chat.picker.cameraA11y")}
          className="items-center justify-center rounded-2xl bg-neutral-100 active:bg-neutral-200"
          style={{ width: THUMB, height: THUMB }}
        >
          <CameraIcon size={28} color="#404040" />
        </Pressable>

        {recentUris.map((uri) => (
          <Pressable
            key={uri}
            onPress={() => onSelectRecent(uri)}
            accessibilityRole="button"
            accessibilityLabel={t("chat.picker.recentPhotoA11y")}
          >
            <Image
              source={{ uri }}
              style={{ width: THUMB, height: THUMB, borderRadius: 14 }}
            />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
