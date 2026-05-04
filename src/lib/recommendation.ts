import type { Recommendation } from "../features/report/report.types";

/** Thresholds match docs/report-schema.md (mock rule). */
export function recommendationFromScore(score: number): Recommendation {
  if (score >= 75) {
    return "buy";
  }
  if (score >= 55) {
    return "negotiate";
  }
  if (score >= 35) {
    return "research_more";
  }
  return "pass";
}

export function recommendationBadgeClasses(rec: Recommendation): {
  bg: string;
  border: string;
  text: string;
} {
  switch (rec) {
    case "buy":
      return { bg: "bg-green-100", border: "border-green-200", text: "text-green-700" };
    case "negotiate":
      return { bg: "bg-yellow-100", border: "border-yellow-200", text: "text-yellow-700" };
    case "research_more":
      return { bg: "bg-orange-100", border: "border-orange-200", text: "text-orange-700" };
    case "pass":
      return { bg: "bg-red-100", border: "border-red-200", text: "text-red-700" };
  }
}
