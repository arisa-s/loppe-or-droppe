import { Pressable, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import CameraIcon from "../icons/CameraIcon";
import PhotoAttachmentPreview from "./PhotoAttachmentPreview";

type Props = {
  draft: string;
  onChangeDraft: (text: string) => void;
  onSend: () => void;
  onTogglePicker: () => void;
  pickerOpen: boolean;
  canSend: boolean;
  photoUris?: string[];
  onRemovePhoto?: (uri: string) => void;
};

export default function ChatComposer({
  draft,
  onChangeDraft,
  onSend,
  onTogglePicker,
  pickerOpen,
  canSend,
  photoUris = [],
  onRemovePhoto,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <View
      className="bg-white px-4 pt-2"
      style={{ paddingBottom: Math.max(insets.bottom, 12) }}
    >
      <View className="overflow-hidden rounded-3xl border border-neutral-200 bg-neutral-50">
        {photoUris.length > 0 && (
          <PhotoAttachmentPreview uris={photoUris} onRemove={onRemovePhoto ?? (() => {})} />
        )}
        <TextInput
          value={draft}
          onChangeText={onChangeDraft}
          placeholder={t("chat.composer.inputPlaceholder")}
          placeholderTextColor="#a3a3a3"
          multiline
          scrollEnabled
          textAlignVertical="top"
          returnKeyType={canSend ? "send" : "default"}
          enablesReturnKeyAutomatically={canSend}
          blurOnSubmit={false}
          onSubmitEditing={() => {
            if (canSend) onSend();
          }}
          className="px-4 pt-3 text-base leading-6 text-neutral-900"
          style={{ minHeight: photoUris.length > 0 ? 52 : 80, maxHeight: 160, paddingBottom: 8 }}
        />
        <View className="flex-row items-center justify-between px-3 pb-3">
          <Pressable
            onPress={onTogglePicker}
            accessibilityRole="button"
            accessibilityLabel={t("chat.composer.attachA11y")}
            className={`h-9 w-9 items-center justify-center rounded-full border active:bg-neutral-100 ${
              pickerOpen
                ? "border-neutral-900 bg-neutral-900"
                : "border-neutral-200 bg-white"
            }`}
          >
            <View accessibilityElementsHidden>
              <CameraIcon size={20} color={pickerOpen ? "#ffffff" : "#404040"} />
            </View>
          </Pressable>

          <Pressable
            onPress={onSend}
            disabled={!canSend}
            accessibilityRole="button"
            accessibilityLabel={t("chat.composer.sendA11y")}
            className={`h-9 w-9 items-center justify-center rounded-full ${
              canSend ? "bg-neutral-900 active:bg-neutral-800" : "bg-neutral-200"
            }`}
          >
            <Text
              className={`text-base font-bold ${canSend ? "text-white" : "text-neutral-400"}`}
              accessibilityElementsHidden
            >
              ↑
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
