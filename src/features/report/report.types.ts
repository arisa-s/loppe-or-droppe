export type Confidence = "low" | "medium" | "high";
export type Purpose = "keep" | "gift" | "decorate" | "research" | "resell";
export type ExpectedAnswerType = "text" | "photo" | "number" | "choice";
export type Priority = "low" | "medium" | "high";

export type ReportStatus = "initial" | "updated";
export type ReportMode = "basic" | "seller";
export type Recommendation = "buy" | "negotiate" | "pass" | "research_more";

export type UserContext = {
  buyingCountry?: string;
  homeCountry?: string;
  sellerPrice?: number;
  sellerCurrency?: string;
  purpose?: Purpose;
};

export type EstimatedCreationPeriod = {
  label: string;
  startYear: number;
  endYear: number;
  confidence: Confidence;
  reasoning: string;
};

export type ObjectAnalysis = {
  objectName: string;
  shortDescription: string;
  estimatedCreationPeriod: EstimatedCreationPeriod;
  likelyCategory: string;
  likelyOrigin: string;
  likelyStyle: string;
  likelyMaterial: string;
  conditionObservations: string[];
  qualityChecklist: string[];
  missingPhotoChecklist: string[];
  travelCautions: string[];
  sellerQuestions: string[];
  confidence: Confidence;
};

export type BuyDecision = {
  recommendation: Recommendation;
  worthBringingHomeScore: number;
  suggestedMaxPrice: number;
  suggestedMaxPriceCurrency: string;
  reasons: string[];
  risks: string[];
};

export type FollowUpQuestion = {
  id: string;
  /** i18n key (resolved with `t()` in UI). */
  question: string;
  /** i18n key (resolved with `t()` in UI). */
  reason: string;
  expectedAnswerType: ExpectedAnswerType;
  priority: Priority;
  answered: boolean;
};

export type Answer = {
  questionId: string;
  text?: string;
  imageUris?: string[];
  contextPatch?: Partial<UserContext>;
};

export type ObjectReport = {
  id: string;
  status: ReportStatus;
  mode: ReportMode;
  photos: string[];
  userContext: UserContext;
  analysis: ObjectAnalysis;
  decision: BuyDecision;
  followUpQuestions: FollowUpQuestion[];
  version: number;
  createdAt: string;
  updatedAt: string;
};
