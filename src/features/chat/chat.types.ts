import type { FollowUpQuestion, UserContext } from "../report/report.types";

export type ChatRole = "user" | "assistant";

export type ChatMessageKind = "text" | "photo_upload" | "question";

type ChatMessageShared = {
  id: string;
  role: ChatRole;
  createdAt: string;
};

export type ChatUserTextMessage = ChatMessageShared & {
  role: "user";
  kind: "text";
  text: string;
  imageUris?: never;
  question?: never;
};

export type ChatAssistantTextMessage = ChatMessageShared & {
  role: "assistant";
  kind: "text";
  textKey: string;
  textOptions?: Record<string, string | number>;
  text?: never;
  imageUris?: never;
  question?: never;
};

export type ChatTextMessage = ChatUserTextMessage | ChatAssistantTextMessage;

export type ChatPhotoUploadMessage = ChatMessageShared & {
  kind: "photo_upload";
  text?: never;
  imageUris: string[];
  question?: never;
};

export type ChatQuestionMessage = ChatMessageShared & {
  kind: "question";
  text?: never;
  imageUris?: never;
  question: FollowUpQuestion;
};

export type ChatMessage =
  | ChatTextMessage
  | ChatPhotoUploadMessage
  | ChatQuestionMessage;

export type ChatState = {
  messages: ChatMessage[];
  draft: string;
  pendingPhotos: string[];
  pendingContext: Partial<UserContext>;
  latestReportId: string | null;
};
