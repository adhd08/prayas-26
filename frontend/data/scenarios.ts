/**
 * Example scenarios.
 *
 * Demo configurations, not recommendations about how a real city should
 * allocate capital. They exist so the product opens on something meaningful
 * and so a live demo can be restored in one click.
 */

import type { PlanningPriorities, ResourceBudget } from "@/types";
import { DEFAULT_CONSTRAINTS } from "./defaults";

export interface ScenarioPreset {
  id: string;
  name: string;
  description: string;
  budget: number;
  resources: ResourceBudget;
  priorities: PlanningPriorities;
}

export const SCENARIO_PRESETS: ScenarioPreset[] = [
  {
    id: "healthcare-equity",
    name: "Healthcare Equity",
    description:
      "Weights healthcare and population coverage hardest, so the search chases the wards furthest from a hospital.",
    budget: 1000,
    resources: {
      hospital: 2,
      school: 4,
      park: 3,
      transit: 4,
      housing: 20,
      emergency: 0,
    },
    priorities: {
      healthcare: 90,
      education: 60,
      transit: 70,
      housing: 55,
      greenspace: 50,
      coverage: 85,
      environment: 55,
      cost: 70,
    },
  },
  {
    id: "balanced-city",
    name: "Balanced City",
    description:
      "Equal weight across every objective, for contrast against a targeted plan.",
    budget: 1000,
    resources: {
      hospital: 2,
      school: 4,
      park: 3,
      transit: 4,
      housing: 20,
      emergency: 0,
    },
    priorities: {
      healthcare: 70,
      education: 70,
      transit: 70,
      housing: 70,
      greenspace: 70,
      coverage: 70,
      environment: 70,
      cost: 70,
    },
  },
  {
    id: "transit-first",
    name: "Transit First",
    description:
      "Buys accessibility before buildings: more stations, fewer large sites.",
    budget: 1000,
    resources: {
      hospital: 1,
      school: 3,
      park: 3,
      transit: 8,
      housing: 16,
      emergency: 0,
    },
    priorities: {
      healthcare: 55,
      education: 55,
      transit: 95,
      housing: 60,
      greenspace: 55,
      coverage: 75,
      environment: 60,
      cost: 65,
    },
  },
  {
    id: "green-city",
    name: "Green City",
    description:
      "Prioritises open space and environmental exposure over raw coverage.",
    budget: 1000,
    resources: {
      hospital: 1,
      school: 3,
      park: 10,
      transit: 4,
      housing: 14,
      emergency: 0,
    },
    priorities: {
      healthcare: 55,
      education: 55,
      transit: 60,
      housing: 55,
      greenspace: 95,
      coverage: 65,
      environment: 90,
      cost: 55,
    },
  },
];

export const DEFAULT_PRESET = SCENARIO_PRESETS[0];

/** Constraints a preset starts from. Presets do not override them. */
export const PRESET_CONSTRAINTS = DEFAULT_CONSTRAINTS;
