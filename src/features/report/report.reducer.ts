import type { ObjectReport } from "../report/report.types";

export type ReportState = {
  current: ObjectReport | null;
};

export type ReportAction =
  | { type: "SET_REPORT"; report: ObjectReport }
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
    case "RESET":
      return initialReportState;
  }
}

export function getInitialReportState(): ReportState {
  return initialReportState;
}
