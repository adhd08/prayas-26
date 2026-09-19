/**
 * Facility glyphs.
 *
 * Kept apart from components/map/markerIcons so the panels can show an icon
 * without pulling Leaflet into the server bundle. Leaflet touches `window` at
 * import time, which breaks prerendering.
 */

import {
  Ambulance,
  Building2,
  GraduationCap,
  Hospital,
  TrainFront,
  Trees,
  type LucideIcon,
} from "lucide-react";
import type { FacilityType } from "@/types";

export const FACILITY_ICONS: Record<FacilityType, LucideIcon> = {
  hospital: Hospital,
  school: GraduationCap,
  housing: Building2,
  park: Trees,
  transit: TrainFront,
  emergency: Ambulance,
};
