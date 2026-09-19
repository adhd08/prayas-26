/**
 * Domain model for Sylvida.
 *
 * These types are the contract between the UI and the service layer in
 * lib/api. The mock services and a future HTTP backend must both satisfy them,
 * so components never need to know which one is answering.
 */

export type NeedType =
  | "healthcare"
  | "education"
  | "transit"
  | "housing"
  | "greenspace"
  | "emergency";

export type FacilityType =
  | "hospital"
  | "school"
  | "housing"
  | "park"
  | "transit"
  | "emergency";

/** Where a facility came from. Drives marker styling and planner agency. */
export type FacilityOrigin = "existing" | "proposed" | "user";

export type ProvenanceKind = "demo" | "backend";

export interface LatLng {
  lat: number;
  lng: number;
}

/** A closed ring of coordinates, first point not repeated at the end. */
export type Ring = LatLng[];

export interface Neighbourhood {
  id: string;
  name: string;
  /** Administrative label shown next to the name. */
  district: string;
  population: number;
  ring: Ring;
  centroid: LatLng;
  /** 0-100 per need. Higher means less well served. */
  need: Record<NeedType, number>;
  /** 0-100. Share of residents in higher-risk groups. */
  vulnerability: number;
  /** 0-1. Fraction of ward area inside the modelled flood envelope. */
  floodRisk: number;
  /** 0-1. Share of land that is buildable under current zoning. */
  landSuitability: number;
  /** True when the ward sits inside a protected or heritage envelope. */
  isProtected: boolean;
}

export interface Facility {
  id: string;
  type: FacilityType;
  name: string;
  origin: FacilityOrigin;
  position: LatLng;
  /** Kilometres. Straight-line service area used by the prototype engine. */
  serviceRadiusKm: number;
  /** Residents the facility is sized for. */
  capacity: number;
  /** Crore INR. */
  estimatedCost: number;
  /** Set on optimizer output so the inspector can explain the choice. */
  rationale?: FacilityRationale;
  /** Planner decision on an optimizer suggestion. */
  review?: "accepted" | "rejected";
}

export interface FacilityRationale {
  headline: string;
  evidence: { label: string; value: string }[];
  trace: string[];
}

export type ConstraintId =
  | "maxTravel"
  | "minSpacing"
  | "landAvailability"
  | "zoning"
  | "floodRisk"
  | "protectedLand"
  | "existingInfrastructure"
  | "populationGrowth";

export interface Constraint {
  id: ConstraintId;
  label: string;
  /** Short statement of what the constraint does to the search. */
  description: string;
  enabled: boolean;
  /** Numeric constraints carry a value plus its unit and bounds. */
  value?: number;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  /** Non-numeric constraints carry a mode instead. */
  mode?: string;
  modes?: string[];
}

export type PriorityId =
  | "healthcare"
  | "education"
  | "transit"
  | "housing"
  | "greenspace"
  | "coverage"
  | "environment"
  | "cost";

export type PlanningPriorities = Record<PriorityId, number>;

export type ResourceBudget = Record<FacilityType, number>;

export interface SimulationMetrics {
  population: number;
  healthcareCoverage: number;
  educationCoverage: number;
  transitCoverage: number;
  greenspaceCoverage: number;
  emergencyCoverage: number;
  housingAdequacy: number;
  underservedPopulation: number;
  averageTravelMinutes: number;
  /** Crore INR committed by the current facility set. */
  committedCost: number;
  landConsumedKm2: number;
  protectedLandPreserved: number;
}

export type MetricUnit = "percent" | "people" | "minutes" | "crore" | "km2";

export interface MetricDelta {
  key: keyof SimulationMetrics;
  label: string;
  before: number;
  after: number;
  unit: MetricUnit;
  /** True when a rise in the number is the worse outcome. */
  invert?: boolean;
}

export interface HeatPoint {
  lat: number;
  lng: number;
  /** 0-1 normalised need. */
  intensity: number;
}

export interface HeatFieldResponse {
  need: NeedType;
  points: HeatPoint[];
  provenance: ProvenanceKind;
}

export interface OptimizationCandidate {
  id: string;
  type: FacilityType;
  position: LatLng;
  score: number;
  /** Set when the candidate was filtered out, with the reason. */
  rejectedBy?: string;
  /** Iteration in which the candidate was evaluated. */
  iteration: number;
}

export type OptimizationPhase =
  | "idle"
  | "running"
  | "complete"
  | "infeasible";

export interface OptimizationStep {
  id: string;
  label: string;
  /** 0-1 point on the run timeline at which the step completes. */
  at: number;
}

export interface Tradeoff {
  label: string;
  /** Signed change, interpreted with `unit`. */
  change: number;
  unit: "percentagePoints" | "crore" | "people" | "km2";
  note: string;
}

export interface OptimizationResult {
  id: string;
  facilities: Facility[];
  candidates: OptimizationCandidate[];
  metricsBefore: SimulationMetrics;
  metricsAfter: SimulationMetrics;
  deltas: MetricDelta[];
  tradeoffs: Tradeoff[];
  /** Crore INR. */
  cost: number;
  budget: number;
  iterations: number;
  candidatesEvaluated: number;
  assumptions: string[];
  provenance: ProvenanceKind;
}

export interface InfeasibleResult {
  reason: string;
  suggestions: string[];
}

export type OptimizationOutcome =
  | { ok: true; result: OptimizationResult }
  | { ok: false; infeasible: InfeasibleResult };

export interface Scenario {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  budget: number;
  priorities: PlanningPriorities;
  resources: ResourceBudget;
  constraints: Constraint[];
  facilities: Facility[];
  metrics: SimulationMetrics;
  provenance: ProvenanceKind;
}

export type WhatIfId =
  | "populationGrowth"
  | "budgetCut"
  | "hospitalClosure"
  | "newMetroLine"
  | "schoolCapacity";

export interface WhatIfScenario {
  id: WhatIfId;
  label: string;
  description: string;
}

export interface WhatIfOutcome {
  id: WhatIfId;
  label: string;
  deltas: MetricDelta[];
  note: string;
}

/* --- Assistant ----------------------------------------------------------- */

export type AssistantIntentType =
  | "QUESTION"
  | "SELECT_LAYER"
  | "FOCUS_LOCATION"
  | "ADD_FACILITY"
  | "MOVE_FACILITY"
  | "OPTIMIZE"
  | "COMPARE"
  | "SET_CONSTRAINT"
  | "SET_BUDGET"
  | "SET_PRIORITY";

export interface AssistantIntent {
  type: AssistantIntentType;
  /** True when acting on the intent changes the plan. */
  mutating: boolean;
  payload: {
    facilityType?: FacilityType;
    facilityId?: string;
    neighbourhoodId?: string;
    need?: NeedType;
    budget?: number;
    priority?: PriorityId;
    priorityValue?: number;
  };
  /** Human-readable restatement of what the assistant understood. */
  summary: string;
}

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: number;
  /** Structured evidence rendered under the message body. */
  evidence?: { label: string; value: string }[];
  /** A mutating intent awaiting confirmation. */
  pendingIntent?: AssistantIntent;
  provenance?: ProvenanceKind;
}

export interface AssistantContext {
  mode: PlanningMode;
  need: NeedType;
  neighbourhood?: Neighbourhood;
  facility?: Facility;
  facilities: Facility[];
  metrics: SimulationMetrics;
  budget: number;
  priorities: PlanningPriorities;
  result?: OptimizationResult;
}

export type PlanningMode = "plan" | "optimize";

/* --- Planning language --------------------------------------------------- */

export interface ParsedPlanningGoal {
  /** Absolute 0-100 priority values the phrase asked for. */
  priorities: Partial<PlanningPriorities>;
  budget?: number;
  constraints: { id: ConstraintId; value?: number; enabled?: boolean }[];
  /** Restatement shown back to the planner. */
  summary: string;
  /** Fragments the parser could not map to anything. */
  unrecognised: string[];
}

/* --- Landing story ------------------------------------------------------- */

export type StoryStageId =
  | "city"
  | "need"
  | "resources"
  | "intervention"
  | "ripple"
  | "setup"
  | "process"
  | "result"
  | "enter";

export interface StoryStage {
  id: StoryStageId;
  /** Scroll window within the pinned section, 0-1. */
  from: number;
  to: number;
  eyebrow?: string;
  headline: string;
  lines: string[];
  /**
   * Optional still that replaces the generated scene when the file exists.
   * See public/story/README.md.
   */
  image?: string;
}
