import type { ReactNode } from "react";
import { View } from "react-native";

type CardProps = {
  children: ReactNode;
  className?: string;
};

export default function Card({ children, className }: CardProps) {
  return (
    <View
      className={`rounded-2xl border border-neutral-200 bg-neutral-50 p-4 shadow-sm ${className ?? ""}`}
    >
      {children}
    </View>
  );
}
