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
import PhotoAttachmentPreview from "../components/chat/PhotoAttachmentPreview";
import RequiredPhotoStart from "../components/chat/RequiredPhotoStart";
import { useChat } from "../features/chat/chat.provider";
import type { ChatMessage } from "../features/chat/chat.types";
import {
  useLatestReport,
  useReportDispatch,
} from "../features/report/report.provider";
import { generateInitial } from "../features/report/report.service";
import { applyAnswer, applyPhotos } from "../features/report/report.updateService";
import type {
  Answer,
  FollowUpQuestion,
  ObjectReport,
  UserContext,
} from "../features/report/report.types";
import { webMaxWidthContentStyle } from "../lib/layout";
import { pickPhotos } from "../lib/photos";

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
    if (message.kind !== "question" || message.question.answered) {
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

function knownQuestionIds(messages: ChatMessage[]): Set<string> {
  return new Set(
    messages
      .filter((message) => message.kind === "question")
      .map((message) => message.question.id),
  );
}

function parsePrice(text: string): number | undefined {
  const match = text.replace(",", ".").match(/\d+(?:\.\d+)?/);
  if (match === null) {
    return undefined;
  }
  const value = Number.parseFloat(match[0]);
  return Number.isFinite(value) ? value : undefined;
}

function inferCurrency(text: string): string | undefined {
  const upper = text.toUpperCase();
  const currencyMatch = upper.match(/\b[A-Z]{3}\b/);
  if (currencyMatch !== null) {
    return currencyMatch[0];
  }
  if (upper.includes("¥") || upper.includes("YEN")) {
    return "JPY";
  }
  if (upper.includes("KR") || upper.includes("DKK")) {
    return "DKK";
  }
  if (upper.includes("$") || upper.includes("USD")) {
    return "USD";
  }
  if (upper.includes("€") || upper.includes("EUR")) {
    return "EUR";
  }
  return undefined;
}

function inferCountryCode(text: string): string | undefined {
  const trimmed = text.trim();
  if (/^[A-Za-z]{2}$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  const lower = trimmed.toLowerCase();
  if (lower.includes("denmark") || lower.includes("danmark")) return "DK";
  if (lower.includes("japan") || lower.includes("日本")) return "JP";
  if (lower.includes("sweden")) return "SE";
  if (lower.includes("norway")) return "NO";
  if (lower.includes("germany")) return "DE";
  if (lower.includes("france")) return "FR";
  if (lower.includes("united kingdom") || lower.includes("uk")) return "GB";
  if (lower.includes("united states") || lower.includes("usa")) return "US";
  return undefined;
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
    return sellerPrice !== undefined || sellerCurrency !== undefined ? patch : undefined;
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

function dispatchNewQuestions(input: {
  report: ObjectReport;
  messages: ChatMessage[];
  dispatch: ReturnType<typeof useChat>["dispatch"];
}) {
  const existingQuestionIds = knownQuestionIds(input.messages);
  input.report.followUpQuestions
    .filter(
      (question) => !question.answered && !existingQuestionIds.has(question.id),
    )
    .forEach((question) => {
      input.dispatch({ type: "ADD_QUESTION", question });
    });
}

export default function ChatScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { state, dispatch } = useChat();
  const reportDispatch = useReportDispatch();
  const report = useLatestReport();
  const flatListRef = useRef<FlatList<ChatMessage>>(null);
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [confirmNewAnalysisVisible, setConfirmNewAnalysisVisible] = useState(false);
  const didSeedInitialPrompt = useRef(false);

  useEffect(() => {
    if (!didSeedInitialPrompt.current && state.messages.length === 0) {
      didSeedInitialPrompt.current = true;
      dispatch({
        type: "ADD_ASSISTANT_TEXT",
        textKey: "chat.start.requirePhotoPrompt",
      });
    }
  }, [dispatch, state.messages.length]);

  useEffect(() => {
    if (state.messages.length > 0) {
      flatListRef.current?.scrollToEnd({ animated: true });
    }
  }, [state.messages.length]);

  const handlePickPhotos = useCallback(async () => {
    const uris = await pickPhotos();
    if (uris.length > 0) {
      dispatch({ type: "STAGE_PHOTOS", uris });
    }
  }, [dispatch]);

  const handleRemovePhoto = useCallback(
    (uri: string) => {
      dispatch({ type: "REMOVE_STAGED_PHOTO", uri });
    },
    [dispatch],
  );

  const handleSend = useCallback(async () => {
    if (isAnalysing) return;

    const hasDraft = state.draft.trim().length > 0;
    const hasPhotos = state.pendingPhotos.length > 0;
    if (!hasDraft && !hasPhotos) return;

    if (report === null && !hasPhotos) {
      dispatch({
        type: "ADD_ASSISTANT_TEXT",
        textKey: "chat.start.photoRequiredReminder",
      });
      return;
    }

    const text = state.draft.trim();
    const photos = [...state.pendingPhotos];
    const activeQuestion = findActiveQuestion(state.messages);
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
        const initial = await generateInitial({ photos, userContext: {} });
        reportDispatch({ type: "SET_REPORT", report: initial });
        dispatch({ type: "ADD_REPORT_PREVIEW", reportId: initial.id });
        dispatch({
          type: "ADD_ASSISTANT_TEXT",
          textKey: "report.preview.summary.initial",
        });
        dispatchNewQuestions({ report: initial, messages: state.messages, dispatch });
        return;
      }

      if (isSubmittingAnswer && activeQuestion !== null) {
        const answer = buildAnswer({
          question: activeQuestion,
          text,
          imageUris: photos,
        });
        dispatch({ type: "ANSWER_QUESTION", answer });
        const next = await applyAnswer(report, answer);
        reportDispatch({ type: "SET_REPORT", report: next });
        dispatch({ type: "ADD_REPORT_PREVIEW", reportId: next.id });
        dispatch({
          type: "ADD_ASSISTANT_TEXT",
          textKey: "report.preview.summary.answerUpdated",
        });
        dispatchNewQuestions({ report: next, messages: state.messages, dispatch });
        return;
      }

      if (hasDraft) {
        dispatch({ type: "ADD_USER_TEXT", text });
      }

      if (hasPhotos) {
        const next = await applyPhotos(report, photos);
        reportDispatch({ type: "SET_REPORT", report: next });
        dispatch({ type: "ADD_REPORT_PREVIEW", reportId: next.id });
        dispatch({
          type: "ADD_ASSISTANT_TEXT",
          textKey: "report.preview.summary.photosUpdated",
        });
        dispatchNewQuestions({ report: next, messages: state.messages, dispatch });
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
    report,
    reportDispatch,
    dispatch,
  ]);

  const handleNewAnalysis = useCallback(() => {
    setConfirmNewAnalysisVisible(true);
  }, []);

  const handleOpenSettings = useCallback(() => {
    router.push("/settings");
  }, [router]);

  const confirmNewAnalysis = useCallback(() => {
    setConfirmNewAnalysisVisible(false);
    dispatch({ type: "RESET_FOR_NEW_ANALYSIS" });
    reportDispatch({ type: "RESET" });
    dispatch({
      type: "ADD_ASSISTANT_TEXT",
      textKey: "chat.start.requirePhotoPrompt",
    });
  }, [dispatch, reportDispatch]);

  const showPhotoStart = report === null && state.pendingPhotos.length === 0;

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
            <Text className="text-xl leading-none text-neutral-700" accessibilityElementsHidden>
              ☰
            </Text>
          </Pressable>

          {/* Center — app name */}
          <Text className="text-base font-semibold text-neutral-900">
            {t("common.appName")}
          </Text>

          {/* Right — new analysis (edit icon) or spacer */}
          {report !== null ? (
            <Pressable
              onPress={handleNewAnalysis}
              accessibilityRole="button"
              accessibilityLabel={t("chat.header.newAnalysisA11y")}
              className="h-11 w-11 items-center justify-center rounded-xl active:bg-neutral-100"
              hitSlop={8}
            >
              <Text className="text-xl leading-none text-neutral-700" accessibilityElementsHidden>
                ✎
              </Text>
            </Pressable>
          ) : (
            <View className="h-11 w-11" />
          )}
        </View>

        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={0}
        >
          <FlatList
            ref={flatListRef}
            data={state.messages}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <ChatMessageBubble message={item} />}
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

          {showPhotoStart ? (
            <RequiredPhotoStart onAddPhoto={handlePickPhotos} />
          ) : (
            <PhotoAttachmentPreview
              uris={state.pendingPhotos}
              onRemove={handleRemovePhoto}
            />
          )}

          <ChatComposer
            draft={state.draft}
            onChangeDraft={(text) =>
              dispatch({ type: "SET_DRAFT", draft: text })
            }
            onSend={handleSend}
            onPickPhotos={handlePickPhotos}
            canSend={
              !isAnalysing &&
              (state.pendingPhotos.length > 0 ||
                (report !== null && state.draft.trim().length > 0))
            }
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
