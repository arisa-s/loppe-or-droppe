import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { SafeAreaView } from "react-native-safe-area-context";
import ChatComposer from "../components/chat/ChatComposer";
import ChatMessageBubble from "../components/chat/ChatMessageBubble";
import ChatReportHeader from "../components/chat/ChatReportHeader";
import PhotoPickerPanel from "../components/chat/PhotoPickerPanel";
import PhotoTipsStrip from "../components/chat/PhotoTipsStrip";
import { useChat } from "../features/chat/chat.provider";
import type { ChatMessage } from "../features/chat/chat.types";
import {
  useLatestReport,
  useReportDispatch,
} from "../features/report/report.provider";
import {
  analyze,
  inferCountryCode,
  inferCurrency,
  parsePrice,
} from "../features/report/report.service";
import {
  applyAnswer,
  applyQuestionSkip,
  applyPhotos,
} from "../features/report/report.updateService";
import { getPostReportChatQuestions } from "../features/report/report.mockData";
import type {
  Answer,
  FollowUpQuestion,
  ObjectReport,
  Purpose,
  UserContext,
  UserDecision,
} from "../features/report/report.types";
import { webMaxWidthContentStyle } from "../lib/layout";
import {
  replaceUploadedPhotoUris,
  saveReport,
  uploadReportPhotos,
  type UploadedReportPhoto,
} from "../lib/persistence";
import { pickPhotos, takePhoto } from "../lib/photos";

const priorityRank: Record<FollowUpQuestion["priority"], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function rankPriority(priority: FollowUpQuestion["priority"]): number {
  return priorityRank[priority];
}

function findActiveQuestion(messages: ChatMessage[]): FollowUpQuestion | null {
  let active: FollowUpQuestion | null = null;
  messages.forEach((message) => {
    if (
      message.kind !== "question" ||
      message.question.answered ||
      message.question.skipped
    ) {
      return;
    }
    if (
      active === null ||
      rankPriority(message.question.priority) < rankPriority(active.priority)
    ) {
      active = message.question;
    }
  });
  return active;
}

function latestPreReportPhotoUris(messages: ChatMessage[]): string[] | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.kind === "photo_upload") {
      return message.imageUris;
    }
  }
  return null;
}

function questionHistory(messages: ChatMessage[]): FollowUpQuestion[] {
  return messages
    .filter((message): message is Extract<ChatMessage, { kind: "question" }> => {
      return message.kind === "question";
    })
    .map((message) => message.question);
}

function hasQuestionMessage(messages: ChatMessage[], questionId: string): boolean {
  return messages.some(
    (message) => message.kind === "question" && message.question.id === questionId,
  );
}

function isPurpose(value: string): value is Purpose {
  return ["keep", "gift", "decorate", "research", "resell"].includes(value);
}

function buildContextPatch(
  question: FollowUpQuestion,
  text: string,
): Partial<UserContext> | undefined {
  if (question.id === "seller-price") {
    const sellerPrice = parsePrice(text);
    const sellerCurrency = inferCurrency(text);
    const patch: Partial<UserContext> = {};
    if (sellerPrice !== undefined) patch.sellerPrice = sellerPrice;
    if (sellerCurrency !== undefined) patch.sellerCurrency = sellerCurrency;
    return sellerPrice !== undefined || sellerCurrency !== undefined
      ? patch
      : undefined;
  }

  if (question.id === "seller-currency") {
    const sellerCurrency = inferCurrency(text);
    return sellerCurrency === undefined ? undefined : { sellerCurrency };
  }

  if (question.id === "purpose" && isPurpose(text)) {
    return { purpose: text };
  }

  const countryCode = inferCountryCode(text);
  if (question.id === "buying-country" && countryCode !== undefined) {
    return { buyingCountry: countryCode };
  }
  if (question.id === "home-country" && countryCode !== undefined) {
    return { homeCountry: countryCode };
  }

  return undefined;
}

function buildAnswer(input: {
  question: FollowUpQuestion;
  text: string;
  imageUris: string[];
}): Answer {
  const contextPatch = buildContextPatch(input.question, input.text);
  return {
    questionId: input.question.id,
    ...(input.text.length > 0 ? { text: input.text } : {}),
    ...(input.imageUris.length > 0 ? { imageUris: input.imageUris } : {}),
    ...(contextPatch !== undefined ? { contextPatch } : {}),
  };
}

function uploadedPhotoReplacements(
  uploadedPhotos: UploadedReportPhoto[],
): Record<string, string> {
  return Object.fromEntries(
    uploadedPhotos.map((photo) => [photo.localUri, photo.storageRef]),
  );
}

function reportPhotoReplacements(
  before: string[],
  after: string[],
): Record<string, string> {
  if (before.length !== after.length) {
    return {};
  }
  return Object.fromEntries(
    before
      .map((uri, index) => [uri, after[index]] as const)
      .filter((entry): entry is readonly [string, string] =>
        entry[1] !== undefined && entry[0] !== entry[1],
      ),
  );
}

export default function ChatScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { state, dispatch } = useChat();
  const reportDispatch = useReportDispatch();
  const report = useLatestReport();
  const flatListRef = useRef<FlatList<ChatMessage>>(null);
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [confirmNewAnalysisVisible, setConfirmNewAnalysisVisible] =
    useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (state.messages.length > 0) {
      flatListRef.current?.scrollToEnd({ animated: true });
    }
  }, [state.messages.length]);

  const handleTogglePicker = useCallback(() => {
    setPickerOpen((prev) => !prev);
  }, []);

  const handlePickerTakePhoto = useCallback(async () => {
    setPickerOpen(false);
    const uris = await takePhoto();
    if (uris.length > 0) {
      dispatch({ type: "STAGE_PHOTOS", uris });
    }
  }, [dispatch]);

  const handlePickerSelectFromLibrary = useCallback(async () => {
    setPickerOpen(false);
    const uris = await pickPhotos();
    if (uris.length > 0) {
      dispatch({ type: "STAGE_PHOTOS", uris });
    }
  }, [dispatch]);

  const handlePickerSelectRecent = useCallback(
    (uri: string) => {
      setPickerOpen(false);
      dispatch({ type: "STAGE_PHOTOS", uris: [uri] });
    },
    [dispatch],
  );

  const handleRemovePhoto = useCallback(
    (uri: string) => {
      dispatch({ type: "REMOVE_STAGED_PHOTO", uri });
    },
    [dispatch],
  );

  const maybeAskPostReportQuestion = useCallback(
    (nextReport: NonNullable<typeof report>) => {
      const nextQuestion = getPostReportChatQuestions(nextReport).find(
        (question) => !hasQuestionMessage(state.messages, question.id),
      );
      if (nextQuestion !== undefined) {
        dispatch({ type: "ADD_QUESTION", question: nextQuestion });
      }
    },
    [dispatch, state.messages],
  );

  const uploadPhotosForReport = useCallback(
    async (
      baseReport: ObjectReport,
      photoUris: string[],
    ): Promise<{ report: ObjectReport; uploadedPhotos: UploadedReportPhoto[] }> => {
      const saveResult = await saveReport(baseReport);
      if (!saveResult.ok) {
        dispatch({
          type: "ADD_ASSISTANT_TEXT",
          textKey: "chat.error.photoUploadFailed",
        });
        return { report: baseReport, uploadedPhotos: [] };
      }

      const uploadResult = await uploadReportPhotos(baseReport.id, photoUris);
      if (!uploadResult.ok) {
        dispatch({
          type: "ADD_ASSISTANT_TEXT",
          textKey: "chat.error.photoUploadFailed",
        });
        return { report: baseReport, uploadedPhotos: [] };
      }

      const uploadedPhotos = uploadResult.data;
      if (uploadedPhotos.length === 0) {
        return { report: baseReport, uploadedPhotos };
      }

      const nextReport: ObjectReport = {
        ...baseReport,
        photos: replaceUploadedPhotoUris(baseReport.photos, uploadedPhotos),
      };
      void saveReport(nextReport);
      dispatch({
        type: "REPLACE_PHOTO_URIS",
        replacements: uploadedPhotoReplacements(uploadedPhotos),
      });

      return { report: nextReport, uploadedPhotos };
    },
    [dispatch],
  );

  const runAnalyze = useCallback(
    async (input: {
      photos: string[];
      userContext: UserContext;
      freeText?: string;
      previousQuestions?: FollowUpQuestion[];
    }) => {
      try {
        setIsAnalysing(true);
        const result = await analyze(input);

        if (result.kind === "report") {
          const replacements = reportPhotoReplacements(
            input.photos,
            result.report.photos,
          );
          if (Object.keys(replacements).length > 0) {
            dispatch({ type: "REPLACE_PHOTO_URIS", replacements });
          }
          const uploaded = await uploadPhotosForReport(
            result.report,
            result.report.photos,
          );
          reportDispatch({ type: "SET_REPORT", report: uploaded.report });
          dispatch({ type: "CLEAR_PENDING_CONTEXT" });
          dispatch({ type: "ADD_REPORT_PREVIEW", reportId: uploaded.report.id });
          dispatch({
            type: "ADD_ASSISTANT_TEXT",
            textKey: "report.improvement.summary.available",
            textOptions: {
              confidence: t(`report.confidence.${uploaded.report.analysis.confidence}`),
            },
          });
          return;
        }

        dispatch({
          type: "MERGE_PENDING_CONTEXT",
          contextPatch: result.userContext,
        });
        const firstQuestion = result.questions.find(
          (question) => !hasQuestionMessage(state.messages, question.id),
        );
        if (firstQuestion !== undefined) {
          if (questionHistory(state.messages).length === 0) {
            dispatch({
              type: "ADD_ASSISTANT_TEXT",
              textKey: "chat.followUp.preflightIntro",
            });
          }
          dispatch({ type: "ADD_QUESTION", question: firstQuestion });
        }
      } catch {
        dispatch({
          type: "ADD_ASSISTANT_TEXT",
          textKey: "chat.error.analysisFailed",
        });
      } finally {
        setIsAnalysing(false);
      }
    },
    [dispatch, reportDispatch, state.messages, t, uploadPhotosForReport],
  );

  const handleSend = useCallback(async () => {
    if (isAnalysing) return;

    const hasDraft = state.draft.trim().length > 0;
    const hasPhotos = state.pendingPhotos.length > 0;
    if (!hasDraft && !hasPhotos) return;

    setPickerOpen(false);

    const text = state.draft.trim();
    const activeQuestion = findActiveQuestion(state.messages);

    if (report === null && activeQuestion !== null && hasDraft) {
      const photos = latestPreReportPhotoUris(state.messages);
      if (photos === null) return;
      const answer = buildAnswer({
        question: activeQuestion,
        text,
        imageUris: [],
      });
      const nextContext = {
        ...state.pendingContext,
        ...(answer.contextPatch ?? {}),
      };
      const previousQuestions = [
        ...questionHistory(state.messages),
        { ...activeQuestion, answered: true, skipped: false },
      ];
      if (answer.contextPatch !== undefined) {
        dispatch({
          type: "MERGE_PENDING_CONTEXT",
          contextPatch: answer.contextPatch,
        });
      }
      dispatch({ type: "ANSWER_QUESTION", answer });
      dispatch({ type: "SET_DRAFT", draft: "" });
      await runAnalyze({
        photos,
        userContext: nextContext,
        previousQuestions,
      });
      return;
    }

    if (report === null && !hasPhotos) {
      // Allow a pre-photo text message; remind user to add photos for analysis
      dispatch({ type: "ADD_USER_TEXT", text });
      dispatch({ type: "SET_DRAFT", draft: "" });
      dispatch({
        type: "ADD_ASSISTANT_TEXT",
        textKey: "chat.start.photoRequiredFollowUp",
      });
      return;
    }

    const photos = [...state.pendingPhotos];
    const isSubmittingAnswer =
      report !== null &&
      activeQuestion !== null &&
      (hasDraft ||
        (hasPhotos && activeQuestion.expectedAnswerType === "photo"));

    if (hasPhotos) {
      dispatch({ type: "ADD_USER_PHOTOS", imageUris: photos });
    }
    dispatch({ type: "CLEAR_PENDING_PHOTOS" });
    dispatch({ type: "SET_DRAFT", draft: "" });

    try {
      setIsAnalysing(true);

      if (report === null) {
        if (hasDraft) {
          dispatch({ type: "ADD_USER_TEXT", text });
        }
        await runAnalyze({
          photos,
          userContext: state.pendingContext,
          ...(hasDraft ? { freeText: text } : {}),
          previousQuestions: [],
        });
        return;
      }

      const evidencePhotos =
        hasPhotos
          ? replaceUploadedPhotoUris(
              photos,
              (await uploadPhotosForReport(report, photos)).uploadedPhotos,
            )
          : photos;

      if (isSubmittingAnswer && activeQuestion !== null) {
        const answer = buildAnswer({
          question: activeQuestion,
          text,
          imageUris: evidencePhotos,
        });
        dispatch({ type: "MARK_QUESTION_ANSWERED", questionId: activeQuestion.id });
        const next = await applyAnswer(report, answer);
        reportDispatch({ type: "SET_REPORT", report: next });
        dispatch({ type: "ADD_REPORT_PREVIEW", reportId: next.id });
        dispatch({
          type: "ADD_ASSISTANT_TEXT",
          textKey: "report.preview.summary.answerUpdated",
          textOptions: {
            confidence: t(`report.confidence.${next.analysis.confidence}`),
          },
        });
        maybeAskPostReportQuestion(next);
        return;
      }

      if (hasDraft) {
        dispatch({ type: "ADD_USER_TEXT", text });
      }

      if (hasPhotos) {
        const next = await applyPhotos(report, evidencePhotos);
        reportDispatch({ type: "SET_REPORT", report: next });
        dispatch({ type: "ADD_REPORT_PREVIEW", reportId: next.id });
        dispatch({
          type: "ADD_ASSISTANT_TEXT",
          textKey: "report.preview.summary.photosUpdated",
          textOptions: {
            confidence: t(`report.confidence.${next.analysis.confidence}`),
          },
        });
        maybeAskPostReportQuestion(next);
      }
    } catch {
      dispatch({
        type: "ADD_ASSISTANT_TEXT",
        textKey: "chat.error.analysisFailed",
      });
    } finally {
      setIsAnalysing(false);
    }
  }, [
    isAnalysing,
    state.draft,
    state.pendingPhotos,
    state.messages,
    state.pendingContext,
    report,
    reportDispatch,
    dispatch,
    maybeAskPostReportQuestion,
    runAnalyze,
    t,
    uploadPhotosForReport,
  ]);

  const handleAnswerQuestion = useCallback(
    async (
      question: FollowUpQuestion,
      input: { text?: string; imageUris?: string[] },
    ) => {
      if (isAnalysing) return;
      const textAnswer = input.text?.trim() ?? "";
      const imageUris = input.imageUris ?? [];
      if (textAnswer.length === 0 && imageUris.length === 0) return;

      const answer = buildAnswer({
        question,
        text: textAnswer,
        imageUris,
      });

      if (report === null) {
        const photos = latestPreReportPhotoUris(state.messages);
        if (photos === null) return;
        const nextContext = {
          ...state.pendingContext,
          ...(answer.contextPatch ?? {}),
        };
        const previousQuestions = [
          ...questionHistory(state.messages),
          { ...question, answered: true, skipped: false },
        ];
        if (answer.contextPatch !== undefined) {
          dispatch({
            type: "MERGE_PENDING_CONTEXT",
            contextPatch: answer.contextPatch,
          });
        }
        dispatch({ type: "ANSWER_QUESTION", answer });
        await runAnalyze({
          photos,
          userContext: nextContext,
          previousQuestions,
        });
        return;
      }

      try {
        setIsAnalysing(true);
        const evidenceImageUris =
          imageUris.length > 0
            ? replaceUploadedPhotoUris(
                imageUris,
                (await uploadPhotosForReport(report, imageUris)).uploadedPhotos,
              )
            : imageUris;
        const evidenceAnswer = buildAnswer({
          question,
          text: textAnswer,
          imageUris: evidenceImageUris,
        });
        dispatch({ type: "MARK_QUESTION_ANSWERED", questionId: question.id });
        const next = await applyAnswer(report, evidenceAnswer);
        reportDispatch({ type: "SET_REPORT", report: next });
        dispatch({ type: "ADD_REPORT_PREVIEW", reportId: next.id });
        dispatch({
          type: "ADD_ASSISTANT_TEXT",
          textKey: "report.preview.summary.answerUpdated",
          textOptions: {
            confidence: t(`report.confidence.${next.analysis.confidence}`),
          },
        });
        maybeAskPostReportQuestion(next);
      } catch {
        dispatch({
          type: "ADD_ASSISTANT_TEXT",
          textKey: "chat.error.analysisFailed",
        });
      } finally {
        setIsAnalysing(false);
      }
    },
    [
      dispatch,
      isAnalysing,
      maybeAskPostReportQuestion,
      report,
      reportDispatch,
      runAnalyze,
      state.messages,
      state.pendingContext,
      t,
      uploadPhotosForReport,
    ],
  );

  const handleSkipQuestion = useCallback(
    async (question: FollowUpQuestion) => {
      dispatch({
        type: "SKIP_QUESTION",
        questionId: question.id,
        skippedText: t("chat.followUp.skipped"),
      });

      if (report === null) {
        if (isAnalysing) return;
        const photos = latestPreReportPhotoUris(state.messages);
        if (photos === null) return;
        const previousQuestions = [
          ...questionHistory(state.messages),
          { ...question, answered: false, skipped: true },
        ];
        await runAnalyze({
          photos,
          userContext: state.pendingContext,
          previousQuestions,
        });
        return;
      }

      if (isAnalysing) return;

      try {
        setIsAnalysing(true);
        const next = await applyQuestionSkip(report, question.id);
        reportDispatch({ type: "SET_REPORT", report: next });
        maybeAskPostReportQuestion(next);
      } catch {
        dispatch({
          type: "ADD_ASSISTANT_TEXT",
          textKey: "chat.error.analysisFailed",
        });
      } finally {
        setIsAnalysing(false);
      }
    },
    [
      dispatch,
      isAnalysing,
      maybeAskPostReportQuestion,
      report,
      reportDispatch,
      runAnalyze,
      state.messages,
      state.pendingContext,
      t,
    ],
  );

  const handleNewAnalysis = useCallback(() => {
    setConfirmNewAnalysisVisible(true);
  }, []);

  const handleOpenSettings = useCallback(() => {
    router.push("/settings");
  }, [router]);

  const handleSetDecision = useCallback(
    (decision: UserDecision | null) => {
      reportDispatch({ type: "SET_USER_DECISION", decision });
    },
    [reportDispatch],
  );

  const confirmNewAnalysis = useCallback(() => {
    setConfirmNewAnalysisVisible(false);
    dispatch({ type: "RESET_FOR_NEW_ANALYSIS" });
    reportDispatch({ type: "RESET" });
  }, [dispatch, reportDispatch]);

  const hasPreReportPhotos = latestPreReportPhotoUris(state.messages) !== null;

  return (
    <SafeAreaView className="flex-1 bg-white" edges={["top", "left", "right"]}>
      <View style={webMaxWidthContentStyle()}>
        <View className="flex-row items-center justify-between px-2 py-1">
          {/* Left — hamburger / settings */}
          <Pressable
            onPress={handleOpenSettings}
            accessibilityRole="button"
            accessibilityLabel={t("chat.header.settingsA11y")}
            className="h-11 w-11 items-center justify-center rounded-xl active:bg-neutral-100"
            hitSlop={8}
          >
            <Text
              className="text-xl leading-none text-neutral-700"
              accessibilityElementsHidden
            >
              ☰
            </Text>
          </Pressable>

          {/* Center — app name */}
          <Text className="text-base font-semibold text-neutral-900">
            {t("common.appName")}
          </Text>

          {/* Right — new analysis (plus icon) or spacer */}
          {report !== null ? (
            <Pressable
              onPress={handleNewAnalysis}
              accessibilityRole="button"
              accessibilityLabel={t("chat.header.newAnalysisA11y")}
              className="h-11 w-11 items-center justify-center rounded-xl active:bg-neutral-100"
              hitSlop={8}
            >
              <Text
                className="text-xl leading-none text-neutral-700"
                accessibilityElementsHidden
              >
                +
              </Text>
            </Pressable>
          ) : (
            <View className="h-11 w-11" />
          )}
        </View>

        {report !== null ? (
          <ChatReportHeader report={report} onSetDecision={handleSetDecision} />
        ) : null}

        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={0}
        >
          <FlatList
            ref={flatListRef}
            className="flex-1"
            data={state.messages}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <ChatMessageBubble
                message={item}
                onAnswerQuestion={handleAnswerQuestion}
                onSkipQuestion={handleSkipQuestion}
                onPickQuestionPhotos={pickPhotos}
              />
            )}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingTop: 12,
              paddingBottom: 8,
              flexGrow: 1,
            }}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() =>
              flatListRef.current?.scrollToEnd({ animated: false })
            }
          />

          {isAnalysing ? (
            <View className="px-4 py-3">
              <View className="flex-row items-center gap-1.5">
                <View className="h-2 w-2 rounded-full bg-neutral-400" />
                <View className="h-2 w-2 rounded-full bg-neutral-300" />
                <View className="h-2 w-2 rounded-full bg-neutral-200" />
              </View>
            </View>
          ) : null}

          {report === null && !pickerOpen && !hasPreReportPhotos ? (
            <PhotoTipsStrip />
          ) : null}

          {pickerOpen ? (
            <PhotoPickerPanel
              onTakePhoto={handlePickerTakePhoto}
              onSelectFromLibrary={handlePickerSelectFromLibrary}
              onSelectRecent={handlePickerSelectRecent}
            />
          ) : null}

          <ChatComposer
            draft={state.draft}
            onChangeDraft={(text) =>
              dispatch({ type: "SET_DRAFT", draft: text })
            }
            onSend={handleSend}
            onTogglePicker={handleTogglePicker}
            pickerOpen={pickerOpen}
            canSend={
              !isAnalysing &&
              (state.pendingPhotos.length > 0 || state.draft.trim().length > 0)
            }
            photoUris={state.pendingPhotos}
            onRemovePhoto={handleRemovePhoto}
          />
        </KeyboardAvoidingView>
      </View>

      {confirmNewAnalysisVisible ? (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => setConfirmNewAnalysisVisible(false)}
        >
          <Pressable
            className="flex-1 items-center justify-center bg-black/40 px-6"
            onPress={() => setConfirmNewAnalysisVisible(false)}
          >
            <Pressable
              className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-6"
              onPress={(e) => e.stopPropagation()}
            >
              <Text className="text-lg font-semibold text-neutral-900">
                {t("chat.header.confirm.title")}
              </Text>
              <Text className="mt-2 text-base leading-6 text-neutral-600">
                {t("chat.header.confirm.message")}
              </Text>
              <View className="mt-6 flex-row justify-end gap-3">
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setConfirmNewAnalysisVisible(false)}
                  className="rounded-xl px-4 py-3"
                >
                  <Text className="text-base font-semibold text-neutral-600">
                    {t("chat.header.confirm.cancel")}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={confirmNewAnalysis}
                  className="rounded-xl bg-red-600 px-4 py-3 active:bg-red-700"
                >
                  <Text className="text-base font-semibold text-white">
                    {t("chat.header.confirm.startOver")}
                  </Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </SafeAreaView>
  );
}
