export type Confidence = "low" | "medium" | "high";
export type Purpose = "keep" | "gift" | "decorate" | "research" | "resell";
export type ExpectedAnswerType =
  | "text"
  | "photo"
  | "number"
  | "choice"
  | "boolean";
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

export type ReportImprovementFieldOption = {
  value: string;
  labelKey: string;
};

export type FollowUpQuestion = {
  id: string;
  question: string;
  reason: string;
  expectedAnswerType: ExpectedAnswerType;
  priority: Priority;
  options?: ReportImprovementFieldOption[];
  answered: boolean;
  skipped: boolean;
};

export type ReportImprovementFieldType =
  | "text"
  | "number"
  | "choice"
  | "multi_choice"
  | "boolean"
  | "photo";

export type ReportImprovementFieldValue =
  | string
  | number
  | boolean
  | string[]
  | null;

export type ReportImprovementField = {
  id: string;
  key: string;
  labelKey: string;
  helpTextKey?: string;
  type: ReportImprovementFieldType;
  required: boolean;
  priority: Priority;
  options?: ReportImprovementFieldOption[];
  value?: ReportImprovementFieldValue;
};

export type ReportImprovementForm = {
  id: string;
  reportId: string;
  titleKey: string;
  descriptionKey: string;
  fields: ReportImprovementField[];
  estimatedSeconds: number;
  createdAt: string;
};

export type ReportImprovementSubmission = {
  reportId: string;
  values: Record<string, ReportImprovementFieldValue>;
  newPhotoUris?: string[];
};

export type Answer = {
  questionId: string;
  text?: string;
  imageUris?: string[];
  contextPatch?: Partial<UserContext>;
};

export type UserDecision = "buy" | "pass";

export type ObjectReport = {
  id: string;
  status: ReportStatus;
  mode: ReportMode;
  photos: string[];
  userContext: UserContext;
  analysis: ObjectAnalysis;
  decision: BuyDecision;
  followUpQuestions: FollowUpQuestion[];
  improvementForm?: ReportImprovementForm;
  userDecision?: UserDecision;
  version: number;
  createdAt: string;
  updatedAt: string;
};
