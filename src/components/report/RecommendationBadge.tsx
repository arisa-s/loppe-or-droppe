import { View, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { recommendationBadgeClasses } from "../../lib/recommendation";
import type { Recommendation } from "../../features/report/report.types";

type Props = {
  recommendation: Recommendation;
};

export default function RecommendationBadge({ recommendation }: Props) {
  const { t } = useTranslation();
  const { bg, border, text } = recommendationBadgeClasses(recommendation);

  return (
    <View
      className={`self-start rounded-full border px-3 py-1 ${bg} ${border}`}
    >
      <Text className={`text-sm font-semibold ${text}`}>
        {t(`report.recommendation.${recommendation}`)}
      </Text>
    </View>
  );
}
