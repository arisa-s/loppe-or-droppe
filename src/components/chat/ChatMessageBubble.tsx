import { Image, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { ChatMessage } from "../../features/chat/chat.types";
import ReportPreviewCard from "../report/ReportPreviewCard";

type Props = {
  message: ChatMessage;
};

const THUMB_SIZE = 80;

function PhotoGrid({ uris }: { uris: string[] }) {
  const { t } = useTranslation();
  return (
    <View className="flex-row flex-wrap gap-1">
      {uris.map((uri) => (
        <Image
          key={uri}
          source={{ uri }}
          style={{ width: THUMB_SIZE, height: THUMB_SIZE, borderRadius: 8 }}
          accessibilityLabel={t("chat.bubble.photoAlt")}
        />
      ))}
    </View>
  );
}

function TextBubble({
  text,
  isUser,
}: {
  text: string;
  isUser: boolean;
}) {
  return (
    <View
      className={
        isUser
          ? "max-w-[80%] self-end rounded-2xl rounded-br-sm bg-neutral-900 px-4 py-3"
          : "max-w-[80%] self-start rounded-2xl rounded-bl-sm bg-neutral-100 px-4 py-3"
      }
    >
      <Text
        className={
          isUser ? "text-base leading-6 text-white" : "text-base leading-6 text-neutral-900"
        }
      >
        {text}
      </Text>
    </View>
  );
}

export default function ChatMessageBubble({ message }: Props) {
  const { t } = useTranslation();
  const isUser = message.role === "user";

  switch (message.kind) {
    case "text": {
      const displayText =
        message.role === "assistant"
          ? t(message.textKey, { ...(message.textOptions ?? {}) })
          : message.text;
      return (
        <View className={`mb-3 ${isUser ? "items-end" : "items-start"}`}>
          <TextBubble text={displayText} isUser={isUser} />
        </View>
      );
    }

    case "photo_upload":
      return (
        <View className="mb-3 items-end">
          <View className="max-w-[80%] self-end rounded-2xl rounded-br-sm bg-neutral-900 p-2">
            <PhotoGrid uris={message.imageUris} />
            <Text className="mt-1 text-right text-xs text-neutral-300">
              {t("chat.bubble.photoCount", { count: message.imageUris.length })}
            </Text>
          </View>
        </View>
      );

    case "question":
      return (
        <View className="mb-3 items-start">
          <View className="max-w-[80%] self-start rounded-2xl rounded-bl-sm border border-neutral-200 bg-white px-4 py-3">
            <Text className="text-base leading-6 text-neutral-900">
              {t(message.question.question)}
            </Text>
            <Text className="mt-1.5 text-sm leading-5 text-neutral-500">
              {t(message.question.reason)}
            </Text>
          </View>
        </View>
      );

    case "report_preview":
      return (
        <View className="mb-3 w-full items-start">
          <ReportPreviewCard reportId={message.reportId} />
        </View>
      );
  }
}
