/**
 * Prototype simulation engine.
 *
 * These are illustrative demo rules, not a validated urban model. They exist
 * so the interface can show cause and effect while the real engine is built.
 * Everything here is pure and deterministic: same inputs, same city.
 *
 * The three rules that drive the whole loop:
 *   1. A facility relieves its primary need inside its service radius, with a
 *      smooth falloff to zero at the edge.
 *   2. Overlapping facilities compound with diminishing returns, never past
 *      full relief.
 *   3. Housing adds residents, and residents add demand, so a housing block
 *      raises healthcare, education, transit and emergency need locally.
 */

import { NEIGHBOURHOODS, NEIGHBOURHOOD_BY_ID } from "@/data/city";
import {
  FACILITY_SPECS,
  NEED_ORDER,
  NEED_SPECS,
} from "@/data/facilityCatalog";
import { clamp, distanceKm, pointInRing, smoothstep } from "@/lib/geo";
import { createRng, hashSeed } from "@/lib/rng";
import type {
  Constraint,
  Facility,
  FacilityType,
  HeatPoint,
  LatLng,
  Neighbourhood,
  NeedType,
  SimulationMetrics,
} from "@/types";

/** Composite needs behind the headline underserved figure. */
const COMPOSITE_NEEDS: NeedType[] = [
  "healthcare",
  "education",
  "transit",
  "housing",
  "greenspace",
  "emergency",
];

/**
 * Needs that grow when residents are added. Green space is included because
 * open space per resident falls as a ward densifies, which is what makes a
 * housing-heavy plan give ground on green access.
 */
const DEMAND_DRIVEN: NeedType[] = [
  "healthcare",
  "education",
  "transit",
  "greenspace",
  "emergency",
];

/**
 * Adequacy band, applied to a ward's *worst* need rather than its average.
 *
 * A ward that is comfortable on five services and badly short on the sixth
 * still has underserved residents, and averaging hides exactly that. Scoring
 * the worst need also stops a broad plan from driving the figure to near zero,
 * which would overstate what one round of siting can achieve.
 */
const UNDERSERVED_THRESHOLD = 70;
const UNDERSERVED_WIDTH = 25;
/** Average door-to-door speed assumed when turning kilometres into minutes. */
const TRAVEL_SPEED_KMH = 18;

/**
 * 1 at the facility, 0 at the edge of the service area.
 *
 * Deliberately steeper than linear: a resident at half the radius is not half
 * as well served, they are noticeably worse off. A gentle curve here lets two
 * hospitals appear to blanket the whole study area, which is not how catchment
 * works.
 */
function falloff(distance: number, radiusKm: number): number {
  if (distance >= radiusKm || radiusKm <= 0) return 0;
  return Math.pow(1 - distance / radiusKm, 1.25);
}

/**
 * Residents inside a facility catchment, from base ward population only.
 * Housing-adjusted population is deliberately excluded to keep this free of
 * the recursion that feeds relief back into demand.
 */
const catchmentCache = new Map<string, number>();

function catchmentLoad(facility: Facility): number {
  const key = `${facility.id}:${facility.position.lat.toFixed(5)}:${facility.position.lng.toFixed(5)}`;
  const cached = catchmentCache.get(key);
  if (cached !== undefined) return cached;
  let total = 0;
  for (const ward of NEIGHBOURHOODS) {
    total +=
      ward.population *
      falloff(
        distanceKm(facility.position, ward.centroid),
        facility.serviceRadiusKm + 1,
      );
  }
  if (catchmentCache.size > 600) catchmentCache.clear();
  catchmentCache.set(key, total);
  return total;
}

/**
 * How much of its nominal relief a facility actually delivers.
 *
 * A hospital sized for 180,000 residents sitting in a catchment of 600,000
 * does not serve everyone equally well. Capacity pressure is the reason a
 * good plan improves coverage without ever reaching 100%.
 */
export function capacityPressure(facility: Facility): number {
  if (facility.type === "housing") return 1;
  const load = catchmentLoad(facility);
  if (load <= 0) return 1;
  return clamp(FACILITY_SPECS[facility.type].designCatchment / load, 0, 1);
}

function strengthOf(facility: Facility): number {
  if (facility.type === "housing") return 1;
  // Distance still dominates: an overloaded facility nearby beats no facility
  // at all, so pressure moves relief between 0.55 and 1 rather than to zero.
  return 0.55 + 0.45 * capacityPressure(facility);
}

/**
 * Residents a ward holds once new housing is counted. Housing blocks placed
 * inside the ward add their capacity.
 */
export function effectivePopulation(
  ward: Neighbourhood,
  facilities: Facility[],
): number {
  let added = 0;
  for (const f of facilities) {
    if (f.type !== "housing" || f.origin === "existing") continue;
    if (pointInRing(f.position, ward.ring)) added += f.capacity;
  }
  return ward.population + added;
}

/**
 * Need at an arbitrary point, before any facility relief. Uses the containing
 * ward as the base and scales it by the local demand pressure from housing.
 */
function baseNeedAt(
  ward: Neighbourhood,
  need: NeedType,
  facilities: Facility[],
): number {
  const base = ward.need[need];
  if (!DEMAND_DRIVEN.includes(need)) return base;
  const pressure = effectivePopulation(ward, facilities) / ward.population;
  return clamp(base * (1 + 0.55 * (pressure - 1)), 0, 100);
}

/** Combined relief at a point, 0-1, with diminishing returns on overlap. */
function reliefAt(
  point: LatLng,
  need: NeedType,
  facilities: Facility[],
): number {
  const servedBy = NEED_SPECS[need].servedBy;
  let remaining = 1;
  for (const f of facilities) {
    if (f.type !== servedBy) continue;
    if (f.review === "rejected") continue;
    const d = distanceKm(point, f.position);
    const w = falloff(d, f.serviceRadiusKm);
    if (w <= 0) continue;
    remaining *= 1 - FACILITY_SPECS[f.type].relief * w * strengthOf(f);
  }
  return 1 - remaining;
}

/** Need score at a point once existing and planned facilities are applied. */
export function needAtPoint(
  point: LatLng,
  ward: Neighbourhood,
  need: NeedType,
  facilities: Facility[],
): number {
  const base = baseNeedAt(ward, need, facilities);
  return clamp(base * (1 - reliefAt(point, need, facilities)), 0, 100);
}

/** Ward-level effective need, sampled at the ward centroid. */
export function wardNeed(
  ward: Neighbourhood,
  need: NeedType,
  facilities: Facility[],
): number {
  return needAtPoint(ward.centroid, ward, need, facilities);
}

export function wardNeeds(
  ward: Neighbourhood,
  facilities: Facility[],
): Record<NeedType, number> {
  const out = {} as Record<NeedType, number>;
  for (const need of NEED_ORDER) out[need] = wardNeed(ward, need, facilities);
  return out;
}

/** Access is the complement of need, which is what planners read. */
export const accessFromNeed = (need: number) => clamp(100 - need, 0, 100);

/** Population-weighted city coverage for one need, as a percentage. */
export function coverageFor(
  need: NeedType,
  facilities: Facility[],
  wards: Neighbourhood[] = NEIGHBOURHOODS,
): number {
  let weighted = 0;
  let total = 0;
  for (const ward of wards) {
    const pop = effectivePopulation(ward, facilities);
    weighted += accessFromNeed(wardNeed(ward, need, facilities)) * pop;
    total += pop;
  }
  return total === 0 ? 0 : weighted / total;
}

/** The service a ward is worst served by, which is what defines its gap. */
export function worstNeedScore(
  ward: Neighbourhood,
  facilities: Facility[],
): { need: NeedType; score: number } {
  let worst: { need: NeedType; score: number } = {
    need: COMPOSITE_NEEDS[0],
    score: -1,
  };
  for (const need of COMPOSITE_NEEDS) {
    const score = wardNeed(ward, need, facilities);
    if (score > worst.score) worst = { need, score };
  }
  return worst;
}

/** Residents living below the adequacy threshold. */
export function underservedPopulation(
  facilities: Facility[],
  wards: Neighbourhood[] = NEIGHBOURHOODS,
): number {
  let total = 0;
  for (const ward of wards) {
    const share = clamp(
      (worstNeedScore(ward, facilities).score - UNDERSERVED_THRESHOLD) /
        UNDERSERVED_WIDTH,
      0,
      1,
    );
    total += effectivePopulation(ward, facilities) * share;
  }
  return total;
}

/** Distance from a point to the nearest facility of a type, in kilometres. */
export function nearestFacility(
  point: LatLng,
  type: FacilityType,
  facilities: Facility[],
): { facility: Facility; distanceKm: number } | null {
  let best: { facility: Facility; distanceKm: number } | null = null;
  for (const f of facilities) {
    if (f.type !== type || f.review === "rejected") continue;
    const d = distanceKm(point, f.position);
    if (!best || d < best.distanceKm) best = { facility: f, distanceKm: d };
  }
  return best;
}

/** Pop-weighted mean trip to the nearest hospital, school, stop and park. */
export function averageTravelMinutes(
  facilities: Facility[],
  wards: Neighbourhood[] = NEIGHBOURHOODS,
): number {
  const types: FacilityType[] = ["hospital", "school", "transit", "park"];
  let weighted = 0;
  let total = 0;
  for (const ward of wards) {
    let sum = 0;
    for (const type of types) {
      const near = nearestFacility(ward.centroid, type, facilities);
      sum += near ? near.distanceKm : 12;
    }
    const pop = effectivePopulation(ward, facilities);
    weighted += (sum / types.length) * pop;
    total += pop;
  }
  const meanKm = total === 0 ? 0 : weighted / total;
  return (meanKm / TRAVEL_SPEED_KMH) * 60;
}

/** Residents inside a facility service area, weighted by ward overlap. */
export function populationServed(
  facility: Facility,
  facilities: Facility[],
  wards: Neighbourhood[] = NEIGHBOURHOODS,
): number {
  let served = 0;
  for (const ward of wards) {
    const d = distanceKm(facility.position, ward.centroid);
    const w = falloff(d, facility.serviceRadiusKm + 1.2);
    if (w <= 0) continue;
    served += effectivePopulation(ward, facilities) * w;
  }
  return served;
}

export function committedCost(facilities: Facility[]): number {
  return facilities
    .filter((f) => f.origin !== "existing" && f.review !== "rejected")
    .reduce((sum, f) => sum + f.estimatedCost, 0);
}

function landConsumed(facilities: Facility[]): number {
  return facilities
    .filter((f) => f.origin !== "existing" && f.review !== "rejected")
    .reduce((sum, f) => sum + FACILITY_SPECS[f.type].landKm2, 0);
}

/** Share of protected wards with no new construction inside them. */
function protectedLandPreserved(facilities: Facility[]): number {
  const wards = NEIGHBOURHOODS.filter((n) => n.isProtected);
  if (wards.length === 0) return 100;
  const touched = wards.filter((ward) =>
    facilities.some(
      (f) =>
        f.origin !== "existing" &&
        f.review !== "rejected" &&
        pointInRing(f.position, ward.ring),
    ),
  ).length;
  return ((wards.length - touched) / wards.length) * 100;
}

export function computeMetrics(facilities: Facility[]): SimulationMetrics {
  return {
    population: NEIGHBOURHOODS.reduce(
      (sum, n) => sum + effectivePopulation(n, facilities),
      0,
    ),
    healthcareCoverage: coverageFor("healthcare", facilities),
    educationCoverage: coverageFor("education", facilities),
    transitCoverage: coverageFor("transit", facilities),
    greenspaceCoverage: coverageFor("greenspace", facilities),
    emergencyCoverage: coverageFor("emergency", facilities),
    housingAdequacy: coverageFor("housing", facilities),
    underservedPopulation: underservedPopulation(facilities),
    averageTravelMinutes: averageTravelMinutes(facilities),
    committedCost: committedCost(facilities),
    landConsumedKm2: landConsumed(facilities),
    protectedLandPreserved: protectedLandPreserved(facilities),
  };
}

/* --- Heat field ----------------------------------------------------------- */

export interface HeatSample {
  lat: number;
  lng: number;
  wardId: string;
}

/**
 * Fixed sample lattice for the heat surface. Generated once with a seeded RNG
 * so the field never shimmers between renders; only the intensity changes.
 */
function buildHeatSamples(): HeatSample[] {
  const samples: HeatSample[] = [];
  for (const ward of NEIGHBOURHOODS) {
    const rng = createRng(hashSeed(ward.id));
    let south = Infinity;
    let west = Infinity;
    let north = -Infinity;
    let east = -Infinity;
    for (const p of ward.ring) {
      south = Math.min(south, p.lat);
      north = Math.max(north, p.lat);
      west = Math.min(west, p.lng);
      east = Math.max(east, p.lng);
    }
    let placed = 0;
    let guard = 0;
    while (placed < 46 && guard < 900) {
      guard++;
      const p = {
        lat: rng.range(south, north),
        lng: rng.range(west, east),
      };
      if (!pointInRing(p, ward.ring)) continue;
      samples.push({ lat: p.lat, lng: p.lng, wardId: ward.id });
      placed++;
    }
  }
  return samples;
}

export const HEAT_SAMPLES = buildHeatSamples();

/** Current heat field for one need layer. */
export function heatField(
  need: NeedType,
  facilities: Facility[],
): HeatPoint[] {
  return HEAT_SAMPLES.map((s) => {
    const ward = NEIGHBOURHOOD_BY_ID.get(s.wardId);
    if (!ward) return { lat: s.lat, lng: s.lng, intensity: 0 };
    const value = needAtPoint(s, ward, need, facilities);
    return { lat: s.lat, lng: s.lng, intensity: value / 100 };
  });
}

/* --- Placement validation -------------------------------------------------- */

export type PlacementCode =
  | "ok"
  | "outside"
  | "protected"
  | "flood"
  | "land"
  | "spacing";

export interface PlacementCheck {
  ok: boolean;
  code: PlacementCode;
  title: string;
  message: string;
  ward?: Neighbourhood;
}

export function wardAt(point: LatLng): Neighbourhood | undefined {
  return NEIGHBOURHOODS.find((n) => pointInRing(point, n.ring));
}

function constraintOn(constraints: Constraint[], id: string): Constraint | undefined {
  const c = constraints.find((x) => x.id === id);
  return c?.enabled ? c : undefined;
}

/**
 * Prototype spatial rules. A refusal always says which rule refused and what
 * the planner can do about it.
 */
export function checkPlacement(
  point: LatLng,
  type: FacilityType,
  facilities: Facility[],
  constraints: Constraint[],
): PlacementCheck {
  const ward = wardAt(point);
  if (!ward) {
    return {
      ok: false,
      code: "outside",
      title: "Outside the study area",
      message:
        "Sylvida only models the sixteen wards inside the highlighted boundary.",
    };
  }

  if (constraintOn(constraints, "protectedLand") && ward.isProtected) {
    return {
      ok: false,
      code: "protected",
      title: "Protected land",
      message: `${ward.name} sits inside a heritage envelope. New construction is excluded while the protected-land constraint is on.`,
      ward,
    };
  }

  if (constraintOn(constraints, "floodRisk") && ward.floodRisk > 0.55) {
    return {
      ok: false,
      code: "flood",
      title: "Location unavailable",
      message: `This site intersects a high-risk flood zone. ${Math.round(
        ward.floodRisk * 100,
      )}% of ${ward.name} lies inside the modelled flood envelope.`,
      ward,
    };
  }

  if (
    constraintOn(constraints, "landAvailability") &&
    ward.landSuitability < 0.3
  ) {
    return {
      ok: false,
      code: "land",
      title: "Insufficient available land",
      message: `Only ${Math.round(
        ward.landSuitability * 100,
      )}% of ${ward.name} is buildable under current land records.`,
      ward,
    };
  }

  const spacing = constraintOn(constraints, "minSpacing");
  if (spacing && spacing.value) {
    const near = nearestFacility(point, type, facilities);
    if (near && near.distanceKm < spacing.value) {
      return {
        ok: false,
        code: "spacing",
        title: "Too close to existing provision",
        message: `${near.facility.name} is ${near.distanceKm.toFixed(
          1,
        )} km away. Minimum spacing for this facility type is ${spacing.value} km.`,
        ward,
      };
    }
  }

  return {
    ok: true,
    code: "ok",
    title: "Site available",
    message: `${ward.name}. ${Math.round(
      ward.landSuitability * 100,
    )}% land suitability.`,
    ward,
  };
}

/* --- Facility factory ------------------------------------------------------ */

let sequence = 0;

export function createFacility(
  type: FacilityType,
  position: LatLng,
  origin: Facility["origin"] = "user",
  index?: number,
): Facility {
  const spec = FACILITY_SPECS[type];
  sequence += 1;
  const n = index ?? sequence;
  return {
    id: `${origin}-${type}-${Date.now().toString(36)}-${sequence}`,
    type,
    name: `${spec.label} ${String(n).padStart(2, "0")}`,
    origin,
    position,
    serviceRadiusKm: spec.serviceRadiusKm,
    capacity: spec.capacity,
    estimatedCost: spec.cost,
  };
}
