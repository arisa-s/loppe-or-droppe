import { nowIso } from "../../lib/dates";
import { newId } from "../../lib/id";
import {
  buildFollowUpQuestions,
  buildMockAnalysis,
  buildMockDecision,
} from "./report.mockData";
import type { ObjectReport, UserContext } from "./report.types";

type GenerateInitialInput = {
  photos: string[];
  userContext: UserContext;
};

export async function generateInitial(
  input: GenerateInitialInput,
): Promise<ObjectReport> {
  if (input.photos.length === 0) {
    throw new Error("At least one photo is required to generate a report.");
  }

  const photos = [...input.photos];
  const userContext = { ...input.userContext };
  const createdAt = nowIso();

  return {
    id: newId(),
    status: "initial",
    mode: "basic",
    photos,
    userContext,
    analysis: buildMockAnalysis(photos),
    decision: buildMockDecision({ photos, userContext }),
    followUpQuestions: buildFollowUpQuestions({ photos, userContext }),
    version: 1,
    createdAt,
    updatedAt: createdAt,
  };
}
