/**
 * What each kind of infrastructure costs, covers and is called.
 *
 * Prototype figures. Replace the whole record from the backend once real
 * capital-cost and catchment data is available.
 */

import type { FacilityType, NeedType } from "@/types";

export interface FacilitySpec {
  type: FacilityType;
  label: string;
  /** Short line shown under the label in the build palette. */
  blurb: string;
  /** The need this facility relieves most directly. */
  primaryNeed: NeedType;
  /** Kilometres. */
  serviceRadiusKm: number;
  /** Beds, students or daily trips. Shown in the inspector. */
  capacity: number;
  capacityUnit: string;
  /**
   * Residents the facility is designed to serve. The engine compares this
   * with the actual catchment to work out capacity pressure, which is why a
   * well-sited facility in a dense ward still leaves residual need.
   */
  designCatchment: number;
  /** Crore INR. */
  cost: number;
  /** Square kilometres of land the site consumes. */
  landKm2: number;
  /**
   * How strongly a placement pulls down the primary need score of wards
   * inside the service area. 0-1.
   */
  relief: number;
}

export const FACILITY_SPECS: Record<FacilityType, FacilitySpec> = {
  hospital: {
    type: "hospital",
    label: "Hospital",
    blurb: "Multi-speciality, 5.2 km catchment",
    primaryNeed: "healthcare",
    serviceRadiusKm: 5.2,
    capacity: 620,
    capacityUnit: "beds",
    designCatchment: 320_000,
    cost: 120,
    landKm2: 0.09,
    relief: 0.62,
  },
  school: {
    type: "school",
    label: "School",
    blurb: "Secondary, 2.2 km catchment",
    primaryNeed: "education",
    serviceRadiusKm: 2.2,
    capacity: 1_400,
    capacityUnit: "students",
    designCatchment: 26_000,
    cost: 18,
    landKm2: 0.03,
    relief: 0.48,
  },
  housing: {
    type: "housing",
    label: "Housing Block",
    blurb: "Mixed-income, adds residents",
    primaryNeed: "housing",
    serviceRadiusKm: 1.0,
    capacity: 2_400,
    capacityUnit: "residents",
    designCatchment: 2_400,
    cost: 22,
    landKm2: 0.02,
    relief: 0.44,
  },
  park: {
    type: "park",
    label: "Park",
    blurb: "Neighbourhood green, 1.4 km catchment",
    primaryNeed: "greenspace",
    serviceRadiusKm: 1.4,
    capacity: 60_000,
    capacityUnit: "residents",
    designCatchment: 60_000,
    cost: 9,
    landKm2: 0.12,
    relief: 0.55,
  },
  transit: {
    type: "transit",
    label: "Transit Station",
    blurb: "Interchange, 1.8 km walk shed",
    primaryNeed: "transit",
    serviceRadiusKm: 1.8,
    capacity: 40_000,
    capacityUnit: "daily trips",
    designCatchment: 72_000,
    cost: 46,
    landKm2: 0.02,
    relief: 0.58,
  },
  emergency: {
    type: "emergency",
    label: "Emergency Services",
    blurb: "Fire and ambulance, 4 km response",
    primaryNeed: "emergency",
    serviceRadiusKm: 4.0,
    capacity: 120_000,
    capacityUnit: "residents",
    designCatchment: 200_000,
    cost: 34,
    landKm2: 0.02,
    relief: 0.6,
  },
};

export const FACILITY_ORDER: FacilityType[] = [
  "hospital",
  "school",
  "housing",
  "park",
  "transit",
  "emergency",
];

export interface NeedSpec {
  id: NeedType;
  label: string;
  /** Which facility type relieves this need. */
  servedBy: FacilityType;
  /** Weighted inputs behind the need score, for the explanation popover. */
  inputs: { label: string; weight: number }[];
}

export const NEED_SPECS: Record<NeedType, NeedSpec> = {
  healthcare: {
    id: "healthcare",
    label: "Healthcare",
    servedBy: "hospital",
    inputs: [
      { label: "Population density", weight: 42 },
      { label: "Distance to nearest hospital", weight: 31 },
      { label: "Vulnerability index", weight: 18 },
      { label: "Existing bed capacity", weight: 9 },
    ],
  },
  education: {
    id: "education",
    label: "Education",
    servedBy: "school",
    inputs: [
      { label: "School-age population", weight: 38 },
      { label: "Distance to nearest school", weight: 29 },
      { label: "Classroom capacity ratio", weight: 22 },
      { label: "Vulnerability index", weight: 11 },
    ],
  },
  transit: {
    id: "transit",
    label: "Public Transport",
    servedBy: "transit",
    inputs: [
      { label: "Walk distance to a stop", weight: 44 },
      { label: "Population density", weight: 27 },
      { label: "Service frequency", weight: 19 },
      { label: "Road network quality", weight: 10 },
    ],
  },
  housing: {
    id: "housing",
    label: "Housing",
    servedBy: "housing",
    inputs: [
      { label: "Occupancy per dwelling", weight: 40 },
      { label: "Informal settlement share", weight: 30 },
      { label: "Rent-to-income ratio", weight: 20 },
      { label: "Projected household growth", weight: 10 },
    ],
  },
  greenspace: {
    id: "greenspace",
    label: "Green Space",
    servedBy: "park",
    inputs: [
      { label: "Green area per resident", weight: 45 },
      { label: "Walk distance to open space", weight: 33 },
      { label: "Tree canopy cover", weight: 14 },
      { label: "Surface temperature", weight: 8 },
    ],
  },
  emergency: {
    id: "emergency",
    label: "Emergency Services",
    servedBy: "emergency",
    inputs: [
      { label: "Response-time envelope", weight: 46 },
      { label: "Population density", weight: 24 },
      { label: "Flood and fire exposure", weight: 20 },
      { label: "Road access quality", weight: 10 },
    ],
  },
};

export const NEED_ORDER: NeedType[] = [
  "healthcare",
  "education",
  "transit",
  "housing",
  "greenspace",
  "emergency",
];
