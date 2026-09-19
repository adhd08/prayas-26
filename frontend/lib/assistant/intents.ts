/**
 * Intent parsing for the planning assistant.
 *
 * Separates what the planner is asking about from what they are asking the
 * product to do. Anything that would change the plan is marked `mutating` and
 * the drawer asks for confirmation before it runs.
 */

import { NEIGHBOURHOODS } from "@/data/city";
import type {
  AssistantContext,
  AssistantIntent,
  FacilityType,
  NeedType,
} from "@/types";

const NEED_WORDS: { need: NeedType; match: RegExp }[] = [
  { need: "healthcare", match: /\b(health\s?care|health|hospital|medical)\b/i },
  { need: "education", match: /\b(education|school|classroom)\b/i },
  { need: "transit", match: /\b(transit|transport|metro|bus|mobility)\b/i },
  { need: "housing", match: /\b(housing|homes?|dwelling)\b/i },
  { need: "greenspace", match: /\b(green|park|open space)\b/i },
  { need: "emergency", match: /\b(emergency|fire|ambulance)\b/i },
];

const FACILITY_WORDS: { type: FacilityType; match: RegExp }[] = [
  { type: "hospital", match: /\bhospitals?\b/i },
  { type: "school", match: /\bschools?\b/i },
  { type: "park", match: /\bparks?\b/i },
  { type: "transit", match: /\b(transit stations?|stations?|metro stops?)\b/i },
  { type: "housing", match: /\b(housing blocks?|housing)\b/i },
  { type: "emergency", match: /\b(emergency services?|fire stations?)\b/i },
];

function findNeed(text: string): NeedType | undefined {
  return NEED_WORDS.find((n) => n.match.test(text))?.need;
}

function findFacilityType(text: string): FacilityType | undefined {
  return FACILITY_WORDS.find((f) => f.match.test(text))?.type;
}

/** Matches "ward 17", "ward-17" and bare "17" when a ward word is present. */
function findWardId(text: string): string | undefined {
  const m = text.match(/\bward[\s-]?(\d{1,2})\b/i);
  if (!m) return undefined;
  const id = `ward-${Number(m[1])}`;
  return NEIGHBOURHOODS.some((n) => n.id === id) ? id : undefined;
}

function findBudget(text: string): number | undefined {
  const m = text.match(/([\d,]+(?:\.\d+)?)\s*(cr|crore)/i);
  if (!m) return undefined;
  const v = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(v) ? v : undefined;
}

/**
 * Classifies a message. Order matters: action verbs are checked before the
 * question fallback so "add a hospital" is never treated as a query.
 */
export function parseIntent(
  raw: string,
  context: AssistantContext,
): AssistantIntent {
  const text = raw.trim();
  const lower = text.toLowerCase();
  const need = findNeed(lower);
  const facilityType = findFacilityType(lower);
  const wardId = findWardId(lower) ?? context.neighbourhood?.id;
  const budget = findBudget(lower);

  const isQuestion = /^(why|what|how|which|who|where|when|is|are|does|do|can|could|should)\b/.test(
    lower,
  ) || lower.endsWith("?");

  if (!isQuestion && /\b(set|reduce|cut|raise|increase|change)\b/.test(lower) && budget !== undefined) {
    return {
      type: "SET_BUDGET",
      mutating: true,
      payload: { budget },
      summary: `Set the budget to ₹${budget} Cr`,
    };
  }

  if (!isQuestion && /\b(optimi[sz]e|generate a plan|run the optimi)\w*/.test(lower)) {
    return {
      type: "OPTIMIZE",
      mutating: true,
      payload: { need },
      summary: need
        ? `Run the optimizer weighted toward ${need}`
        : "Run the optimizer with the current settings",
    };
  }

  if (!isQuestion && /\b(add|place|put|build|site)\b/.test(lower) && facilityType) {
    return {
      type: "ADD_FACILITY",
      mutating: true,
      payload: { facilityType, neighbourhoodId: wardId },
      summary: wardId
        ? `Add a ${facilityType} in ${wardId.replace("ward-", "Ward ")}`
        : `Add a ${facilityType} at the highest-need site`,
    };
  }

  if (!isQuestion && /\b(move|relocate|shift)\b/.test(lower) && (facilityType || context.facility)) {
    return {
      type: "MOVE_FACILITY",
      mutating: true,
      payload: {
        facilityId: context.facility?.id,
        facilityType: facilityType ?? context.facility?.type,
      },
      summary: `Move ${context.facility?.name ?? `the selected ${facilityType}`} to the best remaining site`,
    };
  }

  if (/\bcompare\b/.test(lower)) {
    return {
      type: "COMPARE",
      mutating: false,
      payload: {},
      summary: "Compare the current plan with the generated configuration",
    };
  }

  if (!isQuestion && /\b(show|display|switch to|view)\b/.test(lower) && need) {
    return {
      type: "SELECT_LAYER",
      mutating: false,
      payload: { need },
      summary: `Show the ${need} need layer`,
    };
  }

  if (/\b(focus|zoom|centre|center|go to|take me to)\b/.test(lower) && wardId) {
    return {
      type: "FOCUS_LOCATION",
      mutating: false,
      payload: { neighbourhoodId: wardId },
      summary: `Focus the map on ${wardId.replace("ward-", "Ward ")}`,
    };
  }

  return {
    type: "QUESTION",
    mutating: false,
    payload: { need, facilityType, neighbourhoodId: wardId },
    summary: text,
  };
}

/** Suggestions offered when the drawer opens, tuned to the current context. */
export function suggestionsFor(context: AssistantContext): string[] {
  const ward = context.neighbourhood;
  const facility = context.facility;
  const out: string[] = [];

  if (facility) {
    out.push(`Why did you place ${facility.name} here?`);
    out.push(`What happens if I remove ${facility.name}?`);
  }
  if (ward) {
    out.push(`Why is ${ward.name} underserved?`);
    out.push(`What would help ${ward.name} most?`);
  }
  if (context.result) {
    out.push("What are the biggest trade-offs?");
    out.push("Compare this with my current plan.");
  }
  out.push("Show healthcare need");
  out.push("Optimize this plan for healthcare");

  return out.slice(0, 5);
}
