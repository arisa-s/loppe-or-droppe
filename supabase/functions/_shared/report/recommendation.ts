import type { Recommendation } from "./types.ts";

export function recommendationFromScore(score: number): Recommendation {
  if (score >= 75) return "buy";
  if (score >= 55) return "negotiate";
  if (score >= 35) return "research_more";
  return "pass";
}
