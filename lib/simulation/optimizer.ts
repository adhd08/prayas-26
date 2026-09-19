/**
 * Prototype siting optimizer.
 *
 * A greedy marginal-gain search over a generated candidate set. Facility
 * siting of this shape has diminishing returns, so each pick takes the
 * candidate with the highest weighted benefit per crore that still satisfies
 * the active constraints and the remaining budget.
 *
 * It is deterministic on purpose: the same inputs return the same plan every
 * time, which is what a live demo needs. It reports a best-found
 * configuration, never an optimal one, because greedy search does not prove
 * optimality and the inputs are demo data.
 *
 * The backend replaces this module through optimizationApi without the UI
 * changing: the OptimizationResult shape is the contract.
 */

import { NEIGHBOURHOODS } from "@/data/city";
import { FACILITY_SPECS, NEED_SPECS } from "@/data/facilityCatalog";
import { clamp, distanceKm } from "@/lib/geo";
import { createRng, hashSeed } from "@/lib/rng";
import {
  checkPlacement,
  computeMetrics,
  createFacility,
  nearestFacility,
  needAtPoint,
  populationServed,
  wardNeed,
} from "@/lib/simulation/engine";
import type {
  Constraint,
  Facility,
  FacilityType,
  LatLng,
  MetricDelta,
  Neighbourhood,
  NeedType,
  OptimizationCandidate,
  OptimizationOutcome,
  PlanningPriorities,
  ResourceBudget,
  SimulationMetrics,
  Tradeoff,
} from "@/types";

export interface OptimizeInput {
  facilities: Facility[];
  resources: ResourceBudget;
  budget: number;
  priorities: PlanningPriorities;
  constraints: Constraint[];
}

/** Six candidate sites per ward, spread inside the boundary. */
function candidateSites(ward: Neighbourhood): LatLng[] {
  const rng = createRng(hashSeed(`candidates-${ward.id}`));
  const sites: LatLng[] = [ward.centroid];
  for (let i = 0; i < 5; i++) {
    const t = rng.range(0.28, 0.62);
    const vertex = ward.ring[rng.int(0, ward.ring.length - 1)];
    sites.push({
      lat: ward.centroid.lat + (vertex.lat - ward.centroid.lat) * t,
      lng: ward.centroid.lng + (vertex.lng - ward.centroid.lng) * t,
    });
  }
  return sites;
}

const ALL_SITES: { ward: Neighbourhood; point: LatLng }[] =
  NEIGHBOURHOODS.flatMap((ward) =>
    candidateSites(ward).map((point) => ({ ward, point })),
  );

/**
 * Emergency services have no dedicated priority slider, so they inherit a
 * neutral weight rather than silently scoring zero.
 */
function priorityForNeed(
  priorities: PlanningPriorities,
  need: NeedType,
): number {
  if (need === "emergency") return 50;
  return priorities[need];
}

/**
 * Weighted benefit of putting `type` at `point`.
 *
 * Measured in relieved need-points per resident, so a small dense ward can
 * outrank a large well-served one. Equity weighting pushes the search toward
 * wards that are currently below the adequacy threshold.
 */
function marginalGain(
  point: LatLng,
  type: FacilityType,
  facilities: Facility[],
  priorities: PlanningPriorities,
): number {
  const spec = FACILITY_SPECS[type];
  const need = spec.primaryNeed;
  const probe: Facility = {
    id: "probe",
    type,
    name: "probe",
    origin: "proposed",
    position: point,
    serviceRadiusKm: spec.serviceRadiusKm,
    capacity: spec.capacity,
    estimatedCost: spec.cost,
  };
  const withProbe = [...facilities, probe];

  let gain = 0;
  for (const ward of NEIGHBOURHOODS) {
    const d = distanceKm(point, ward.centroid);
    if (d > spec.serviceRadiusKm + 1.5) continue;
    const before = needAtPoint(ward.centroid, ward, need, facilities);
    const after = needAtPoint(ward.centroid, ward, need, withProbe);
    if (after >= before) continue;
    // Equity weight: relief is worth more where need is already severe.
    const equity = 1 + (priorities.coverage / 100) * (before / 100) * 1.4;
    const vulnerability = 1 + (ward.vulnerability / 100) * 0.35;
    gain += (before - after) * ward.population * equity * vulnerability;
  }

  const priorityWeight = priorityForNeed(priorities, need) / 100;
  let score = (gain / 1_000_000) * priorityWeight;

  // Environmental priority discourages flood-exposed and low-suitability land.
  const ward = NEIGHBOURHOODS.find(
    (n) => distanceKm(n.centroid, point) < 2.5,
  );
  if (ward) {
    const env = priorities.environment / 100;
    score *= 1 - env * ward.floodRisk * 0.45;
    score *= 0.72 + ward.landSuitability * 0.28;
  }

  // Cost efficiency turns the score into benefit per crore.
  const costWeight = priorities.cost / 100;
  return score / Math.pow(spec.cost, 0.35 + costWeight * 0.45);
}

/** Named steps the progress panel walks through while the search runs. */
export const OPTIMIZATION_STEPS = [
  { id: "demand", label: "Analyse population distribution", at: 0.1 },
  { id: "unmet", label: "Calculate unmet demand", at: 0.22 },
  { id: "existing", label: "Evaluate existing infrastructure", at: 0.34 },
  { id: "zoning", label: "Apply zoning and land constraints", at: 0.48 },
  { id: "candidates", label: "Evaluate candidate locations", at: 0.7 },
  { id: "compare", label: "Compare configurations", at: 0.88 },
  { id: "finalise", label: "Finalise configuration", at: 1 },
] as const;

function buildTradeoffs(
  before: SimulationMetrics,
  after: SimulationMetrics,
  cost: number,
): Tradeoff[] {
  const pp = (b: number, a: number) => a - b;
  return [
    {
      label: "Healthcare access",
      change: pp(before.healthcareCoverage, after.healthcareCoverage),
      unit: "percentagePoints",
      note: "Coverage weighted by ward population.",
    },
    {
      label: "Education access",
      change: pp(before.educationCoverage, after.educationCoverage),
      unit: "percentagePoints",
      note: "Schools compete with hospitals for the same budget.",
    },
    {
      label: "Transit access",
      change: pp(before.transitCoverage, after.transitCoverage),
      unit: "percentagePoints",
      note: "Walk-shed coverage within 1.8 km of a stop.",
    },
    {
      label: "Green-space access",
      change: pp(before.greenspaceCoverage, after.greenspaceCoverage),
      unit: "percentagePoints",
      note: "New housing adds residents faster than parks add area.",
    },
    {
      label: "Land consumed",
      change: after.landConsumedKm2 - before.landConsumedKm2,
      unit: "km2",
      note: "Square kilometres committed to new sites.",
    },
    {
      label: "Capital committed",
      change: cost,
      unit: "crore",
      note: "Drawn against the configured budget.",
    },
  ];
}

function buildDeltas(
  before: SimulationMetrics,
  after: SimulationMetrics,
): MetricDelta[] {
  return [
    {
      key: "healthcareCoverage",
      label: "Healthcare access",
      before: before.healthcareCoverage,
      after: after.healthcareCoverage,
      unit: "percent",
    },
    {
      key: "educationCoverage",
      label: "Education access",
      before: before.educationCoverage,
      after: after.educationCoverage,
      unit: "percent",
    },
    {
      key: "transitCoverage",
      label: "Transit access",
      before: before.transitCoverage,
      after: after.transitCoverage,
      unit: "percent",
    },
    {
      key: "greenspaceCoverage",
      label: "Green-space access",
      before: before.greenspaceCoverage,
      after: after.greenspaceCoverage,
      unit: "percent",
    },
    {
      key: "underservedPopulation",
      label: "Underserved residents",
      before: before.underservedPopulation,
      after: after.underservedPopulation,
      unit: "people",
      invert: true,
    },
    {
      key: "averageTravelMinutes",
      label: "Average trip to a service",
      before: before.averageTravelMinutes,
      after: after.averageTravelMinutes,
      unit: "minutes",
      invert: true,
    },
  ];
}

/**
 * Runs the search. Synchronous and fast; the progress animation in the UI is
 * driven by a timeline, not by polling this function.
 */
export function optimize(input: OptimizeInput): OptimizationOutcome {
  const { resources, budget, priorities, constraints } = input;
  const baseline = input.facilities.filter((f) => f.origin === "existing");
  const metricsBefore = computeMetrics(baseline);

  const working: Facility[] = [...baseline];
  const chosen: Facility[] = [];
  const candidates: OptimizationCandidate[] = [];

  const remaining: ResourceBudget = { ...resources };
  let spend = 0;
  let iteration = 0;
  let evaluated = 0;
  const perTypeIndex: Partial<Record<FacilityType, number>> = {};

  const requestedTypes = (Object.keys(remaining) as FacilityType[]).filter(
    (t) => remaining[t] > 0,
  );

  if (requestedTypes.length === 0) {
    return {
      ok: false,
      infeasible: {
        reason: "No facilities were requested.",
        suggestions: [
          "Add at least one facility to the available resources.",
          "Load an example scenario to start from a working configuration.",
        ],
      },
    };
  }

  const cheapest = Math.min(
    ...requestedTypes.map((t) => FACILITY_SPECS[t].cost),
  );
  if (cheapest > budget) {
    return {
      ok: false,
      infeasible: {
        reason: `The budget of ₹${budget} Cr does not cover a single requested facility. The cheapest requested type costs ₹${cheapest} Cr.`,
        suggestions: [
          "Increase the budget.",
          "Request a cheaper mix of facilities.",
          "Reduce the number of hospitals, which carry the highest unit cost.",
        ],
      },
    };
  }

  let placedSomething = true;
  while (placedSomething) {
    placedSomething = false;
    iteration += 1;

    let best: {
      type: FacilityType;
      point: LatLng;
      ward: Neighbourhood;
      score: number;
    } | null = null;

    for (const type of requestedTypes) {
      if (remaining[type] <= 0) continue;
      const spec = FACILITY_SPECS[type];
      if (spend + spec.cost > budget) continue;

      for (const site of ALL_SITES) {
        const check = checkPlacement(site.point, type, working, constraints);
        evaluated += 1;
        if (!check.ok) {
          // Record the rejection once per site so the map can show it.
          if (candidates.length < 220) {
            candidates.push({
              id: `cand-${type}-${site.ward.id}-${candidates.length}`,
              type,
              position: site.point,
              score: 0,
              rejectedBy: check.title,
              iteration,
            });
          }
          continue;
        }
        const score = marginalGain(site.point, type, working, priorities);
        if (score <= 0) continue;
        if (candidates.length < 220) {
          candidates.push({
            id: `cand-${type}-${site.ward.id}-${candidates.length}`,
            type,
            position: site.point,
            score,
            iteration,
          });
        }
        if (!best || score > best.score) {
          best = { type, point: site.point, ward: site.ward, score };
        }
      }
    }

    if (!best) break;

    const spec = FACILITY_SPECS[best.type];
    perTypeIndex[best.type] = (perTypeIndex[best.type] ?? 0) + 1;
    const facility = createFacility(
      best.type,
      best.point,
      "proposed",
      perTypeIndex[best.type],
    );

    const needBefore = wardNeed(best.ward, spec.primaryNeed, working);
    working.push(facility);
    const needAfter = wardNeed(best.ward, spec.primaryNeed, working);
    const served = populationServed(facility, working);
    const nearestSame = nearestFacility(best.point, best.type, baseline);

    facility.rationale = {
      headline: `Highest projected ${NEED_SPECS[
        spec.primaryNeed
      ].label.toLowerCase()} relief per crore among the evaluated candidates in this iteration.`,
      evidence: [
        {
          label: `${best.ward.name} ${NEED_SPECS[spec.primaryNeed].label.toLowerCase()} need`,
          value: `${Math.round(needBefore)} → ${Math.round(needAfter)} / 100`,
        },
        {
          label: "Residents within the service area",
          value: Math.round(served).toLocaleString("en-IN"),
        },
        {
          label: `Nearest existing ${spec.label.toLowerCase()}`,
          value: nearestSame
            ? `${nearestSame.distanceKm.toFixed(1)} km`
            : "None in the study area",
        },
        {
          label: "Land suitability",
          value: `${Math.round(best.ward.landSuitability * 100)}%`,
        },
        {
          label: "Flood exposure",
          value: `${Math.round(best.ward.floodRisk * 100)}% of ward area`,
        },
      ],
      trace: [
        `Identified ${NEED_SPECS[spec.primaryNeed].label.toLowerCase()} demand above the adequacy threshold in ${best.ward.name}.`,
        `Weighted the gap by ward population and a vulnerability index of ${best.ward.vulnerability}/100.`,
        constraints.find((c) => c.id === "floodRisk")?.enabled
          ? "Excluded candidate sites inside the modelled flood envelope."
          : "Flood-risk exclusion was switched off for this run.",
        constraints.find((c) => c.id === "protectedLand")?.enabled
          ? "Excluded candidate sites on protected and heritage land."
          : "Protected-land exclusion was switched off for this run.",
        `Scored the remaining candidate sites on relieved need per crore at ₹${spec.cost} Cr per unit.`,
        `Selected this site in iteration ${iteration} and re-scored every remaining candidate against the updated coverage.`,
      ],
    };

    chosen.push(facility);
    remaining[best.type] -= 1;
    spend += spec.cost;
    placedSomething = true;
  }

  if (chosen.length === 0) {
    return {
      ok: false,
      infeasible: {
        reason:
          "Current budget and constraints leave no feasible site in the study area.",
        suggestions: [
          "Increase the budget so a higher-cost facility becomes affordable.",
          "Relax the minimum-spacing constraint.",
          "Allow construction on land currently excluded by the flood-risk rule.",
          "Reduce the number of requested facilities.",
        ],
      },
    };
  }

  const metricsAfter = computeMetrics(working);

  return {
    ok: true,
    result: {
      id: `run-${Date.now().toString(36)}`,
      facilities: chosen,
      candidates,
      metricsBefore,
      metricsAfter,
      deltas: buildDeltas(metricsBefore, metricsAfter),
      tradeoffs: buildTradeoffs(metricsBefore, metricsAfter, spend),
      cost: spend,
      budget,
      iterations: iteration,
      candidatesEvaluated: evaluated,
      assumptions: [
        "Service areas are straight-line radii, not road-network travel times.",
        "Need scores are synthetic prototype data, not measured survey data.",
        "Capital costs are flat per facility type and exclude operating cost.",
        "Population is held constant apart from residents added by new housing.",
        `Greedy marginal-gain search over ${ALL_SITES.length} candidate sites; a best-found configuration, not a proven optimum.`,
      ],
      provenance: "demo",
    },
  };
}

/** Removal probe, used by the assistant to answer "what if this closes?". */
export function facilityContribution(
  facility: Facility,
  facilities: Facility[],
): { included: SimulationMetrics; excluded: SimulationMetrics } {
  return {
    included: computeMetrics(facilities),
    excluded: computeMetrics(facilities.filter((f) => f.id !== facility.id)),
  };
}

export const clampPercent = (v: number) => clamp(v, 0, 100);
