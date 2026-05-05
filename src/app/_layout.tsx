import "../../global.css";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Text, View } from "react-native";
import { I18nextProvider, useTranslation } from "react-i18next";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { i18n, setAppLanguage } from "../features/i18n";
import { ChatProvider, useChat } from "../features/chat/chat.provider";
import type { ChatState } from "../features/chat/chat.types";
import {
  ReportProvider,
  useLatestReport,
  useReportDispatch,
} from "../features/report/report.provider";
import {
  loadState,
  saveChatState,
  saveReport,
  type PersistenceError,
} from "../lib/persistence";

function PersistenceBridge({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { state: chatState, dispatch: chatDispatch } = useChat();
  const report = useLatestReport();
  const reportDispatch = useReportDispatch();
  const [isHydrating, setIsHydrating] = useState(true);
  const [persistenceError, setPersistenceError] =
    useState<PersistenceError | null>(null);
  const hasHydrated = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      const result = await loadState();
      if (cancelled) return;

      if (!result.ok) {
        setPersistenceError(result.error);
        setIsHydrating(false);
        hasHydrated.current = true;
        return;
      }

      if (result.data.language !== null) {
        await setAppLanguage(result.data.language);
      }
      if (result.data.chatState !== null) {
        chatDispatch({ type: "HYDRATE", state: result.data.chatState });
      }
      if (result.data.report !== null) {
        reportDispatch({
          type: "HYDRATE",
          state: { current: result.data.report },
        });
      }

      setIsHydrating(false);
      hasHydrated.current = true;
    }

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, [chatDispatch, reportDispatch]);

  useEffect(() => {
    if (!hasHydrated.current || report === null) return;

    void saveReport(report).then((result) => {
      if (!result.ok && result.error.code !== "auth_required") {
        setPersistenceError(result.error);
      }
    });
  }, [report]);

  const persistableChatState = useMemo<ChatState>(
    () => ({
      messages: chatState.messages,
      draft: "",
      pendingPhotos: [],
      pendingContext: chatState.pendingContext,
      latestReportId: chatState.latestReportId,
    }),
    [
      chatState.latestReportId,
      chatState.messages,
      chatState.pendingContext,
    ],
  );

  useEffect(() => {
    if (!hasHydrated.current) return;
    const hasMeaningfulState =
      persistableChatState.messages.length > 0 ||
      persistableChatState.latestReportId !== null ||
      Object.keys(persistableChatState.pendingContext).length > 0;
    if (!hasMeaningfulState) return;

    void saveChatState(persistableChatState).then((result) => {
      if (!result.ok && result.error.code !== "auth_required") {
        setPersistenceError(result.error);
      }
    });
  }, [persistableChatState]);

  if (isHydrating) {
    return (
      <View className="flex-1 items-center justify-center bg-white px-6">
        <Text className="text-base text-neutral-600">
          {t("common.loading")}
        </Text>
      </View>
    );
  }

  return (
    <>
      {persistenceError !== null ? (
        <View className="border-b border-amber-200 bg-amber-50 px-4 py-2">
          <Text className="text-sm text-amber-900">
            {t("common.persistenceWarning")}
          </Text>
        </View>
      ) : null}
      {children}
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <I18nextProvider i18n={i18n}>
        <ChatProvider>
          <ReportProvider>
            <PersistenceBridge>
              <StatusBar style="dark" />
              <Stack screenOptions={{ headerShown: false, animation: "fade" }}>
                <Stack.Screen name="index" />
                <Stack.Screen
                  name="settings"
                  options={{ presentation: "modal" }}
                />
                <Stack.Screen name="photo-guide" />
                <Stack.Screen name="saved" />
                <Stack.Screen name="report/[id]/index" />
                <Stack.Screen name="report/[id]/improve" />
              </Stack>
            </PersistenceBridge>
          </ReportProvider>
        </ChatProvider>
      </I18nextProvider>
    </SafeAreaProvider>
  );
}
