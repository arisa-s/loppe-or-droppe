import { useState } from "react";
import { Image, Pressable, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { ChatMessage } from "../../features/chat/chat.types";
import type { FollowUpQuestion } from "../../features/report/report.types";

type QuestionAnswerInput = {
  text?: string;
  imageUris?: string[];
};

type Props = {
  message: ChatMessage;
  onAnswerQuestion?: ((
    question: FollowUpQuestion,
    answer: QuestionAnswerInput,
  ) => void) | undefined;
  onSkipQuestion?: ((question: FollowUpQuestion) => void) | undefined;
  onPickQuestionPhotos?: (() => Promise<string[]>) | undefined;
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

function TextBubble({ text, isUser }: { text: string; isUser: boolean }) {
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
          isUser
            ? "text-base leading-6 text-white"
            : "text-base leading-6 text-neutral-900"
        }
      >
        {text}
      </Text>
    </View>
  );
}

function QuestionChip({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      className={`rounded-full border px-3 py-2 ${
        disabled
          ? "border-neutral-200 bg-neutral-100"
          : "border-neutral-300 bg-white active:bg-neutral-100"
      }`}
    >
      <Text
        className={`text-sm font-semibold ${
          disabled ? "text-neutral-400" : "text-neutral-700"
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function QuestionActions({
  question,
  onAnswerQuestion,
  onSkipQuestion,
  onPickQuestionPhotos,
}: {
  question: FollowUpQuestion;
  onAnswerQuestion?: ((
    question: FollowUpQuestion,
    answer: QuestionAnswerInput,
  ) => void) | undefined;
  onSkipQuestion?: ((question: FollowUpQuestion) => void) | undefined;
  onPickQuestionPhotos?: (() => Promise<string[]>) | undefined;
}) {
  const { t } = useTranslation();
  const [numberText, setNumberText] = useState("");
  const isResolved = question.answered || question.skipped;
  const canAnswer = !isResolved && onAnswerQuestion !== undefined;
  const skipChip = (
    <QuestionChip
      label={t("chat.followUp.skip")}
      disabled={isResolved || onSkipQuestion === undefined}
      onPress={() => onSkipQuestion?.(question)}
    />
  );

  if (question.expectedAnswerType === "choice") {
    return (
      <View className="mt-3 flex-row flex-wrap gap-2">
        {(question.options ?? []).map((option) => (
          <QuestionChip
            key={option.value}
            label={t(option.labelKey)}
            disabled={!canAnswer}
            onPress={() => onAnswerQuestion?.(question, { text: option.value })}
          />
        ))}
        {skipChip}
      </View>
    );
  }

  if (question.expectedAnswerType === "number") {
    const trimmedNumber = numberText.trim();
    return (
      <View className="mt-3 gap-2">
        <TextInput
          value={numberText}
          onChangeText={setNumberText}
          editable={!isResolved}
          keyboardType="numeric"
          placeholder={t("chat.followUp.numberPlaceholder")}
          placeholderTextColor="#a3a3a3"
          className="rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-base text-neutral-900"
        />
        <View className="flex-row flex-wrap gap-2">
          <QuestionChip
            label={t("chat.followUp.answer")}
            disabled={!canAnswer || trimmedNumber.length === 0}
            onPress={() => onAnswerQuestion?.(question, { text: trimmedNumber })}
          />
          {skipChip}
        </View>
      </View>
    );
  }

  if (question.expectedAnswerType === "boolean") {
    return (
      <View className="mt-3 flex-row flex-wrap gap-2">
        <QuestionChip
          label={t("common.yes")}
          disabled={!canAnswer}
          onPress={() => onAnswerQuestion?.(question, { text: "yes" })}
        />
        <QuestionChip
          label={t("common.no")}
          disabled={!canAnswer}
          onPress={() => onAnswerQuestion?.(question, { text: "no" })}
        />
        {skipChip}
      </View>
    );
  }

  if (question.expectedAnswerType === "photo") {
    return (
      <View className="mt-3 flex-row flex-wrap gap-2">
        <QuestionChip
          label={t("report.improvement.form.addPhoto")}
          disabled={isResolved || onPickQuestionPhotos === undefined}
          onPress={async () => {
            const imageUris = await onPickQuestionPhotos?.();
            if (imageUris !== undefined && imageUris.length > 0) {
              onAnswerQuestion?.(question, { imageUris });
            }
          }}
        />
        {skipChip}
      </View>
    );
  }

  return <View className="mt-3 flex-row flex-wrap gap-2">{skipChip}</View>;
}

export default function ChatMessageBubble({
  message,
  onAnswerQuestion,
  onSkipQuestion,
  onPickQuestionPhotos,
}: Props) {
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
            <QuestionActions
              question={message.question}
              onAnswerQuestion={onAnswerQuestion}
              onSkipQuestion={onSkipQuestion}
              onPickQuestionPhotos={onPickQuestionPhotos}
            />
          </View>
        </View>
      );
  }
}
