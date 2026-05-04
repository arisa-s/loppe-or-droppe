import { Pressable, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  draft: string;
  onChangeDraft: (text: string) => void;
  onSend: () => void;
  onPickPhotos: () => void;
  canSend: boolean;
};

export default function ChatComposer({
  draft,
  onChangeDraft,
  onSend,
  onPickPhotos,
  canSend,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <View
      className="border-t border-neutral-200 bg-white px-4 pt-2"
      style={{ paddingBottom: Math.max(insets.bottom, 8) }}
    >
      <View className="flex-row items-end gap-2">
        <Pressable
          onPress={onPickPhotos}
          accessibilityRole="button"
          accessibilityLabel={t("chat.composer.attachA11y")}
          className="mb-1 h-10 w-10 items-center justify-center rounded-full bg-neutral-100 active:bg-neutral-200"
        >
          <Text className="text-lg leading-none text-neutral-700" accessibilityElementsHidden>
            📷
          </Text>
        </Pressable>

        <TextInput
          value={draft}
          onChangeText={onChangeDraft}
          placeholder={t("chat.composer.inputPlaceholder")}
          placeholderTextColor="#a3a3a3"
          multiline={false}
          returnKeyType="send"
          enablesReturnKeyAutomatically={canSend}
          blurOnSubmit={false}
          onSubmitEditing={() => {
            if (canSend) {
              onSend();
            }
          }}
          className="max-h-[120px] flex-1 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-base leading-6 text-neutral-900"
          style={{ minHeight: 44 }}
        />

        <Pressable
          onPress={onSend}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel={t("chat.composer.sendA11y")}
          className={`mb-1 h-10 w-10 items-center justify-center rounded-full ${
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
  );
}
