import { useMemo, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Screen from "../components/ui/Screen";

const GENERAL_TIPS = [
  "photoGuide.general.tip1",
  "photoGuide.general.tip2",
  "photoGuide.general.tip3",
  "photoGuide.general.tip4",
] as const;

const OBJECT_TYPES = [
  "ceramics",
  "glassware",
  "jewelry",
  "prints",
  "furniture",
  "textiles",
  "lamps",
  "silver",
] as const;

const OBJECT_STEPS = [
  "step1",
  "step2",
  "step3",
] as const;

type ObjectType = (typeof OBJECT_TYPES)[number];

export default function PhotoGuideScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [selectedObject, setSelectedObject] = useState<ObjectType>("ceramics");
  const [pickerVisible, setPickerVisible] = useState(false);

  const selectedLabel = useMemo(
    () => t(`photoGuide.objects.${selectedObject}.label`),
    [selectedObject, t],
  );

  return (
    <Screen className="bg-neutral-50">
      <View className="gap-4 p-6">
        <View className="flex-row items-center justify-between gap-3">
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel={t("common.navBackHome")}
            className="rounded-xl px-1 py-2 active:bg-neutral-100"
          >
            <Text className="text-base font-medium text-neutral-700">
              {t("common.navBackHome")}
            </Text>
          </Pressable>
        </View>

        <Card className="bg-white">
          <Text className="text-2xl font-semibold text-neutral-900">
            {t("photoGuide.title")}
          </Text>
          <Text className="mt-3 text-base leading-6 text-neutral-600">
            {t("photoGuide.intro")}
          </Text>
        </Card>

        <Card className="bg-white">
          <Text className="text-lg font-semibold text-neutral-900">
            {t("photoGuide.general.title")}
          </Text>
          <View className="mt-3 gap-3">
            {GENERAL_TIPS.map((key, index) => (
              <View key={key} className="flex-row gap-3">
                <View className="mt-0.5 h-6 w-6 items-center justify-center rounded-full bg-neutral-900">
                  <Text className="text-xs font-semibold text-white">{index + 1}</Text>
                </View>
                <Text className="flex-1 text-base leading-6 text-neutral-700">
                  {t(key)}
                </Text>
              </View>
            ))}
          </View>
        </Card>

        <Card className="bg-white">
          <Text className="text-lg font-semibold text-neutral-900">
            {t("photoGuide.objectPrompt")}
          </Text>
          <Pressable
            onPress={() => setPickerVisible(true)}
            accessibilityRole="button"
            accessibilityLabel={t("photoGuide.selectA11y")}
            className="mt-3 flex-row items-center justify-between rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 active:bg-neutral-100"
          >
            <Text className="text-base font-medium text-neutral-900">
              {selectedLabel}
            </Text>
            <Text className="text-base text-neutral-500" accessibilityElementsHidden>
              ▾
            </Text>
          </Pressable>

          <Text className="mt-5 text-base font-semibold text-neutral-900">
            {t("photoGuide.objectsInstructionTitle", { object: selectedLabel })}
          </Text>
          <View className="mt-3 gap-3">
            {OBJECT_STEPS.map((step) => (
              <View key={step} className="rounded-2xl bg-amber-50/80 px-4 py-3">
                <Text className="text-sm leading-5 text-neutral-700">
                  {t(`photoGuide.objects.${selectedObject}.${step}`)}
                </Text>
              </View>
            ))}
          </View>
        </Card>

        <Button
          variant="muted"
          label={t("common.navBackHome")}
          onPress={() => router.back()}
        />
      </View>

      <Modal
        visible={pickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerVisible(false)}
      >
        <Pressable
          className="flex-1 justify-end bg-black/40"
          onPress={() => setPickerVisible(false)}
        >
          <Pressable
            className="rounded-t-3xl bg-white p-5"
            onPress={(event) => event.stopPropagation()}
          >
            <Text className="mb-4 text-lg font-semibold text-neutral-900">
              {t("photoGuide.objectPrompt")}
            </Text>
            <View className="gap-2">
              {OBJECT_TYPES.map((objectType) => (
                <Pressable
                  key={objectType}
                  onPress={() => {
                    setSelectedObject(objectType);
                    setPickerVisible(false);
                  }}
                  accessibilityRole="button"
                  className={`rounded-2xl px-4 py-3 active:bg-neutral-100 ${
                    selectedObject === objectType ? "bg-neutral-100" : "bg-white"
                  }`}
                >
                  <Text className="text-base font-medium text-neutral-900">
                    {t(`photoGuide.objects.${objectType}.label`)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}
