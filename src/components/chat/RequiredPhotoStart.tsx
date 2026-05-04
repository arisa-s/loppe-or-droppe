import { View } from "react-native";
import { useTranslation } from "react-i18next";
import Button from "../ui/Button";

type Props = {
  onAddPhoto: () => void;
};

export default function RequiredPhotoStart({ onAddPhoto }: Props) {
  const { t } = useTranslation();

  return (
    <View className="mx-4 mb-3">
      <Button label={t("chat.start.addPhotoButton")} onPress={onAddPhoto} />
    </View>
  );
}
