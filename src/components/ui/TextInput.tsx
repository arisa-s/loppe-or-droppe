import type { ComponentProps } from "react";
import { TextInput as RNTextInput } from "react-native";

export type UITextInputProps = ComponentProps<typeof RNTextInput>;

export default function TextInput(props: UITextInputProps) {
  const { className, ...rest } = props;
  return (
    <RNTextInput
      className={`min-h-[48px] rounded-2xl border border-neutral-200 bg-white px-3 py-3 text-base leading-6 text-neutral-900 ${className ?? ""}`}
      placeholderTextColor="#a3a3a3"
      {...rest}
    />
  );
}
