/**
 * Design tokens in JavaScript.
 *
 * Canvas and Leaflet draw outside the Tailwind utility layer, so the values in
 * app/globals.css are mirrored here. These two files must be edited together.
 */

import type { FacilityType, NeedType } from "@/types";

export const surface = {
  void: "#0B0F14",
  base: "#111720",
  raised: "#151D27",
  elevated: "#1A2430",
  line: "#263241",
  lineSoft: "#1D2732",
} as const;

export const ink = {
  primary: "#F5F7FA",
  secondary: "#A7B0BD",
  muted: "#6F7B89",
  disabled: "#4A5562",
} as const;

export const brand = {
  cyan: "#52D6E8",
  cyanDim: "#2B8494",
  mint: "#55D6A6",
} as const;

export const semantic = {
  ok: "#41D69A",
  warn: "#F4C95D",
  attention: "#FF9F43",
  danger: "#FF5C68",
  critical: "#FF4F5E",
} as const;

/** Need ramp, low to critical. Sampled as a continuous gradient. */
export const needRamp = [
  "#31C48D",
  "#8BCB69",
  "#E4CF57",
  "#F89A45",
  "#F06445",
  "#E74855",
] as const;

export const facilityColor: Record<FacilityType, string> = {
  hospital: "#FF6B7A",
  school: "#9B8AFB",
  transit: "#49C9E8",
  housing: "#F3B84B",
  park: "#57D39A",
  emergency: "#F2775D",
};

export const needColor: Record<NeedType, string> = {
  healthcare: "#FF6B7A",
  education: "#9B8AFB",
  transit: "#49C9E8",
  housing: "#F3B84B",
  greenspace: "#57D39A",
  emergency: "#F2775D",
};

/**
 * Animation timings, in milliseconds. One language across the product:
 * the bigger the change, the longer the user is given to read it.
 */
export const duration = {
  micro: 150,
  control: 180,
  panel: 260,
  mapLayer: 560,
  mode: 620,
  story: 950,
} as const;

export const easing = {
  out: "cubic-bezier(0.16, 1, 0.3, 1)",
  gsap: "power3.out",
  gsapSoft: "power2.out",
} as const;

/**
 * Stacking contexts. Nothing in the product invents its own z-index; it picks
 * a layer from this list.
 */
export const z = {
  mapOverlay: 10,
  panel: 20,
  chrome: 30,
  drawer: 40,
  toast: 50,
  modal: 60,
  grain: 70,
} as const;

/** Parses "#RRGGBB" into channel values. */
export function hexToRgb(hex: string): [number, number, number] {
  const v = hex.replace("#", "");
  return [
    parseInt(v.slice(0, 2), 16),
    parseInt(v.slice(2, 4), 16),
    parseInt(v.slice(4, 6), 16),
  ];
}

/**
 * Samples the need ramp at `t` (0-1) with linear interpolation, so the heat
 * surface reads as a continuous gradient rather than six visible bands.
 */
export function sampleNeedRamp(t: number): [number, number, number] {
  const clamped = Math.min(1, Math.max(0, t));
  const scaled = clamped * (needRamp.length - 1);
  const i = Math.min(needRamp.length - 2, Math.floor(scaled));
  const f = scaled - i;
  const a = hexToRgb(needRamp[i]);
  const b = hexToRgb(needRamp[i + 1]);
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}

export function needRampCss(t: number, alpha = 1): string {
  const [r, g, b] = sampleNeedRamp(t);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** CSS gradient string for legends. */
export const needRampGradient = `linear-gradient(90deg, ${needRamp.join(", ")})`;
