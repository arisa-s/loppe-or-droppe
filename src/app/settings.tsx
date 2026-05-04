import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Screen from "../components/ui/Screen";
import { setAppLanguage } from "../features/i18n";

export default function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const resolved = i18n.resolvedLanguage ?? i18n.language;
  const currentLabel =
    resolved.toLowerCase().startsWith("ja")
      ? t("settings.languageJapanese")
      : t("settings.languageEnglish");

  return (
    <Screen className="bg-neutral-50">
      <View className="flex-1 gap-6 p-6">
        <Card>
          <Text className="text-2xl font-semibold text-neutral-900">
            {t("settings.title")}
          </Text>
          <Text className="mt-4 text-sm uppercase tracking-wide text-neutral-500">
            {t("settings.languageSection")}
          </Text>
          <Text className="mt-2 text-sm leading-5 text-neutral-600">
            {t("settings.languageCurrent", { label: currentLabel })}
          </Text>
          <View className="mt-4 gap-3">
            <Button
              variant="muted"
              label={t("settings.languageEnglish")}
              onPress={() => setAppLanguage("en")}
            />
            <Button
              variant="muted"
              label={t("settings.languageJapanese")}
              onPress={() => setAppLanguage("ja")}
            />
          </View>
        </Card>
        <Card>
          <Text className="text-base font-semibold text-neutral-900">
            {t("settings.modeBasic")}
          </Text>
          <Text className="mt-2 text-base text-neutral-600">
            {t("settings.modeSellerLocked")}
          </Text>
        </Card>
        <Button
          variant="muted"
          label={t("common.navBackHome")}
          onPress={() => router.push("/")}
        />
      </View>
    </Screen>
  );
}
