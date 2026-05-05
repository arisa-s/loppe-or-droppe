import "../../global.css";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { I18nextProvider } from "react-i18next";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { i18n } from "../features/i18n";
import { ChatProvider } from "../features/chat/chat.provider";
import { ReportProvider } from "../features/report/report.provider";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <I18nextProvider i18n={i18n}>
        <ChatProvider>
          <ReportProvider>
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
          </ReportProvider>
        </ChatProvider>
      </I18nextProvider>
    </SafeAreaProvider>
  );
}
