import { Pressable, Text } from "react-native";

export type ButtonVariant = "primary" | "muted";

export type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  accessibilityHint?: string;
  className?: string;
};

export default function Button({
  label,
  onPress,
  variant = "primary",
  accessibilityHint,
  className,
}: ButtonProps) {
  const surface =
    variant === "primary"
      ? "bg-neutral-900 active:bg-neutral-800"
      : "border border-neutral-200 bg-white active:bg-neutral-100";

  const textTone =
    variant === "primary" ? "text-white" : "text-neutral-900";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      className={`rounded-2xl px-4 py-3 ${surface} ${className ?? ""}`}
    >
      <Text className={`text-center text-base font-semibold ${textTone}`}>
        {label}
      </Text>
    </Pressable>
  );
}
