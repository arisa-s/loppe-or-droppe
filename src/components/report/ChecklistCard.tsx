import { View, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { reportDisplayText } from "../../features/i18n/reportDisplay";
import Card from "../ui/Card";

type Props = {
  title?: string;
  items: string[];
};

export default function ChecklistCard({ title, items }: Props) {
  const { t } = useTranslation();
  if (items.length === 0) return null;

  return (
    <Card>
      {title !== undefined && title.length > 0 ? (
        <Text className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          {title}
        </Text>
      ) : null}
      <View className="gap-2">
        {items.map((item, index) => (
          <View key={index} className="flex-row gap-2">
            <Text className="mt-0.5 text-neutral-400">{t("common.listBullet")}</Text>
            <Text className="flex-1 text-base leading-6 text-neutral-700">
              {reportDisplayText(t, item)}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}
