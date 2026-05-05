import { View, Text } from "react-native";

type Props = {
  label: string;
  value: string;
};

export default function ReportMetaRow({ label, value }: Props) {
  return (
    <View className="flex-row items-start gap-3 py-2">
      <Text className="w-28 shrink-0 text-xs font-medium leading-5 text-neutral-400">
        {label}
      </Text>
      <Text className="flex-1 text-sm leading-5 text-neutral-700">{value}</Text>
    </View>
  );
}
