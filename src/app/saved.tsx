import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import Button from "../components/ui/Button";
import Screen from "../components/ui/Screen";

export default function SavedReportsScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <Screen className="bg-neutral-50">
      <View className="flex-1 items-stretch justify-center gap-6 p-6">
        <View className="items-center gap-2 pb-2">
          <Text className="text-xl font-semibold text-neutral-900">
            {t("saved.phase1Title")}
          </Text>
          <Text className="text-center text-sm leading-5 text-neutral-500">
            {t("saved.phase1Body")}
          </Text>
        </View>
        <Button
          variant="muted"
          label={t("common.navBackHome")}
          onPress={() => router.push("/")}
        />
      </View>
    </Screen>
  );
}
