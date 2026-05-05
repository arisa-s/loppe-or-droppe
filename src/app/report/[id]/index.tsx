import { View, Text, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import Screen from "../../../components/ui/Screen";
import Button from "../../../components/ui/Button";
import ReportDetail from "../../../components/report/ReportDetail";
import { useReportById } from "../../../features/report/report.provider";

function normalizeIdParam(value: string | string[] | undefined): string {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value) && value.length > 0 && value[0] !== undefined) {
    return value[0];
  }
  return "";
}

export default function ReportDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const rawId = useLocalSearchParams<{ id: string }>().id;
  const id = normalizeIdParam(rawId);
  const report = useReportById(id);

  if (id.length === 0 || report === null) {
    return (
      <Screen className="bg-neutral-50">
        <View className="flex-1 items-center justify-center gap-5 p-6">
          <Text className="text-xl font-semibold text-neutral-900">
            {t("report.detail.notFound.title")}
          </Text>
          <Text className="text-center text-base leading-6 text-neutral-600">
            {t("report.detail.notFound.body")}
          </Text>
          <Button
            label={t("report.detail.notFound.cta")}
            onPress={() => router.push("/")}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen className="bg-neutral-50">
      <View className="border-b border-neutral-200 px-4 py-3">
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/")}
          className="self-start"
        >
          <Text className="text-base text-neutral-600">
            {t("common.navBackHome")}
          </Text>
        </Pressable>
      </View>
      <ReportDetail report={report} />
    </Screen>
  );
}
