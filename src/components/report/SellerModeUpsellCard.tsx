import { useState } from "react";
import { Modal, Pressable, View, Text } from "react-native";
import { useTranslation } from "react-i18next";
import Card from "../ui/Card";
import Button from "../ui/Button";

const BENEFIT_KEYS = [
  "report.sellerMode.upsell.benefit1",
  "report.sellerMode.upsell.benefit2",
  "report.sellerMode.upsell.benefit3",
  "report.sellerMode.upsell.benefit4",
] as const;

export default function SellerModeUpsellCard() {
  const { t } = useTranslation();
  const [modalVisible, setModalVisible] = useState(false);

  return (
    <>
      <Card>
        <View className="mb-3 flex-row items-center gap-2">
          <View className="h-3 w-3 rounded-full bg-neutral-400" />
          <Text className="text-base font-semibold text-neutral-600">
            {t("report.sellerMode.upsell.headline")}
          </Text>
        </View>
        <View className="mb-4 gap-2">
          {BENEFIT_KEYS.map((key) => (
            <View key={key} className="flex-row gap-2">
              <Text className="text-neutral-400">{t("common.listBullet")}</Text>
              <Text className="flex-1 text-sm leading-5 text-neutral-500">{t(key)}</Text>
            </View>
          ))}
        </View>
        <Button
          variant="muted"
          label={t("report.sellerMode.upsell.cta")}
          onPress={() => setModalVisible(true)}
        />
      </Card>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable
          className="flex-1 items-center justify-center bg-black/40 px-6"
          onPress={() => setModalVisible(false)}
        >
          <Pressable
            className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-6"
            onPress={(e) => e.stopPropagation()}
          >
            <Text className="text-lg font-semibold text-neutral-900">
              {t("report.sellerMode.upsell.cta")}
            </Text>
            <Text className="mt-3 text-base leading-6 text-neutral-600">
              {t("report.sellerMode.upsell.comingSoonMessage")}
            </Text>
            <View className="mt-6">
              <Button
                variant="primary"
                label={t("common.ok")}
                onPress={() => setModalVisible(false)}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
