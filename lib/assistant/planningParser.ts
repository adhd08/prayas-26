/**
 * Planning-goal parser.
 *
 * Turns a sentence into structured priorities, a budget and constraint
 * changes. This is deliberately a small rule-based mapper, not a language
 * model: it recognises a documented vocabulary and says plainly which parts of
 * the sentence it could not place. assistantApi swaps it for a backend parser
 * when one exists.
 */

import { PRIORITY_LABELS } from "@/data/defaults";
import { formatCost } from "@/lib/format";
import type { ConstraintId, ParsedPlanningGoal, PriorityId } from "@/types";

const HIGH = 90;
const RAISED = 78;
const LOW = 35;

interface Mutable {
  priorities: Partial<Record<PriorityId, number>>;
  budget?: number;
  constraints: { id: ConstraintId; value?: number; enabled?: boolean }[];
  notes: string[];
}

const NEED_TERMS: { id: PriorityId; match: RegExp; label: string }[] = [
  { id: "healthcare", match: /\b(health\s?care|health|hospital|clinic|medical)\b/i, label: "Healthcare" },
  { id: "education", match: /\b(education|school|classroom|student)\b/i, label: "Education" },
  { id: "transit", match: /\b(transit|transport|transportation|metro|bus|mobility|commute)\b/i, label: "Transit" },
  { id: "housing", match: /\b(housing|homes?|dwelling|shelter|residential)\b/i, label: "Housing" },
  { id: "greenspace", match: /\b(green|park|open space|tree|canopy)\b/i, label: "Green space" },
];

const RAISE = /\b(priorit(?:ise|ize)|maximi[sz]e|focus|emphasi[sz]e|improve|boost|more|increase|better)\b/i;
const LOWER = /\b(de-?priorit(?:ise|ize)|less|reduce|minimi[sz]e|fewer|lower)\b/i;

/** Reads "800 Cr", "₹800 crore", "800cr", "1,000 Cr". */
function readBudget(text: string): number | undefined {
  const m = text.match(
    /(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?)\s*(cr|crore|crores)\b/i,
  );
  if (!m) return undefined;
  const value = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(value) ? value : undefined;
}

function readDistance(text: string): number | undefined {
  const m = text.match(/\b([\d.]+)\s*(km|kilometre|kilometer)s?\b/i);
  if (!m) return undefined;
  const value = Number(m[1]);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * Parses a planning sentence. Unrecognised fragments are returned rather than
 * silently dropped, so the planner can see what was ignored.
 */
export function parsePlanningGoal(input: string): ParsedPlanningGoal {
  const text = input.trim();
  const state: Mutable = { priorities: {}, constraints: [], notes: [] };

  if (!text) {
    return {
      priorities: {},
      constraints: [],
      summary: "Describe a goal to update the planning objective.",
      unrecognised: [],
    };
  }

  const lower = text.toLowerCase();
  const consumed: string[] = [];

  // Balance overrides individual weighting.
  if (/\bbalance(d)?\b/.test(lower)) {
    for (const key of [
      "healthcare",
      "education",
      "transit",
      "housing",
      "greenspace",
    ] as PriorityId[]) {
      state.priorities[key] = 70;
    }
    state.priorities.coverage = 70;
    state.notes.push("Weighted every need equally.");
    consumed.push("balance");
  }

  for (const term of NEED_TERMS) {
    if (!term.match.test(lower)) continue;
    consumed.push(term.label.toLowerCase());
    if (LOWER.test(lower) && !RAISE.test(lower)) {
      state.priorities[term.id] = LOW;
      state.notes.push(`${term.label} weighted down.`);
    } else {
      state.priorities[term.id] = RAISE.test(lower) ? HIGH : RAISED;
      state.notes.push(`${term.label} weighted to ${state.priorities[term.id]}%.`);
    }
  }

  if (/\b(underserved|equit|inequal|gap|left behind|vulnerable)\w*/i.test(lower)) {
    state.priorities.coverage = HIGH;
    state.notes.push("Population coverage weighted to 90% to favour underserved wards.");
    consumed.push("underserved");
  }

  if (/\b(cheap|afford|cost[- ]?effective|value for money|efficien)\w*/i.test(lower)) {
    state.priorities.cost = HIGH;
    state.notes.push("Cost efficiency weighted to 90%.");
    consumed.push("cost efficiency");
  }

  if (/\b(sustainab|environment|emission|climate|flood)\w*/i.test(lower)) {
    state.priorities.environment = HIGH;
    state.notes.push("Environmental impact weighted to 90%.");
    consumed.push("environment");
  }

  const budget = readBudget(lower);
  if (budget !== undefined) {
    state.budget = budget;
    const bounded = /\b(below|under|less than|within|max|cap|budget of|at most)\b/.test(
      lower,
    );
    state.notes.push(
      bounded
        ? `Budget capped at ${formatCost(budget)}.`
        : `Budget set to ${formatCost(budget)}.`,
    );
    consumed.push("budget");
  }

  const distance = readDistance(lower);
  if (distance !== undefined) {
    state.constraints.push({ id: "maxTravel", value: distance, enabled: true });
    state.notes.push(`Maximum travel distance set to ${distance} km.`);
    consumed.push("travel distance");
  }

  if (/\b(avoid|exclude|keep out of|stay out of)\b.*\bflood\b/.test(lower)) {
    state.constraints.push({ id: "floodRisk", enabled: true });
    state.notes.push("Flood-risk areas excluded.");
  }
  if (/\b(allow|permit|ignore)\b.*\bflood\b/.test(lower)) {
    state.constraints.push({ id: "floodRisk", enabled: false });
    state.notes.push("Flood-risk exclusion switched off.");
  }
  if (/\bheritage|protected|conservation\b/.test(lower)) {
    state.constraints.push({ id: "protectedLand", enabled: true });
    state.notes.push("Protected land excluded.");
  }
  if (/\bgrowth|future population|horizon\b/.test(lower)) {
    state.constraints.push({ id: "populationGrowth", enabled: true });
    state.notes.push("Projected population growth switched on.");
  }

  // Nothing matched at all, so hand the whole phrase back rather than
  // pretending it was understood.
  const unrecognised = consumed.length === 0 ? [text] : [];

  return {
    priorities: state.priorities,
    budget: state.budget,
    constraints: state.constraints,
    summary:
      state.notes.length > 0
        ? state.notes.join(" ")
        : "Nothing in that phrase matched a planning objective. Try naming a need, a budget in crore, or a travel distance.",
    unrecognised,
  };
}

/** Prompts offered under the goal field. Each one parses cleanly. */
export const QUICK_GOALS = [
  "Prioritize healthcare access in underserved wards while keeping costs below ₹800 Cr",
  "Maximize transit accessibility within 3 km",
  "Create a greener city and avoid flood zones",
  "Balance all needs across the city",
];

export function describePriorityChange(
  id: PriorityId,
  value: number,
): string {
  return `${PRIORITY_LABELS[id]} ${value}%`;
}
