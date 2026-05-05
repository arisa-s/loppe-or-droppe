import type { ReactNode } from "react";
import { View, Text } from "react-native";

type Props = {
  label: string;
  children: ReactNode;
};

export default function ReportSection({ label, children }: Props) {
  return (
    <View className="gap-3">
      <Text className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
        {label}
      </Text>
      {children}
    </View>
  );
}
