/** Starting values for the planning workspace. */

import type {
  Constraint,
  PlanningPriorities,
  PriorityId,
  ResourceBudget,
  WhatIfScenario,
} from "@/types";

export const DEFAULT_BUDGET = 1000;
export const BUDGET_BOUNDS = { min: 200, max: 2000, step: 20 };

export const DEFAULT_RESOURCES: ResourceBudget = {
  hospital: 2,
  school: 4,
  park: 3,
  transit: 4,
  housing: 20,
  emergency: 0,
};

export const DEFAULT_PRIORITIES: PlanningPriorities = {
  healthcare: 70,
  education: 60,
  transit: 60,
  housing: 55,
  greenspace: 50,
  coverage: 65,
  environment: 55,
  cost: 60,
};

export const PRIORITY_LABELS: Record<PriorityId, string> = {
  healthcare: "Healthcare",
  education: "Education",
  transit: "Transit",
  housing: "Housing",
  greenspace: "Green space",
  coverage: "Population coverage",
  environment: "Environmental impact",
  cost: "Cost efficiency",
};

export const PRIORITY_ORDER: PriorityId[] = [
  "healthcare",
  "education",
  "transit",
  "housing",
  "greenspace",
  "coverage",
  "environment",
  "cost",
];

/**
 * Real-world constraints. Each one narrows the candidate set; switching one
 * off is visible in the decision trace, which is the point.
 */
export const DEFAULT_CONSTRAINTS: Constraint[] = [
  {
    id: "maxTravel",
    label: "Maximum travel distance",
    description: "Residents should reach the nearest facility within this distance.",
    enabled: true,
    value: 5,
    unit: "km",
    min: 1,
    max: 12,
    step: 0.5,
  },
  {
    id: "minSpacing",
    label: "Minimum facility spacing",
    description: "Keeps new sites from duplicating provision that already exists.",
    enabled: true,
    value: 1.2,
    unit: "km",
    min: 0,
    max: 5,
    step: 0.1,
  },
  {
    id: "landAvailability",
    label: "Land availability",
    description: "Excludes wards where too little buildable land remains.",
    enabled: true,
    mode: "Required",
    modes: ["Required", "Preferred"],
  },
  {
    id: "zoning",
    label: "Zoning",
    description: "Holds sites to the use classes permitted in each ward.",
    enabled: true,
    mode: "Enforce",
    modes: ["Enforce", "Advisory"],
  },
  {
    id: "floodRisk",
    label: "Flood risk",
    description: "Excludes wards where more than 55% of area floods.",
    enabled: true,
    mode: "Avoid",
    modes: ["Avoid", "Allow"],
  },
  {
    id: "protectedLand",
    label: "Protected and heritage land",
    description: "Excludes conservation envelopes from construction.",
    enabled: true,
    mode: "Avoid",
    modes: ["Avoid", "Allow"],
  },
  {
    id: "existingInfrastructure",
    label: "Existing infrastructure",
    description: "Counts current provision toward coverage instead of ignoring it.",
    enabled: true,
    mode: "Preserve",
    modes: ["Preserve", "Ignore"],
  },
  {
    id: "populationGrowth",
    label: "Projected population growth",
    description: "Sizes provision for the population expected at horizon year.",
    enabled: false,
    value: 20,
    unit: "%",
    min: 0,
    max: 60,
    step: 5,
  },
];

export const WHAT_IF_SCENARIOS: WhatIfScenario[] = [
  {
    id: "populationGrowth",
    label: "Population increases by 20%",
    description: "Every ward grows, so demand rises against unchanged provision.",
  },
  {
    id: "budgetCut",
    label: "Budget falls by 15%",
    description: "The lowest-value sites in the current plan drop out.",
  },
  {
    id: "hospitalClosure",
    label: "The largest hospital closes",
    description: "Removes the highest-coverage hospital and re-scores access.",
  },
  {
    id: "newMetroLine",
    label: "A new metro line opens",
    description: "Adds three interchange stations along the eastern corridor.",
  },
  {
    id: "schoolCapacity",
    label: "School capacity rises 25%",
    description: "Existing schools absorb more students without new buildings.",
  },
];

/** Four-step first-run orientation. Never shown twice. */
export const ONBOARDING_STEPS = [
  {
    title: "Choose a need",
    body: "Pick a layer in City Needs to see where the city is falling short.",
  },
  {
    title: "Explore the map",
    body: "Hover a ward for a summary, click it to inspect access and population.",
  },
  {
    title: "Place infrastructure",
    body: "Drag a facility from Add Infrastructure onto the map and watch the field respond.",
  },
  {
    title: "Optimize your city",
    body: "Switch to Optimize, set resources and priorities, and compare the result with your own plan.",
  },
];
