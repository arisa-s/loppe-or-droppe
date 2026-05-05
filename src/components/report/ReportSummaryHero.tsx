import { View, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { reportDisplayText } from "../../features/i18n/reportDisplay";
import type { ObjectReport } from "../../features/report/report.types";
import Card from "../ui/Card";
import ScoreBadge from "./ScoreBadge";
import RecommendationBadge from "./RecommendationBadge";

type Props = {
  report: ObjectReport;
};

export default function ReportSummaryHero({ report }: Props) {
  const { t } = useTranslation();
  const d = (v: string) => reportDisplayText(t, v);
  const { analysis, decision, userContext } = report;
  const { estimatedCreationPeriod } = analysis;

  const sellerPriceAvailable =
    typeof userContext.sellerPrice === "number" &&
    typeof userContext.sellerCurrency === "string";

  return (
    <Card>
      {/* Recommendation + Score row */}
      <View className="mb-4 flex-row items-center gap-4">
        <ScoreBadge score={decision.worthBringingHomeScore} size="lg" />
        <View className="flex-1 gap-2">
          <RecommendationBadge recommendation={decision.recommendation} />
          <Text className="text-xs text-neutral-400">
            {t("report.detail.hero.scoreLabel")}
          </Text>
        </View>
      </View>

      {/* Object name */}
      <Text className="mb-1 text-xl font-semibold leading-7 text-neutral-900">
        {d(analysis.objectName)}
      </Text>

      {/* Short description */}
      <Text className="mb-4 text-sm leading-5 text-neutral-500">
        {d(analysis.shortDescription)}
      </Text>

      {/* Period + confidence compact row */}
      <View className="mb-4 flex-row flex-wrap items-center gap-x-2 gap-y-1">
        <Text className="text-xs font-medium text-neutral-400">
          {t("report.detail.hero.periodLabel")}
        </Text>
        <Text className="text-sm text-neutral-700">
          {d(estimatedCreationPeriod.label)}{" "}
          ({estimatedCreationPeriod.startYear}–{estimatedCreationPeriod.endYear})
        </Text>
        <View className="h-1 w-1 rounded-full bg-neutral-300" />
        <Text className="text-xs text-neutral-400">
          {t(`report.confidence.${estimatedCreationPeriod.confidence}`)}
        </Text>
      </View>

      {/* Price comparison */}
      <View className="flex-row flex-wrap gap-6">
        {sellerPriceAvailable ? (
          <View>
            <Text className="mb-0.5 text-xs font-medium text-neutral-400">
              {t("report.detail.hero.sellerPrice")}
            </Text>
            <Text className="text-base font-semibold text-neutral-800">
              {userContext.sellerPrice} {userContext.sellerCurrency}
            </Text>
          </View>
        ) : null}
        <View>
          <Text className="mb-0.5 text-xs font-medium text-neutral-400">
            {t("report.detail.hero.maxPrice")}
          </Text>
          <Text className="text-base font-semibold text-neutral-800">
            {decision.suggestedMaxPrice} {decision.suggestedMaxPriceCurrency}
          </Text>
        </View>
      </View>
    </Card>
  );
}
