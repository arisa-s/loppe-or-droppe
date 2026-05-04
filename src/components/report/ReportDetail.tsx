import { View, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { reportDisplayText } from "../../features/i18n/reportDisplay";
import type { ObjectReport } from "../../features/report/report.types";
import Card from "../ui/Card";
import ScoreBadge from "./ScoreBadge";
import RecommendationBadge from "./RecommendationBadge";
import ChecklistCard from "./ChecklistCard";
import SellerModeUpsellCard from "./SellerModeUpsellCard";

type Props = {
  report: ObjectReport;
};

function SectionHeader({ label }: { label: string }) {
  return (
    <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
      {label}
    </Text>
  );
}

type FieldRowProps = {
  label: string;
  value: string;
};

function FieldRow({ label, value }: FieldRowProps) {
  return (
    <View>
      <Text className="mb-0.5 text-xs font-medium text-neutral-400">{label}</Text>
      <Text className="text-base leading-6 text-neutral-800">{value}</Text>
    </View>
  );
}

export default function ReportDetail({ report }: Props) {
  const { t } = useTranslation();
  const d = (value: string) => reportDisplayText(t, value);
  const { analysis, decision, userContext } = report;
  const { estimatedCreationPeriod } = analysis;

  const hasConditionData =
    analysis.conditionObservations.length > 0 ||
    analysis.qualityChecklist.length > 0 ||
    analysis.missingPhotoChecklist.length > 0;

  const sellerPriceAvailable =
    typeof userContext.sellerPrice === "number" &&
    typeof userContext.sellerCurrency === "string";

  return (
    <View className="gap-4 p-4 pb-8">
      {/* ── 1. Identity ── */}
      <View>
        <SectionHeader label={t("report.detail.section.identity")} />
        <Card>
          <View className="gap-3">
            <FieldRow
              label={t("report.detail.field.objectName")}
              value={d(analysis.objectName)}
            />
            <FieldRow
              label={t("report.detail.field.shortDescription")}
              value={d(analysis.shortDescription)}
            />
            <FieldRow
              label={t("report.detail.field.likelyCategory")}
              value={d(analysis.likelyCategory)}
            />
            <FieldRow
              label={t("report.detail.field.likelyOrigin")}
              value={d(analysis.likelyOrigin)}
            />
            <FieldRow
              label={t("report.detail.field.likelyStyle")}
              value={d(analysis.likelyStyle)}
            />
            <FieldRow
              label={t("report.detail.field.likelyMaterial")}
              value={d(analysis.likelyMaterial)}
            />
          </View>
        </Card>
      </View>

      {/* ── 2. Period ── */}
      <View>
        <SectionHeader label={t("report.detail.section.period")} />
        <Card>
          <View className="gap-3">
            <FieldRow
              label={t("report.detail.field.periodLabel")}
              value={d(estimatedCreationPeriod.label)}
            />
            <FieldRow
              label={t("report.detail.field.periodYears")}
              value={`${estimatedCreationPeriod.startYear}–${estimatedCreationPeriod.endYear}`}
            />
            <FieldRow
              label={t("report.detail.field.periodConfidence")}
              value={t(`report.confidence.${estimatedCreationPeriod.confidence}`)}
            />
            <FieldRow
              label={t("report.detail.field.periodReasoning")}
              value={d(estimatedCreationPeriod.reasoning)}
            />
          </View>
        </Card>
      </View>

      {/* ── 3. Condition & Checklists ── */}
      {hasConditionData ? (
        <View className="gap-3">
          <SectionHeader label={t("report.detail.section.condition")} />
          <ChecklistCard
            title={t("report.detail.field.conditionObservations")}
            items={analysis.conditionObservations}
          />
          <ChecklistCard
            title={t("report.detail.field.qualityChecklist")}
            items={analysis.qualityChecklist}
          />
          <ChecklistCard
            title={t("report.detail.field.missingPhotoChecklist")}
            items={analysis.missingPhotoChecklist}
          />
        </View>
      ) : null}

      {/* ── 4. Decision ── */}
      <View className="gap-3">
        <SectionHeader label={t("report.detail.section.decision")} />

        {/* Score + Recommendation hero */}
        <Card>
          <View className="mb-4 flex-row items-center gap-4">
            <ScoreBadge score={decision.worthBringingHomeScore} size="lg" />
            <View className="flex-1 gap-2">
              <Text className="text-xs font-medium text-neutral-400">
                {t("report.detail.field.score")}
              </Text>
              <RecommendationBadge recommendation={decision.recommendation} />
            </View>
          </View>
          <View className="gap-3">
            {sellerPriceAvailable ? (
              <>
                <FieldRow
                  label={t("report.detail.field.sellerPrice")}
                  value={`${userContext.sellerPrice} ${userContext.sellerCurrency}`}
                />
                <Text className="text-xs italic text-neutral-400">
                  {t("report.detail.convertedPrice.placeholderCaption")}
                </Text>
              </>
            ) : null}
            <FieldRow
              label={t("report.detail.field.suggestedMaxPrice")}
              value={`${decision.suggestedMaxPrice} ${decision.suggestedMaxPriceCurrency}`}
            />
            <FieldRow
              label={t("report.detail.field.analysisConfidence")}
              value={t(`report.confidence.${analysis.confidence}`)}
            />
          </View>
        </Card>

        <ChecklistCard
          title={t("report.detail.field.reasons")}
          items={decision.reasons}
        />
        <ChecklistCard
          title={t("report.detail.field.risks")}
          items={decision.risks}
        />
      </View>

      {/* ── 5. Travel Cautions ── */}
      {analysis.travelCautions.length > 0 ? (
        <View>
          <SectionHeader label={t("report.detail.section.travelCautions")} />
          <ChecklistCard items={analysis.travelCautions} />
        </View>
      ) : null}

      {/* ── 6. Seller Questions ── */}
      {analysis.sellerQuestions.length > 0 ? (
        <View>
          <SectionHeader label={t("report.detail.section.sellerQuestions")} />
          <ChecklistCard items={analysis.sellerQuestions} />
        </View>
      ) : null}

      {/* ── 7. Seller Mode Upsell ── */}
      <SellerModeUpsellCard />
    </View>
  );
}
