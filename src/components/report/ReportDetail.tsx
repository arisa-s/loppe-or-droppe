import { View, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { reportDisplayText } from "../../features/i18n/reportDisplay";
import type { ObjectReport } from "../../features/report/report.types";
import Card from "../ui/Card";
import ChecklistCard from "./ChecklistCard";
import SellerModeUpsellCard from "./SellerModeUpsellCard";
import ReportSection from "./ReportSection";
import ReportSummaryHero from "./ReportSummaryHero";
import ReportMetaRow from "./ReportMetaRow";
import ReasonRiskList from "./ReasonRiskList";

type Props = {
  report: ObjectReport;
};

export default function ReportDetail({ report }: Props) {
  const { t } = useTranslation();
  const d = (v: string) => reportDisplayText(t, v);
  const { analysis, decision } = report;
  const { estimatedCreationPeriod } = analysis;

  const hasConditionObservations = analysis.conditionObservations.length > 0;

  return (
    <View className="gap-6 p-4 pb-10">
      {/* ── 1. Decision summary ── */}
      <ReportSummaryHero report={report} />

      {/* ── 2. Key reasons and risks ── */}
      <ReportSection label={t("report.detail.section.reasonsRisks")}>
        <Card>
          <View className="gap-4">
            <View>
              <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                {t("report.detail.field.reasons")}
              </Text>
              <ReasonRiskList
                items={decision.reasons}
                emptyKey="report.detail.empty.noReasons"
              />
            </View>
            <View className="h-px bg-neutral-100" />
            <View>
              <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                {t("report.detail.field.risks")}
              </Text>
              <ReasonRiskList
                items={decision.risks}
                emptyKey="report.detail.empty.noRisks"
              />
            </View>
          </View>
        </Card>
      </ReportSection>

      {/* ── 3. Identity / condition ── */}
      <ReportSection label={t("report.detail.section.identityCondition")}>
        <View className="gap-4">
          {hasConditionObservations ? (
            <ChecklistCard
              title={t("report.detail.field.conditionObservations")}
              items={analysis.conditionObservations}
            />
          ) : null}
          <Card>
            <View>
              <ReportMetaRow
                label={t("report.detail.field.likelyCategory")}
                value={d(analysis.likelyCategory)}
              />
              <View className="h-px bg-neutral-100" />
              <ReportMetaRow
                label={t("report.detail.field.likelyOrigin")}
                value={d(analysis.likelyOrigin)}
              />
              <View className="h-px bg-neutral-100" />
              <ReportMetaRow
                label={t("report.detail.field.likelyStyle")}
                value={d(analysis.likelyStyle)}
              />
              <View className="h-px bg-neutral-100" />
              <ReportMetaRow
                label={t("report.detail.field.likelyMaterial")}
                value={d(analysis.likelyMaterial)}
              />
              <View className="h-px bg-neutral-100" />
              <ReportMetaRow
                label={t("report.detail.field.periodReasoning")}
                value={d(estimatedCreationPeriod.reasoning)}
              />
              <View className="h-px bg-neutral-100" />
              <ReportMetaRow
                label={t("report.detail.field.analysisConfidence")}
                value={t(`report.confidence.${analysis.confidence}`)}
              />
            </View>
          </Card>
        </View>
      </ReportSection>

      {/* ── 4. Travel and handling ── */}
      {analysis.travelCautions.length > 0 ? (
        <ReportSection label={t("report.detail.section.travelHandling")}>
          <ChecklistCard items={analysis.travelCautions} />
        </ReportSection>
      ) : null}

      {/* ── 5. Seller Mode upsell ── */}
      <SellerModeUpsellCard />
    </View>
  );
}
