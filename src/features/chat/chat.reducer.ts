import { newId } from "../../lib/id";
import { nowIso } from "../../lib/dates";
import type {
  ChatMessage,
  ChatQuestionMessage,
  ChatState,
  ChatRole,
  ChatPhotoUploadMessage,
  ChatReportPreviewMessage,
  ChatAssistantTextMessage,
  ChatUserTextMessage,
} from "./chat.types";
import type { Answer, FollowUpQuestion } from "../report/report.types";

const initialChatState: ChatState = {
  messages: [],
  draft: "",
  pendingPhotos: [],
  latestReportId: null,
};

export type ChatAction =
  | { type: "SET_DRAFT"; draft: string }
  | { type: "STAGE_PHOTOS"; uris: string[] }
  | { type: "CLEAR_PENDING_PHOTOS" }
  | { type: "ADD_USER_TEXT"; text: string }
  | { type: "ADD_USER_PHOTOS"; imageUris: string[] }
  | {
      type: "ADD_ASSISTANT_TEXT";
      textKey: string;
      textOptions?: Record<string, string | number>;
    }
  | { type: "ADD_REPORT_PREVIEW"; reportId: string }
  | { type: "ADD_QUESTION"; question: FollowUpQuestion }
  | { type: "ANSWER_QUESTION"; answer: Answer }
  | { type: "REMOVE_STAGED_PHOTO"; uri: string }
  | { type: "RESET_FOR_NEW_ANALYSIS" };

function baseMessage(role: ChatRole): Pick<ChatMessage, "id" | "createdAt" | "role"> {
  return { id: newId(), role, createdAt: nowIso() };
}

function mapMarkQuestionAnswered(
  messages: ChatMessage[],
  questionId: string,
): ChatMessage[] {
  return messages.map((m) => {
    if (m.kind !== "question" || m.question.id !== questionId) {
      return m;
    }
    const marked: FollowUpQuestion = { ...m.question, answered: true };
    const next: ChatQuestionMessage = { ...m, question: marked };
    return next;
  });
}

function answerText(answer: Answer): string {
  if (answer.text !== undefined && answer.text.length > 0) {
    return answer.text;
  }
  return "";
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "SET_DRAFT":
      return { ...state, draft: action.draft };
    case "STAGE_PHOTOS":
      return {
        ...state,
        pendingPhotos: [...state.pendingPhotos, ...action.uris],
      };
    case "CLEAR_PENDING_PHOTOS":
      return { ...state, pendingPhotos: [] };
    case "ADD_USER_TEXT": {
      const textMsg: ChatUserTextMessage = {
        ...baseMessage("user"),
        role: "user",
        kind: "text",
        text: action.text,
      };
      return { ...state, messages: [...state.messages, textMsg] };
    }
    case "ADD_USER_PHOTOS": {
      const photoMsg: ChatPhotoUploadMessage = {
        ...baseMessage("user"),
        kind: "photo_upload",
        imageUris: action.imageUris,
      };
      return { ...state, messages: [...state.messages, photoMsg] };
    }
    case "ADD_ASSISTANT_TEXT": {
      const textMsg: ChatAssistantTextMessage = {
        ...baseMessage("assistant"),
        role: "assistant",
        kind: "text",
        textKey: action.textKey,
        ...(action.textOptions !== undefined ? { textOptions: action.textOptions } : {}),
      };
      return { ...state, messages: [...state.messages, textMsg] };
    }
    case "ADD_REPORT_PREVIEW": {
      const preview: ChatReportPreviewMessage = {
        ...baseMessage("assistant"),
        kind: "report_preview",
        reportId: action.reportId,
      };
      return {
        ...state,
        latestReportId: action.reportId,
        messages: [...state.messages, preview],
      };
    }
    case "ADD_QUESTION": {
      const qm: ChatQuestionMessage = {
        ...baseMessage("assistant"),
        kind: "question",
        question: action.question,
      };
      return { ...state, messages: [...state.messages, qm] };
    }
    case "ANSWER_QUESTION": {
      const markedMessages = mapMarkQuestionAnswered(
        state.messages,
        action.answer.questionId,
      );
      const replyText = answerText(action.answer);
      if (replyText.length === 0) {
        return { ...state, messages: markedMessages };
      }
      const reply: ChatUserTextMessage = {
        ...baseMessage("user"),
        role: "user",
        kind: "text",
        text: replyText,
      };
      return { ...state, messages: [...markedMessages, reply] };
    }
    case "REMOVE_STAGED_PHOTO":
      return {
        ...state,
        pendingPhotos: state.pendingPhotos.filter((u) => u !== action.uri),
      };
    case "RESET_FOR_NEW_ANALYSIS":
      return initialChatState;
  }
}

export function getInitialChatState(): ChatState {
  return initialChatState;
}
