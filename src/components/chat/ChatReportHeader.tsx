import { Image, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { reportDisplayText } from "../../features/i18n/reportDisplay";
import type { ObjectReport, UserDecision } from "../../features/report/report.types";
import RecommendationBadge from "../report/RecommendationBadge";
import ScoreBadge from "../report/ScoreBadge";
import CameraIcon from "../icons/CameraIcon";
import ShoppingBagIcon from "../icons/ShoppingBagIcon";
import DonutProgress from "../ui/DonutProgress";
import { useDisplayPhotoUri } from "../../lib/persistence/useDisplayPhotoUris";

type Props = {
  report: ObjectReport;
  onSetDecision: (decision: UserDecision | null) => void;
};

const PHOTO_SIZE = 60;

export default function ChatReportHeader({ report, onSetDecision }: Props) {
  const { t } = useTranslation();
  const router = useRouter();

  const { analysis, decision, improvementForm, photos, userContext, userDecision } = report;
  const d = (v: string) => reportDisplayText(t, v);

  const firstPhoto = photos[0];
  const firstPhotoDisplayUri = useDisplayPhotoUri(firstPhoto);

  const answeredCount = improvementForm
    ? improvementForm.fields.filter((f) => f.value !== undefined && f.value !== null).length
    : 0;
  const totalCount = improvementForm?.fields.length ?? 0;
  const hasForm = improvementForm !== undefined;

  function handleEditForm() {
    if (hasForm) {
      router.push({ pathname: "/report/[id]/improve", params: { id: report.id } });
    } else {
      router.push({ pathname: "/report/[id]", params: { id: report.id } });
    }
  }

  function handleToggleBought() {
    onSetDecision(userDecision === "buy" ? null : "buy");
  }

  const editFormLabel = hasForm
    ? t("chat.reportHeader.form.editForm")
    : t("chat.reportHeader.form.viewReport");

  const isBought = userDecision === "buy";

  return (
    <>
      <View className="border-b border-neutral-100 bg-white px-4 py-3">
        {/* Top row: photo + info + score */}
        <View className="flex-row items-center gap-3">
          {firstPhotoDisplayUri !== undefined ? (
            <Image
              source={{ uri: firstPhotoDisplayUri }}
              style={{ width: PHOTO_SIZE, height: PHOTO_SIZE, borderRadius: 10 }}
              accessibilityLabel={t("chat.reportHeader.photoAlt")}
            />
          ) : (
            <View
              style={{ width: PHOTO_SIZE, height: PHOTO_SIZE, borderRadius: 10 }}
              className="items-center justify-center bg-neutral-100"
              accessibilityElementsHidden
            >
              <CameraIcon size={28} color="#a3a3a3" />
            </View>
          )}

          <View className="flex-1 gap-1">
            <RecommendationBadge recommendation={decision.recommendation} />
            <Text
              className="text-sm font-semibold leading-5 text-neutral-900"
              numberOfLines={2}
            >
              {d(analysis.objectName)}
            </Text>
            {typeof userContext.sellerPrice === "number" ? (
              <Text className="text-xs text-neutral-500">
                {t("report.preview.sellerPrice", {
                  price: userContext.sellerPrice,
                  currency: userContext.sellerCurrency ?? "–",
                })}
                {"  ·  "}
                {t("report.preview.maxPrice", {
                  price: decision.suggestedMaxPrice,
                  currency: decision.suggestedMaxPriceCurrency,
                })}
              </Text>
            ) : (
              <Text className="text-xs text-neutral-500">
                {t("report.preview.maxPrice", {
                  price: decision.suggestedMaxPrice,
                  currency: decision.suggestedMaxPriceCurrency,
                })}
              </Text>
            )}
          </View>

          <ScoreBadge score={decision.worthBringingHomeScore} />
        </View>

        {/* Action buttons */}
        <View className="mt-3 flex-row items-center gap-2">
          {/* Add-detail / view-report button with donut progress */}
          <Pressable
            onPress={handleEditForm}
            accessibilityRole="button"
            accessibilityLabel={editFormLabel}
            className="flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 active:bg-neutral-100"
          >
            {hasForm ? (
              <DonutProgress
                answered={answeredCount}
                total={totalCount}
                size={16}
                strokeWidth={2}
                color="#404040"
                trackColor="#d4d4d4"
              />
            ) : null}
            <Text className="text-sm font-semibold text-neutral-700">
              {editFormLabel}
            </Text>
          </Pressable>

          {/* Shopping bag toggle — active = bought */}
          <Pressable
            onPress={handleToggleBought}
            accessibilityRole="togglebutton"
            accessibilityLabel={t(
              isBought
                ? "chat.reportHeader.decision.bought"
                : "chat.reportHeader.decision.decide",
            )}
            accessibilityState={{ checked: isBought }}
            className={`items-center justify-center rounded-xl p-2.5 active:opacity-70 ${
              isBought ? "bg-emerald-500" : "border border-neutral-200 bg-neutral-50"
            }`}
            style={{ width: 44, height: 44 }}
          >
            <ShoppingBagIcon
              size={22}
              color={isBought ? "#ffffff" : "#525252"}
              filled={isBought}
            />
          </Pressable>
        </View>
      </View>
    </>
  );
}
