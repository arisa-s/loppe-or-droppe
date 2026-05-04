import { View, Text } from "react-native";
import {
  recommendationBadgeClasses,
  recommendationFromScore,
} from "../../lib/recommendation";

type Props = {
  score: number;
  size?: "sm" | "lg";
};

export default function ScoreBadge({ score, size = "sm" }: Props) {
  const rec = recommendationFromScore(score);
  const { bg, border, text } = recommendationBadgeClasses(rec);
  const isLg = size === "lg";

  return (
    <View
      className={`items-center justify-center rounded-full border ${bg} ${border} ${
        isLg ? "h-20 w-20" : "h-12 w-12"
      }`}
    >
      <Text
        className={`font-bold leading-tight ${text} ${isLg ? "text-3xl" : "text-lg"}`}
      >
        {score}
      </Text>
    </View>
  );
}
