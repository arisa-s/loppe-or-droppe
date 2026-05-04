import { nowIso } from "../../lib/dates";
import {
  buildFollowUpQuestions,
  buildMockAnalysis,
  buildMockDecision,
  markQuestionAnswered,
} from "./report.mockData";
import type { Answer, ObjectReport, UserContext } from "./report.types";

function mergeUserContext(
  current: UserContext,
  patch: Partial<UserContext> | undefined,
): UserContext {
  if (patch === undefined) {
    return { ...current };
  }

  const next: UserContext = { ...current };
  if (patch.buyingCountry !== undefined) {
    next.buyingCountry = patch.buyingCountry;
  }
  if (patch.homeCountry !== undefined) {
    next.homeCountry = patch.homeCountry;
  }
  if (patch.sellerPrice !== undefined) {
    next.sellerPrice = patch.sellerPrice;
  }
  if (patch.sellerCurrency !== undefined) {
    next.sellerCurrency = patch.sellerCurrency;
  }
  if (patch.purpose !== undefined) {
    next.purpose = patch.purpose;
  }
  return next;
}

function buildUpdatedReport(input: {
  report: ObjectReport;
  photos: string[];
  userContext: UserContext;
  followUpQuestions: ObjectReport["followUpQuestions"];
}): ObjectReport {
  const updatedAt = nowIso();

  return {
    ...input.report,
    status: "updated",
    photos: [...input.photos],
    userContext: { ...input.userContext },
    analysis: buildMockAnalysis(input.photos),
    decision: buildMockDecision({
      photos: input.photos,
      userContext: input.userContext,
    }),
    followUpQuestions: buildFollowUpQuestions({
      photos: input.photos,
      userContext: input.userContext,
      previousQuestions: input.followUpQuestions,
    }),
    version: input.report.version + 1,
    updatedAt,
  };
}

export async function applyAnswer(
  report: ObjectReport,
  answer: Answer,
): Promise<ObjectReport> {
  const answerPhotos = answer.imageUris ?? [];
  const photos = [...report.photos, ...answerPhotos];
  const userContext = mergeUserContext(report.userContext, answer.contextPatch);
  const followUpQuestions = markQuestionAnswered(
    report.followUpQuestions,
    answer.questionId,
  );

  return buildUpdatedReport({
    report,
    photos,
    userContext,
    followUpQuestions,
  });
}

export async function applyPhotos(
  report: ObjectReport,
  newPhotos: string[],
): Promise<ObjectReport> {
  const photos = [...report.photos, ...newPhotos];
  const followUpQuestions = report.followUpQuestions.map((question) => ({ ...question }));

  return buildUpdatedReport({
    report,
    photos,
    userContext: { ...report.userContext },
    followUpQuestions,
  });
}
