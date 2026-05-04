import {
  createContext,
  type Dispatch,
  type ReactNode,
  useContext,
  useMemo,
  useReducer,
} from "react";
import {
  chatReducer,
  type ChatAction,
  getInitialChatState,
} from "./chat.reducer";
import type { ChatState } from "./chat.types";

type ChatContextValue = {
  state: ChatState;
  dispatch: Dispatch<ChatAction>;
};

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(chatReducer, undefined, () =>
    getInitialChatState(),
  );

  const value = useMemo(() => ({ state, dispatch }), [state, dispatch]);

  return (
    <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
  );
}

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (ctx === null) {
    throw new Error("useChat must be used within ChatProvider");
  }
  return ctx;
}

export type { ChatAction };
