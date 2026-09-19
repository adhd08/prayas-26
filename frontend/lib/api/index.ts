/**
 * Service layer.
 *
 * Five services cover everything the UI needs from a backend. Each one runs
 * against the bundled prototype engine while USE_MOCK_DATA is true, and each
 * has the HTTP path it will call written next to it so the handover is
 * mechanical.
 */

import { CITY_POPULATION, EXISTING_FACILITIES, NEIGHBOURHOODS } from "@/data/city";
import { DEFAULT_CONSTRAINTS, WHAT_IF_SCENARIOS } from "@/data/defaults";
import { SCENARIO_PRESETS } from "@/data/scenarios";
import { FACILITY_SPECS } from "@/data/facilityCatalog";
import { parseIntent, suggestionsFor } from "@/lib/assistant/intents";
import { generateMockResponse } from "@/lib/assistant/responder";
import { USE_MOCK_DATA } from "@/lib/config";
import { createRng, hashSeed } from "@/lib/rng";
import {
  computeMetrics,
  createFacility,
  heatField,
  wardNeed,
} from "@/lib/simulation/engine";
import { optimize, type OptimizeInput } from "@/lib/simulation/optimizer";
import { provenance, request, resolve } from "./client";
import type {
  AssistantContext,
  AssistantIntent,
  Constraint,
  Facility,
  HeatFieldResponse,
  MetricDelta,
  Neighbourhood,
  NeedType,
  OptimizationOutcome,
  Scenario,
  SimulationMetrics,
  WhatIfId,
  WhatIfOutcome,
  WhatIfScenario,
} from "@/types";

/* --- City ----------------------------------------------------------------- */

export interface CityPayload {
  id: string;
  name: string;
  population: number;
  neighbourhoods: Neighbourhood[];
  facilities: Facility[];
  constraints: Constraint[];
}

export const cityApi = {
  /** GET /cities/:id */
  async load(cityId: string): Promise<CityPayload> {
    if (!USE_MOCK_DATA) return request<CityPayload>(`/cities/${cityId}`);
    return resolve({
      id: cityId,
      name: "Central Kolkata",
      population: CITY_POPULATION,
      neighbourhoods: NEIGHBOURHOODS,
      facilities: EXISTING_FACILITIES,
      constraints: DEFAULT_CONSTRAINTS,
    });
  },
};

/* --- Simulation ------------------------------------------------------------ */

export const simulationApi = {
  /** POST /simulate/metrics */
  async metrics(facilities: Facility[]): Promise<SimulationMetrics> {
    if (!USE_MOCK_DATA)
      return request<SimulationMetrics>("/simulate/metrics", {
        method: "POST",
        body: JSON.stringify({ facilities }),
      });
    return resolve(computeMetrics(facilities));
  },

  /** POST /simulate/heat */
  async heat(
    need: NeedType,
    facilities: Facility[],
  ): Promise<HeatFieldResponse> {
    if (!USE_MOCK_DATA)
      return request<HeatFieldResponse>("/simulate/heat", {
        method: "POST",
        body: JSON.stringify({ need, facilities }),
      });
    return resolve({ need, points: heatField(need, facilities), provenance });
  },

  /** POST /simulate/what-if */
  async whatIf(
    id: WhatIfId,
    facilities: Facility[],
    budget: number,
  ): Promise<WhatIfOutcome> {
    if (!USE_MOCK_DATA)
      return request<WhatIfOutcome>("/simulate/what-if", {
        method: "POST",
        body: JSON.stringify({ id, facilities, budget }),
      });
    return resolve(runWhatIf(id, facilities, budget), 320);
  },

  scenarios(): WhatIfScenario[] {
    return WHAT_IF_SCENARIOS;
  },
};

function delta(
  key: MetricDelta["key"],
  label: string,
  before: SimulationMetrics,
  after: SimulationMetrics,
  unit: MetricDelta["unit"],
  invert = false,
): MetricDelta {
  return { key, label, before: before[key], after: after[key], unit, invert };
}

/**
 * Prototype what-if rules. Each one perturbs the facility set or the demand
 * side and re-runs the same engine, so the numbers stay comparable.
 */
function runWhatIf(
  id: WhatIfId,
  facilities: Facility[],
  budget: number,
): WhatIfOutcome {
  const before = computeMetrics(facilities);
  let after = before;
  let note = "";

  switch (id) {
    case "populationGrowth": {
      // Growth is modelled as extra housing spread across the densest wards.
      const rng = createRng(hashSeed("what-if-growth"));
      const extra = [...NEIGHBOURHOODS]
        .sort((a, b) => b.population - a.population)
        .slice(0, 8)
        .map((ward) =>
          createFacility(
            "housing",
            {
              lat: ward.centroid.lat + rng.range(-0.002, 0.002),
              lng: ward.centroid.lng + rng.range(-0.002, 0.002),
            },
            "proposed",
          ),
        )
        .map((f) => ({ ...f, capacity: f.capacity * 9, estimatedCost: 0 }));
      after = computeMetrics([...facilities, ...extra]);
      note =
        "Residents were added to the eight densest wards without any matching services, which is what unmanaged growth looks like in the model.";
      break;
    }
    case "budgetCut": {
      const cap = budget * 0.85;
      const kept: Facility[] = [];
      let spend = 0;
      for (const f of facilities) {
        if (f.origin === "existing") {
          kept.push(f);
          continue;
        }
        if (spend + f.estimatedCost <= cap) {
          kept.push(f);
          spend += f.estimatedCost;
        }
      }
      after = computeMetrics(kept);
      note = `A 15% cut leaves ₹${Math.round(cap)} Cr. Sites were dropped in plan order, not by value, so the real loss depends on which ones a planner protects.`;
      break;
    }
    case "hospitalClosure": {
      const hospitals = facilities.filter((f) => f.type === "hospital");
      const largest = hospitals.sort((a, b) => b.capacity - a.capacity)[0];
      after = computeMetrics(
        largest ? facilities.filter((f) => f.id !== largest.id) : facilities,
      );
      note = largest
        ? `${largest.name} was removed and access re-scored across every ward.`
        : "No hospital exists in the current plan.";
      break;
    }
    case "newMetroLine": {
      const corridor = NEIGHBOURHOODS.filter((n) =>
        ["ward-18", "ward-22", "ward-26"].includes(n.id),
      );
      const stations = corridor.map((ward) =>
        createFacility("transit", ward.centroid, "proposed"),
      );
      after = computeMetrics([...facilities, ...stations]);
      note =
        "Three interchange stations were added along the eastern corridor at an estimated ₹138 Cr.";
      break;
    }
    case "schoolCapacity": {
      const scaled = facilities.map((f) =>
        f.type === "school"
          ? {
              ...f,
              serviceRadiusKm: f.serviceRadiusKm * 1.25,
              capacity: Math.round(f.capacity * 1.25),
            }
          : f,
      );
      after = computeMetrics(scaled);
      note =
        "Existing schools absorb 25% more students, modelled as a wider effective catchment rather than new buildings.";
      break;
    }
  }

  return {
    id,
    label: WHAT_IF_SCENARIOS.find((s) => s.id === id)?.label ?? id,
    deltas: [
      delta("healthcareCoverage", "Healthcare access", before, after, "percent"),
      delta("educationCoverage", "Education access", before, after, "percent"),
      delta("transitCoverage", "Transit access", before, after, "percent"),
      delta(
        "underservedPopulation",
        "Underserved residents",
        before,
        after,
        "people",
        true,
      ),
      delta(
        "averageTravelMinutes",
        "Average trip",
        before,
        after,
        "minutes",
        true,
      ),
    ],
    note,
  };
}

/* --- Optimization ---------------------------------------------------------- */

export const optimizationApi = {
  /** POST /optimize */
  async run(input: OptimizeInput): Promise<OptimizationOutcome> {
    if (!USE_MOCK_DATA)
      return request<OptimizationOutcome>("/optimize", {
        method: "POST",
        body: JSON.stringify(input),
      });
    return resolve(optimize(input));
  },

  /** Highest-scoring site for a single facility, used by assistant actions. */
  async bestSite(
    type: Facility["type"],
    input: OptimizeInput,
  ): Promise<Facility | null> {
    const outcome = await optimizationApi.run({
      ...input,
      resources: {
        hospital: 0,
        school: 0,
        park: 0,
        transit: 0,
        housing: 0,
        emergency: 0,
        [type]: 1,
      },
      budget: Math.max(input.budget, FACILITY_SPECS[type].cost),
    });
    return outcome.ok ? (outcome.result.facilities[0] ?? null) : null;
  },
};

/* --- Assistant -------------------------------------------------------------- */

export interface AssistantAnswer {
  text: string;
  evidence?: { label: string; value: string }[];
  intent: AssistantIntent;
  provenance: typeof provenance;
}

export const assistantApi = {
  /** POST /assistant/message */
  async sendMessage(
    text: string,
    context: AssistantContext,
  ): Promise<AssistantAnswer> {
    const intent = parseIntent(text, context);
    if (!USE_MOCK_DATA) {
      const answer = await request<Omit<AssistantAnswer, "intent">>(
        "/assistant/message",
        { method: "POST", body: JSON.stringify({ text, context }) },
      );
      return { ...answer, intent };
    }
    const reply = generateMockResponse(text, intent, context);
    // A short pause reads as thinking rather than as a canned response.
    return resolve({ ...reply, intent, provenance }, 420);
  },

  parseIntent,
  suggestionsFor,
};

/* --- Scenarios --------------------------------------------------------------- */

const STORAGE_KEY = "sylvida.scenarios.v1";

function readStored(): Scenario[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Scenario[]) : [];
  } catch {
    return [];
  }
}

function writeStored(scenarios: Scenario[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(scenarios));
  } catch {
    // Storage can be unavailable in private windows. Scenarios stay in memory.
  }
}

export const scenarioApi = {
  presets: SCENARIO_PRESETS,

  /** GET /scenarios */
  async list(): Promise<Scenario[]> {
    if (!USE_MOCK_DATA) return request<Scenario[]>("/scenarios");
    return resolve(readStored());
  },

  /** POST /scenarios */
  async save(scenario: Scenario): Promise<Scenario[]> {
    if (!USE_MOCK_DATA)
      return request<Scenario[]>("/scenarios", {
        method: "POST",
        body: JSON.stringify(scenario),
      });
    const next = [scenario, ...readStored()].slice(0, 12);
    writeStored(next);
    return resolve(next);
  },

  /** DELETE /scenarios/:id */
  async remove(id: string): Promise<Scenario[]> {
    if (!USE_MOCK_DATA)
      return request<Scenario[]>(`/scenarios/${id}`, { method: "DELETE" });
    const next = readStored().filter((s) => s.id !== id);
    writeStored(next);
    return resolve(next);
  },
};

export { wardNeed };
