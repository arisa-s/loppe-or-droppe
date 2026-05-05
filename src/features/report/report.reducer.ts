import type { ObjectReport, UserDecision } from "../report/report.types";

export type ReportState = {
  current: ObjectReport | null;
};

export type ReportAction =
  | { type: "SET_REPORT"; report: ObjectReport }
  | { type: "SET_USER_DECISION"; decision: UserDecision | null }
  | { type: "RESET" };

const initialReportState: ReportState = {
  current: null,
};

export function reportReducer(
  state: ReportState,
  action: ReportAction,
): ReportState {
  switch (action.type) {
    case "SET_REPORT":
      return { current: action.report };
    case "SET_USER_DECISION":
      if (state.current === null) return state;
      if (action.decision === null) {
        const { userDecision: _userDecision, ...current } = state.current;
        return { current };
      }
      return {
        current: {
          ...state.current,
          userDecision: action.decision,
        },
      };
    case "RESET":
      return initialReportState;
  }
}

export function getInitialReportState(): ReportState {
  return initialReportState;
}
