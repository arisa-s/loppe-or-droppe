import {
  createContext,
  type Dispatch,
  type ReactNode,
  useContext,
  useMemo,
  useReducer,
} from "react";
import {
  getInitialReportState,
  reportReducer,
  type ReportAction,
  type ReportState,
} from "./report.reducer";
import type { ObjectReport } from "./report.types";

type ReportContextValue = {
  state: ReportState;
  dispatch: Dispatch<ReportAction>;
};

const ReportContext = createContext<ReportContextValue | null>(null);

export function ReportProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reportReducer, undefined, () =>
    getInitialReportState(),
  );

  const value = useMemo(() => ({ state, dispatch }), [state, dispatch]);

  return (
    <ReportContext.Provider value={value}>{children}</ReportContext.Provider>
  );
}

function useReportInternal(): ReportContextValue {
  const ctx = useContext(ReportContext);
  if (ctx === null) {
    throw new Error("useReport helpers must be used within ReportProvider");
  }
  return ctx;
}

export function useLatestReport(): ObjectReport | null {
  const { state } = useReportInternal();
  return state.current;
}

export function useReportById(id: string): ObjectReport | null {
  const { state } = useReportInternal();
  if (state.current?.id !== id) {
    return null;
  }
  return state.current;
}

export function useReportDispatch(): Dispatch<ReportAction> {
  return useReportInternal().dispatch;
}

export type { ReportAction };
