import { View, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { reportDisplayText } from "../../features/i18n/reportDisplay";

type Props = {
  items: string[];
  emptyKey: string;
  /** Limit the number of items shown. Defaults to 3. */
  limit?: number;
};

export default function ReasonRiskList({ items, emptyKey, limit = 3 }: Props) {
  const { t } = useTranslation();

  if (items.length === 0) {
    return (
      <Text className="text-sm italic text-neutral-400">{t(emptyKey)}</Text>
    );
  }

  return (
    <View className="gap-2">
      {items.slice(0, limit).map((item, index) => (
        <View key={index} className="flex-row gap-2">
          <Text className="mt-0.5 text-neutral-400">{t("common.listBullet")}</Text>
          <Text className="flex-1 text-sm leading-5 text-neutral-700">
            {reportDisplayText(t, item)}
          </Text>
        </View>
      ))}
    </View>
  );
}
