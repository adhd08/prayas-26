/**
 * Deterministic assistant responses.
 *
 * Every answer is assembled from the live simulation state, so the numbers in
 * the drawer always match the numbers on the map. The assistant states what it
 * is reading and never invents a confidence score: evidence is shown instead.
 *
 * assistantApi swaps this module for a backend call when one exists.
 */

import { NEIGHBOURHOODS, NEIGHBOURHOOD_BY_ID } from "@/data/city";
import { FACILITY_SPECS, NEED_ORDER, NEED_SPECS } from "@/data/facilityCatalog";
import {
  formatCost,
  formatKm,
  formatPeopleExact,
  formatPercent,
} from "@/lib/format";
import {
  accessFromNeed,
  nearestFacility,
  populationServed,
  wardNeed,
} from "@/lib/simulation/engine";
import { facilityContribution } from "@/lib/simulation/optimizer";
import type {
  AssistantContext,
  AssistantIntent,
  Neighbourhood,
  NeedType,
} from "@/types";

export interface AssistantReply {
  text: string;
  evidence?: { label: string; value: string }[];
}

const needLabel = (need: NeedType) => NEED_SPECS[need].label.toLowerCase();

/** The need a ward scores worst on, once current provision is counted. */
function worstNeed(
  ward: Neighbourhood,
  context: AssistantContext,
): { need: NeedType; score: number } {
  let best: { need: NeedType; score: number } = {
    need: "healthcare",
    score: -1,
  };
  for (const need of NEED_ORDER) {
    const score = wardNeed(ward, need, context.facilities);
    if (score > best.score) best = { need, score };
  }
  return best;
}

function explainWard(
  ward: Neighbourhood,
  context: AssistantContext,
): AssistantReply {
  const need = context.need;
  const score = wardNeed(ward, need, context.facilities);
  const servedBy = NEED_SPECS[need].servedBy;
  const near = nearestFacility(ward.centroid, servedBy, context.facilities);
  const worst = worstNeed(ward, context);

  const text =
    `${ward.name} scores ${Math.round(score)} out of 100 on ${needLabel(need)} need, ` +
    `which is ${formatPercent(accessFromNeed(score))} access for ${formatPeopleExact(
      ward.population,
    )} residents. ` +
    (near
      ? `The nearest ${FACILITY_SPECS[servedBy].label.toLowerCase()} is ${formatKm(
          near.distanceKm,
        )} away. `
      : `There is no ${FACILITY_SPECS[servedBy].label.toLowerCase()} inside the study area. `) +
    `Its sharpest gap is ${needLabel(worst.need)} at ${Math.round(worst.score)} out of 100. ` +
    `These are prototype figures from demo data.`;

  return {
    text,
    evidence: [
      { label: "Population", value: formatPeopleExact(ward.population) },
      {
        label: `${NEED_SPECS[need].label} need`,
        value: `${Math.round(score)} / 100`,
      },
      { label: "Vulnerability index", value: `${ward.vulnerability} / 100` },
      {
        label: "Land suitability",
        value: formatPercent(ward.landSuitability * 100),
      },
      {
        label: "Flood exposure",
        value: formatPercent(ward.floodRisk * 100),
      },
    ],
  };
}

function explainFacility(context: AssistantContext): AssistantReply | null {
  const facility = context.facility;
  if (!facility) return null;
  const served = populationServed(facility, context.facilities);

  if (facility.rationale) {
    return {
      text:
        `${facility.name} was selected because it offered the ${facility.rationale.headline.toLowerCase()} ` +
        `It covers about ${formatPeopleExact(served)} residents within its ${formatKm(
          facility.serviceRadiusKm,
        )} service area. Open the decision trace in the inspector for the full sequence.`,
      evidence: facility.rationale.evidence,
    };
  }

  return {
    text:
      `${facility.name} is a ${facility.origin === "existing" ? "facility already on the ground" : "site you placed"}. ` +
      `It covers about ${formatPeopleExact(served)} residents within ${formatKm(
        facility.serviceRadiusKm,
      )}, at an estimated ${formatCost(facility.estimatedCost)}.`,
    evidence: [
      { label: "Type", value: FACILITY_SPECS[facility.type].label },
      { label: "Service radius", value: formatKm(facility.serviceRadiusKm) },
      { label: "Residents covered", value: formatPeopleExact(served) },
      {
        label: "Estimated capital cost",
        value: facility.estimatedCost
          ? formatCost(facility.estimatedCost)
          : "Already built",
      },
    ],
  };
}

function explainRemoval(context: AssistantContext): AssistantReply | null {
  const facility = context.facility;
  if (!facility) return null;
  const { included, excluded } = facilityContribution(
    facility,
    context.facilities,
  );
  const need = FACILITY_SPECS[facility.type].primaryNeed;
  const key =
    need === "healthcare"
      ? "healthcareCoverage"
      : need === "education"
        ? "educationCoverage"
        : need === "transit"
          ? "transitCoverage"
          : need === "greenspace"
            ? "greenspaceCoverage"
            : "emergencyCoverage";

  const drop = included[key] - excluded[key];
  const underservedRise =
    excluded.underservedPopulation - included.underservedPopulation;

  return {
    text:
      `Removing ${facility.name} lowers city ${needLabel(need)} coverage by ` +
      `${drop.toFixed(1)} percentage points and moves about ` +
      `${formatPeopleExact(Math.max(0, underservedRise))} residents back below the adequacy threshold. ` +
      `It also frees ${formatCost(facility.estimatedCost)} of capital.`,
    evidence: [
      {
        label: `${NEED_SPECS[need].label} coverage with it`,
        value: formatPercent(included[key], 1),
      },
      {
        label: "Coverage without it",
        value: formatPercent(excluded[key], 1),
      },
      {
        label: "Underserved residents change",
        value: `+${formatPeopleExact(Math.max(0, underservedRise))}`,
      },
    ],
  };
}

function explainTradeoffs(context: AssistantContext): AssistantReply | null {
  const result = context.result;
  if (!result) return null;
  const gains = result.tradeoffs.filter(
    (t) => t.unit === "percentagePoints" && t.change > 0,
  );
  const losses = result.tradeoffs.filter(
    (t) => t.unit === "percentagePoints" && t.change < 0,
  );

  const text =
    `The configuration spends ${formatCost(result.cost)} of a ${formatCost(
      result.budget,
    )} budget. ` +
    (gains.length
      ? `It gains most on ${gains
          .slice()
          .sort((a, b) => b.change - a.change)
          .slice(0, 2)
          .map((g) => `${g.label.toLowerCase()} (+${g.change.toFixed(1)} pts)`)
          .join(" and ")}. `
      : "") +
    (losses.length
      ? `It gives ground on ${losses
          .map((l) => `${l.label.toLowerCase()} (${l.change.toFixed(1)} pts)`)
          .join(" and ")}, because new housing adds residents faster than the matching services arrive. `
      : "No objective moved backwards in this run, which usually means the budget was not the binding constraint. ") +
    `Every objective competes for the same budget, so these are choices rather than free wins.`;

  return {
    text,
    evidence: result.tradeoffs.slice(0, 4).map((t) => ({
      label: t.label,
      value:
        t.unit === "crore"
          ? formatCost(t.change)
          : t.unit === "km2"
            ? `${t.change.toFixed(2)} km²`
            : `${t.change > 0 ? "+" : ""}${t.change.toFixed(1)} pts`,
    })),
  };
}

function explainComparison(context: AssistantContext): AssistantReply | null {
  const result = context.result;
  if (!result) return null;
  return {
    text:
      `Against the baseline city, the generated configuration moves healthcare access from ` +
      `${formatPercent(result.metricsBefore.healthcareCoverage)} to ${formatPercent(
        result.metricsAfter.healthcareCoverage,
      )} and underserved residents from ${formatPeopleExact(
        result.metricsBefore.underservedPopulation,
      )} to ${formatPeopleExact(result.metricsAfter.underservedPopulation)}. ` +
      `Use the before and after slider on the map to see where the change lands.`,
    evidence: result.deltas.slice(0, 4).map((d) => ({
      label: d.label,
      value: `${Math.round(d.before)} → ${Math.round(d.after)}`,
    })),
  };
}

function cityOverview(context: AssistantContext): AssistantReply {
  const ranked = NEIGHBOURHOODS.map((n) => ({
    ward: n,
    score: wardNeed(n, context.need, context.facilities),
  })).sort((a, b) => b.score - a.score);
  const top = ranked[0];

  return {
    text:
      `Across the sixteen modelled wards, ${needLabel(context.need)} coverage is ` +
      `${formatPercent(
        context.need === "healthcare"
          ? context.metrics.healthcareCoverage
          : context.need === "education"
            ? context.metrics.educationCoverage
            : context.need === "transit"
              ? context.metrics.transitCoverage
              : context.need === "greenspace"
                ? context.metrics.greenspaceCoverage
                : context.metrics.emergencyCoverage,
      )}. ` +
      `${top.ward.name} carries the sharpest gap at ${Math.round(top.score)} out of 100 ` +
      `for ${formatPeopleExact(top.ward.population)} residents. ` +
      `Select a ward on the map and ask again for a ward-level answer.`,
    evidence: ranked.slice(0, 3).map((r) => ({
      label: r.ward.name,
      value: `${Math.round(r.score)} / 100`,
    })),
  };
}

/**
 * Builds the reply for a classified message. Action intents get a short
 * confirmation; the drawer runs them only after the planner agrees.
 */
export function generateMockResponse(
  raw: string,
  intent: AssistantIntent,
  context: AssistantContext,
): AssistantReply {
  const lower = raw.toLowerCase();

  switch (intent.type) {
    case "SELECT_LAYER":
      return {
        text: `Switched the map to ${needLabel(intent.payload.need ?? context.need)} need.`,
      };
    case "FOCUS_LOCATION": {
      const ward = intent.payload.neighbourhoodId
        ? NEIGHBOURHOOD_BY_ID.get(intent.payload.neighbourhoodId)
        : undefined;
      return {
        text: ward
          ? `Centred the map on ${ward.name}, ${ward.district}.`
          : "I could not find that ward in the study area.",
      };
    }
    case "COMPARE":
      return (
        explainComparison(context) ?? {
          text: "No generated configuration exists yet. Run the optimizer first, then ask again.",
        }
      );
    case "SET_BUDGET":
      return {
        text: `This changes the planning objective. Confirm and I will set the budget to ${formatCost(
          intent.payload.budget ?? context.budget,
        )} and leave the rest of the configuration untouched.`,
      };
    case "OPTIMIZE":
      return {
        text: intent.payload.need
          ? `This will run the search with ${needLabel(intent.payload.need)} weighted to 90%. Confirm to continue.`
          : "This will run the search with the current resources, budget and constraints. Confirm to continue.",
      };
    case "ADD_FACILITY":
      return {
        text: `This adds infrastructure to the plan. Confirm and I will place a ${intent.payload.facilityType} at the highest-scoring available site, which you can then move or remove.`,
      };
    case "MOVE_FACILITY":
      return {
        text: "This moves a facility already in the plan. Confirm and I will relocate it to the highest-scoring remaining site.",
      };
    case "QUESTION":
    default:
      break;
  }

  if (/\bremov|delete|close|shut\b/.test(lower)) {
    const reply = explainRemoval(context);
    if (reply) return reply;
    return {
      text: "Select a facility on the map and ask again, and I will work out what its removal costs.",
    };
  }

  if (/\bwhy\b.*\b(here|place|placed|site|choose|chose|selected)\b/.test(lower)) {
    const reply = explainFacility(context);
    if (reply) return reply;
    return {
      text: "Select a facility on the map and I will explain the evidence behind its location.",
    };
  }

  if (/\btrade.?off|compromise|give up|cost of\b/.test(lower)) {
    return (
      explainTradeoffs(context) ?? {
        text: "Run the optimizer and I will lay out which objectives gained and which gave ground.",
      }
    );
  }

  if (/\bunderserved|why|gap|help|most\b/.test(lower) && context.neighbourhood) {
    return explainWard(context.neighbourhood, context);
  }

  if (context.facility) {
    const reply = explainFacility(context);
    if (reply) return reply;
  }

  if (context.neighbourhood) return explainWard(context.neighbourhood, context);

  return cityOverview(context);
}
