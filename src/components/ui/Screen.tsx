import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { webMaxWidthContentStyle } from "../../lib/layout";

type ScreenProps = {
  children: ReactNode;
  className?: string;
};

export default function Screen({ children, className }: ScreenProps) {
  return (
    <SafeAreaView className={`flex-1 bg-white ${className ?? ""}`}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={webMaxWidthContentStyle()}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}
