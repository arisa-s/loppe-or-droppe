import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

const CARD_WIDTH = 280;

const TIP_KEYS = [
  { n: 1, title: "chat.start.tipCards.card1.title", body: "chat.start.tipCards.card1.body" },
  { n: 2, title: "chat.start.tipCards.card2.title", body: "chat.start.tipCards.card2.body" },
  { n: 3, title: "chat.start.tipCards.card3.title", body: "chat.start.tipCards.card3.body" },
  { n: 4, title: "chat.start.tipCards.card4.title", body: "chat.start.tipCards.card4.body" },
] as const;

export default function PhotoTipsStrip() {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <View className="border-t border-neutral-100 bg-white px-4 pb-1 pt-3">
      <View className="mb-3 flex-row items-baseline justify-between gap-3">
        <Text className="flex-1 text-base font-semibold text-neutral-900">
          {t("chat.start.tipsHeading")}
        </Text>
        <Pressable
          onPress={() => router.push("/photo-guide")}
          accessibilityRole="button"
          accessibilityLabel={t("photoGuide.openA11y")}
          hitSlop={8}
        >
          <Text className="text-sm font-medium text-neutral-500">
            {t("chat.start.tipsLearnMore")}
          </Text>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 12, paddingBottom: 8 }}
      >
        {TIP_KEYS.map((c) => (
          <View
            key={c.n}
            className="rounded-2xl bg-amber-50/80 px-4 py-3"
            style={{ width: CARD_WIDTH }}
          >
            <View className="mb-2 h-7 w-7 items-center justify-center rounded-full border border-amber-200/80 bg-white">
              <Text className="text-sm font-semibold text-neutral-800">{c.n}</Text>
            </View>
            <Text className="text-base font-semibold leading-5 text-neutral-900">{t(c.title)}</Text>
            <Text className="mt-1.5 text-sm leading-5 text-neutral-600">{t(c.body)}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
