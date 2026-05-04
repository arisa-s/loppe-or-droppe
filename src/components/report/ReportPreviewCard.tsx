import { Pressable, View, Text } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { reportDisplayText } from "../../features/i18n/reportDisplay";
import { useReportById } from "../../features/report/report.provider";
import Card from "../ui/Card";
import ScoreBadge from "./ScoreBadge";
import RecommendationBadge from "./RecommendationBadge";

type Props = {
  reportId: string;
};

export default function ReportPreviewCard({ reportId }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const report = useReportById(reportId);

  if (report === null) return null;

  const { analysis, decision, userContext } = report;

  const title =
    report.status === "initial"
      ? t("report.preview.title.initial")
      : t("report.preview.title.updated");

  const sellerPriceAvailable =
    typeof userContext.sellerPrice === "number" &&
    typeof userContext.sellerCurrency === "string";

  function handlePress() {
    router.push({ pathname: "/report/[id]", params: { id: reportId } });
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={handlePress}
      className="mb-2 w-full max-w-[85%] self-start active:opacity-80"
    >
      <Card>
        <Text className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">
          {title}
        </Text>

        <View className="mb-3 flex-row items-start gap-3">
          <ScoreBadge score={decision.worthBringingHomeScore} />
          <View className="flex-1 gap-1.5">
            <Text
              className="text-base font-semibold leading-5 text-neutral-900"
              numberOfLines={2}
            >
              {reportDisplayText(t, analysis.objectName)}
            </Text>
            <RecommendationBadge recommendation={decision.recommendation} />
          </View>
        </View>

        <View className="gap-1">
          {sellerPriceAvailable ? (
            <Text className="text-sm text-neutral-500">
              {t("report.preview.sellerPrice", {
                price: userContext.sellerPrice,
                currency: userContext.sellerCurrency,
              })}
            </Text>
          ) : null}
          <Text className="text-sm text-neutral-500">
            {t("report.preview.maxPrice", {
              price: decision.suggestedMaxPrice,
              currency: decision.suggestedMaxPriceCurrency,
            })}
          </Text>
        </View>
      </Card>
    </Pressable>
  );
}
