/**
 * Synthetic city for the prototype.
 *
 * Sixteen wards laid over Central Kolkata. Ward boundaries are generated from
 * a jittered lattice so neighbours share exact edges, which keeps the map
 * looking cadastral rather than like a grid of boxes. Every attribute below is
 * invented demo data: it is plausible, not measured. The backend replaces this
 * module wholesale through cityApi.
 */

import { DEMO_CITY } from "@/lib/config";
import { ringCentroid } from "@/lib/geo";
import { createRng, hashSeed } from "@/lib/rng";
import type { Facility, LatLng, Neighbourhood, NeedType, Ring } from "@/types";
import { FACILITY_SPECS } from "./facilityCatalog";

const COLS = 4;
const ROWS = 4;
const HALF_LAT = 0.045;
const HALF_LNG = 0.05;

const NORTH = DEMO_CITY.lat + HALF_LAT;
const WEST = DEMO_CITY.lng - HALF_LNG;
const STEP_LAT = (HALF_LAT * 2) / ROWS;
const STEP_LNG = (HALF_LNG * 2) / COLS;

/** Boundary lattice, jittered so wards are irregular but still tessellate. */
function buildLattice() {
  const rng = createRng(hashSeed("sylvida-central-kolkata"));
  const corners: LatLng[][] = [];
  for (let r = 0; r <= ROWS; r++) {
    const row: LatLng[] = [];
    for (let c = 0; c <= COLS; c++) {
      const edgeLat = r === 0 || r === ROWS;
      const edgeLng = c === 0 || c === COLS;
      row.push({
        lat:
          NORTH - r * STEP_LAT + (edgeLat ? 0 : rng.range(-0.0055, 0.0055)),
        lng: WEST + c * STEP_LNG + (edgeLng ? 0 : rng.range(-0.006, 0.006)),
      });
    }
    corners.push(row);
  }

  const mid = (a: LatLng, b: LatLng, jitter: number): LatLng => ({
    lat: (a.lat + b.lat) / 2 + rng.range(-jitter, jitter),
    lng: (a.lng + b.lng) / 2 + rng.range(-jitter, jitter),
  });

  const hMid: LatLng[][] = [];
  for (let r = 0; r <= ROWS; r++) {
    const row: LatLng[] = [];
    for (let c = 0; c < COLS; c++) {
      row.push(mid(corners[r][c], corners[r][c + 1], r === 0 || r === ROWS ? 0 : 0.0022));
    }
    hMid.push(row);
  }

  const vMid: LatLng[][] = [];
  for (let r = 0; r < ROWS; r++) {
    const row: LatLng[] = [];
    for (let c = 0; c <= COLS; c++) {
      row.push(mid(corners[r][c], corners[r + 1][c], c === 0 || c === COLS ? 0 : 0.0022));
    }
    vMid.push(row);
  }

  return { corners, hMid, vMid };
}

const LATTICE = buildLattice();

/** Clockwise ring for one grid cell, sharing midpoints with its neighbours. */
function cellRing(r: number, c: number): Ring {
  const { corners, hMid, vMid } = LATTICE;
  return [
    corners[r][c],
    hMid[r][c],
    corners[r][c + 1],
    vMid[r][c + 1],
    corners[r + 1][c + 1],
    hMid[r + 1][c],
    corners[r + 1][c],
    vMid[r][c],
  ];
}

interface WardSeed {
  ward: number;
  district: string;
  population: number;
  /** healthcare, education, transit, housing, greenspace, emergency. */
  need: [number, number, number, number, number, number];
  vulnerability: number;
  floodRisk: number;
  landSuitability: number;
  isProtected?: boolean;
}

/**
 * Row-major, north-west to south-east. The western column sits on the river,
 * so it carries the flood exposure; the eastern and southern wards carry the
 * service gap. Ward 17 is the compact, dense core ward the demo opens on.
 */
const WARD_SEEDS: WardSeed[] = [
  { ward: 11, district: "Borough II", population: 96_400, need: [34, 41, 28, 46, 52, 31], vulnerability: 38, floodRisk: 0.62, landSuitability: 0.44 },
  { ward: 12, district: "Borough II", population: 132_700, need: [29, 36, 24, 39, 61, 27], vulnerability: 31, floodRisk: 0.34, landSuitability: 0.51 },
  { ward: 13, district: "Borough III", population: 74_900, need: [45, 52, 43, 55, 58, 44], vulnerability: 33, floodRisk: 0.22, landSuitability: 0.18, isProtected: true },
  { ward: 14, district: "Borough III", population: 118_300, need: [58, 61, 57, 62, 66, 55], vulnerability: 47, floodRisk: 0.19, landSuitability: 0.63 },
  { ward: 15, district: "Borough IV", population: 141_200, need: [38, 44, 33, 51, 64, 36], vulnerability: 44, floodRisk: 0.71, landSuitability: 0.38 },
  { ward: 16, district: "Borough IV", population: 88_600, need: [56, 49, 47, 58, 71, 52], vulnerability: 51, floodRisk: 0.41, landSuitability: 0.66 },
  { ward: 17, district: "Borough IV", population: 18_420, need: [82, 71, 74, 78, 88, 79], vulnerability: 71, floodRisk: 0.18, landSuitability: 0.92 },
  { ward: 18, district: "Borough V", population: 156_800, need: [74, 68, 69, 73, 81, 71], vulnerability: 64, floodRisk: 0.24, landSuitability: 0.78 },
  { ward: 19, district: "Borough V", population: 109_400, need: [47, 55, 41, 57, 69, 45], vulnerability: 42, floodRisk: 0.68, landSuitability: 0.41 },
  { ward: 20, district: "Borough VI", population: 92_700, need: [63, 64, 58, 66, 74, 61], vulnerability: 55, floodRisk: 0.37, landSuitability: 0.7 },
  { ward: 21, district: "Borough VI", population: 167_300, need: [77, 73, 71, 75, 84, 74], vulnerability: 68, floodRisk: 0.26, landSuitability: 0.81 },
  { ward: 22, district: "Borough VI", population: 134_900, need: [71, 70, 76, 72, 79, 68], vulnerability: 61, floodRisk: 0.21, landSuitability: 0.74 },
  { ward: 23, district: "Borough VII", population: 78_500, need: [52, 58, 49, 61, 72, 51], vulnerability: 46, floodRisk: 0.74, landSuitability: 0.35 },
  { ward: 24, district: "Borough VII", population: 121_600, need: [66, 69, 63, 68, 77, 64], vulnerability: 57, floodRisk: 0.44, landSuitability: 0.69 },
  { ward: 25, district: "Borough VIII", population: 145_700, need: [73, 76, 72, 74, 83, 72], vulnerability: 66, floodRisk: 0.29, landSuitability: 0.76 },
  { ward: 26, district: "Borough VIII", population: 142_580, need: [68, 72, 79, 70, 86, 70], vulnerability: 63, floodRisk: 0.23, landSuitability: 0.72 },
];

const NEED_KEYS: NeedType[] = [
  "healthcare",
  "education",
  "transit",
  "housing",
  "greenspace",
  "emergency",
];

export const NEIGHBOURHOODS: Neighbourhood[] = WARD_SEEDS.map((seed, i) => {
  const r = Math.floor(i / COLS);
  const c = i % COLS;
  const ring = cellRing(r, c);
  const need = {} as Record<NeedType, number>;
  NEED_KEYS.forEach((key, k) => {
    need[key] = seed.need[k];
  });
  return {
    id: `ward-${seed.ward}`,
    name: `Ward ${seed.ward}`,
    district: seed.district,
    population: seed.population,
    ring,
    centroid: ringCentroid(ring),
    need,
    vulnerability: seed.vulnerability,
    floodRisk: seed.floodRisk,
    landSuitability: seed.landSuitability,
    isProtected: seed.isProtected ?? false,
  };
});

export const NEIGHBOURHOOD_BY_ID = new Map(
  NEIGHBOURHOODS.map((n) => [n.id, n]),
);

export const CITY_POPULATION = NEIGHBOURHOODS.reduce(
  (sum, n) => sum + n.population,
  0,
);

/** Offsets a point from a ward centroid, keeping it inside the ward. */
function offsetFrom(wardId: string, dLat: number, dLng: number): LatLng {
  const ward = NEIGHBOURHOOD_BY_ID.get(wardId);
  if (!ward) throw new Error(`Unknown ward ${wardId}`);
  return { lat: ward.centroid.lat + dLat, lng: ward.centroid.lng + dLng };
}

interface ExistingSeed {
  type: Facility["type"];
  ward: string;
  dLat: number;
  dLng: number;
  name: string;
}

/**
 * Existing stock. Hospitals sit on the western riverside corridor, which is
 * why the eastern wards read as underserved: that gap is the demo.
 */
const EXISTING_SEEDS: ExistingSeed[] = [
  { type: "hospital", ward: "ward-11", dLat: 0.002, dLng: -0.004, name: "Riverside General" },
  { type: "hospital", ward: "ward-19", dLat: -0.003, dLng: 0.002, name: "Canal Road Hospital" },
  { type: "hospital", ward: "ward-23", dLat: 0.004, dLng: -0.001, name: "South Dock Infirmary" },
  { type: "school", ward: "ward-11", dLat: -0.005, dLng: 0.006, name: "Ward 11 Higher Secondary" },
  { type: "school", ward: "ward-12", dLat: 0.004, dLng: 0.003, name: "Maidan Road School" },
  { type: "school", ward: "ward-12", dLat: -0.006, dLng: -0.005, name: "Bowbazar Secondary" },
  { type: "school", ward: "ward-13", dLat: 0.002, dLng: 0.005, name: "Heritage Quarter School" },
  { type: "school", ward: "ward-15", dLat: 0.003, dLng: 0.004, name: "Ward 15 Girls School" },
  { type: "school", ward: "ward-16", dLat: -0.004, dLng: 0.002, name: "Ward 16 Secondary" },
  { type: "school", ward: "ward-19", dLat: 0.005, dLng: 0.004, name: "Canal Road School" },
  { type: "school", ward: "ward-24", dLat: -0.002, dLng: -0.004, name: "Ward 24 Secondary" },
  { type: "park", ward: "ward-12", dLat: -0.001, dLng: 0.006, name: "Maidan North" },
  { type: "park", ward: "ward-13", dLat: -0.004, dLng: -0.003, name: "Heritage Gardens" },
  { type: "park", ward: "ward-15", dLat: -0.005, dLng: -0.004, name: "Riverbank Green" },
  { type: "park", ward: "ward-20", dLat: 0.004, dLng: 0.003, name: "Ward 20 Commons" },
  { type: "transit", ward: "ward-11", dLat: -0.002, dLng: 0.005, name: "Riverside North" },
  { type: "transit", ward: "ward-12", dLat: 0.001, dLng: -0.004, name: "Central Interchange" },
  { type: "transit", ward: "ward-15", dLat: 0.002, dLng: 0.006, name: "Maidan Halt" },
  { type: "transit", ward: "ward-19", dLat: -0.001, dLng: -0.003, name: "Canal Road Halt" },
  { type: "transit", ward: "ward-23", dLat: -0.003, dLng: 0.004, name: "South Dock Halt" },
  { type: "transit", ward: "ward-16", dLat: 0.005, dLng: -0.002, name: "Ward 16 Halt" },
  { type: "emergency", ward: "ward-12", dLat: -0.003, dLng: 0.002, name: "Central Fire Station" },
  { type: "emergency", ward: "ward-20", dLat: -0.004, dLng: -0.005, name: "Borough VI Station" },
];

export const EXISTING_FACILITIES: Facility[] = EXISTING_SEEDS.map(
  (seed, i) => {
    const spec = FACILITY_SPECS[seed.type];
    return {
      id: `existing-${seed.type}-${i + 1}`,
      type: seed.type,
      name: seed.name,
      origin: "existing" as const,
      position: offsetFrom(seed.ward, seed.dLat, seed.dLng),
      serviceRadiusKm: spec.serviceRadiusKm,
      capacity: spec.capacity,
      estimatedCost: 0,
    };
  },
);

/** Study-area corners, for fit-bounds and the story camera. */
export const CITY_BOUNDS = {
  south: DEMO_CITY.lat - HALF_LAT,
  west: DEMO_CITY.lng - HALF_LNG,
  north: DEMO_CITY.lat + HALF_LAT,
  east: DEMO_CITY.lng + HALF_LNG,
};

export const CITY_EXTENT = { HALF_LAT, HALF_LNG, ROWS, COLS };
