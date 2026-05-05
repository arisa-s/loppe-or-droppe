import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import ReportImprovementForm from "../../../components/report/ReportImprovementForm";
import Button from "../../../components/ui/Button";
import Screen from "../../../components/ui/Screen";
import { useChat } from "../../../features/chat/chat.provider";
import {
  useReportById,
  useReportDispatch,
} from "../../../features/report/report.provider";
import {
  submittedImprovementPhotoUris,
  summarizeImprovementSubmission,
} from "../../../features/report/questionnaireSummary";
import { applyImprovementSubmission } from "../../../features/report/report.updateService";
import type {
  ReportImprovementSubmission,
  ReportImprovementFieldValue,
} from "../../../features/report/report.types";
import {
  replaceUploadedPhotoUris,
  saveReport,
  uploadReportPhotos,
  type UploadedReportPhoto,
} from "../../../lib/persistence";
import { pickPhotos } from "../../../lib/photos";

function normalizeIdParam(value: string | string[] | undefined): string {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value) && value.length > 0 && value[0] !== undefined) {
    return value[0];
  }
  return "";
}

function replacementMap(uploadedPhotos: UploadedReportPhoto[]): Record<string, string> {
  return Object.fromEntries(
    uploadedPhotos.map((photo) => [photo.localUri, photo.storageRef]),
  );
}

function replaceSubmissionPhotos(
  submission: ReportImprovementSubmission,
  uploadedPhotos: UploadedReportPhoto[],
): ReportImprovementSubmission {
  const replacements = replacementMap(uploadedPhotos);
  const values: Record<string, ReportImprovementFieldValue> = {};

  for (const [key, value] of Object.entries(submission.values)) {
    values[key] = Array.isArray(value)
      ? value.map((uri) => replacements[uri] ?? uri)
      : value;
  }

  return {
    ...submission,
    values,
    ...(submission.newPhotoUris === undefined
      ? {}
      : {
          newPhotoUris: submission.newPhotoUris.map(
            (uri) => replacements[uri] ?? uri,
          ),
        }),
  };
}

export default function ReportImprovementScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const rawId = useLocalSearchParams<{ id: string }>().id;
  const id = normalizeIdParam(rawId);
  const report = useReportById(id);
  const reportDispatch = useReportDispatch();
  const { dispatch: chatDispatch } = useChat();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const handlePickPhotos = useCallback(() => pickPhotos(), []);

  const handleBackToReport = useCallback(() => {
    if (id.length > 0) {
      router.push({ pathname: "/report/[id]", params: { id } });
      return;
    }
    router.push("/");
  }, [id, router]);

  const handleSubmit = useCallback(
    async (submission: ReportImprovementSubmission) => {
      if (report === null || isSubmitting) return;

      try {
        setIsSubmitting(true);
        setErrorKey(null);
        const submittedPhotoUris =
          report.improvementForm !== undefined
            ? submittedImprovementPhotoUris(report.improvementForm, submission)
            : [];
        const saveResult = await saveReport(report);
        if (!saveResult.ok) {
          setErrorKey("report.improvement.form.photoUploadError");
          return;
        }
        const uploadResult = await uploadReportPhotos(report.id, submittedPhotoUris);
        if (!uploadResult.ok) {
          setErrorKey("report.improvement.form.photoUploadError");
          return;
        }

        const persistedSubmission = replaceSubmissionPhotos(
          submission,
          uploadResult.data,
        );
        const next = await applyImprovementSubmission(report, persistedSubmission);
        reportDispatch({ type: "SET_REPORT", report: next });
        const formDetail =
          report.improvementForm !== undefined
            ? summarizeImprovementSubmission(t, report.improvementForm, submission)
            : "";
        const persistedPhotoUris = replaceUploadedPhotoUris(
          submittedPhotoUris,
          uploadResult.data,
        );
        if (persistedPhotoUris.length > 0) {
          chatDispatch({ type: "ADD_USER_PHOTOS", imageUris: persistedPhotoUris });
        }
        if (formDetail.length > 0) {
          chatDispatch({ type: "ADD_USER_TEXT", text: formDetail });
        }
        chatDispatch({ type: "ADD_REPORT_PREVIEW", reportId: next.id });
        chatDispatch({
          type: "ADD_ASSISTANT_TEXT",
          textKey: "report.improvement.summary.updated",
          textOptions: {
            confidence: t(`report.confidence.${next.analysis.confidence}`),
          },
        });
        router.replace("/");
      } catch {
        setErrorKey("report.improvement.form.error");
      } finally {
        setIsSubmitting(false);
      }
    },
    [chatDispatch, isSubmitting, report, reportDispatch, router, t],
  );

  if (id.length === 0 || report === null) {
    return (
      <Screen className="bg-neutral-50">
        <View className="flex-1 items-center justify-center gap-5 p-6">
          <Text className="text-xl font-semibold text-neutral-900">
            {t("report.detail.notFound.title")}
          </Text>
          <Text className="text-center text-base leading-6 text-neutral-600">
            {t("report.detail.notFound.body")}
          </Text>
          <Button
            label={t("report.detail.notFound.cta")}
            onPress={() => router.push("/")}
          />
        </View>
      </Screen>
    );
  }

  if (report.improvementForm === undefined) {
    return (
      <Screen className="bg-neutral-50">
        <View className="border-b border-neutral-200 px-4 py-3">
          <Pressable
            accessibilityRole="button"
            onPress={handleBackToReport}
            className="self-start"
          >
            <Text className="text-base text-neutral-600">
              {t("report.improvement.empty.backToReport")}
            </Text>
          </Pressable>
        </View>
        <View className="flex-1 items-center justify-center gap-5 p-6">
          <Text className="text-center text-xl font-semibold text-neutral-900">
            {t("report.improvement.empty.title")}
          </Text>
          <Text className="text-center text-base leading-6 text-neutral-600">
            {t("report.improvement.empty.body")}
          </Text>
          <Button
            label={t("report.improvement.empty.cta")}
            onPress={handleBackToReport}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen className="bg-neutral-50">
      <View className="border-b border-neutral-200 px-4 py-3">
        <Pressable
          accessibilityRole="button"
          onPress={handleBackToReport}
          className="self-start"
        >
          <Text className="text-base text-neutral-600">
            {t("report.improvement.empty.backToReport")}
          </Text>
        </Pressable>
      </View>
      {errorKey !== null ? (
        <View className="mx-4 mt-4 rounded-2xl border border-red-200 bg-red-50 p-4">
          <Text className="text-sm leading-5 text-red-700">{t(errorKey)}</Text>
        </View>
      ) : null}
      <ReportImprovementForm
        form={report.improvementForm}
        sessionContext={report.userContext}
        isSubmitting={isSubmitting}
        onPickPhotos={handlePickPhotos}
        onSubmit={handleSubmit}
        onCancel={handleBackToReport}
      />
    </Screen>
  );
}
