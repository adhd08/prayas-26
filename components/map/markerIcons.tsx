"use client";

/**
 * Facility markers.
 *
 * Leaflet wants an HTML string, so the Lucide glyph is rendered to markup once
 * per icon variant and cached. Origin is carried by the marker shape, not by
 * colour alone: existing stock is solid, an optimizer proposal is dashed, and
 * a site the planner placed has a filled accent ring.
 */

import L from "leaflet";
import { renderToStaticMarkup } from "react-dom/server";
import { FACILITY_ICONS } from "@/components/shared/facilityGlyphs";
import { facilityColor } from "@/lib/tokens";
import type { FacilityOrigin, FacilityType } from "@/types";

const cache = new Map<string, L.DivIcon>();

export function facilityIcon(
  type: FacilityType,
  origin: FacilityOrigin,
  state: "default" | "selected" | "rejected" = "default",
): L.DivIcon {
  const key = `${type}:${origin}:${state}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const color = facilityColor[type];
  const Glyph = FACILITY_ICONS[type];
  const size = state === "selected" ? 32 : 28;

  const border =
    origin === "proposed"
      ? `2px dashed ${color}`
      : origin === "user"
        ? `2px solid ${color}`
        : `1px solid ${color}99`;

  const background =
    origin === "existing" ? "rgba(21,29,39,0.94)" : "rgba(11,15,20,0.92)";

  const glyph = renderToStaticMarkup(
    <Glyph
      size={state === "selected" ? 16 : 14}
      color={state === "rejected" ? "#4A5562" : color}
      strokeWidth={1.75}
    />,
  );

  const icon = L.divIcon({
    className: "sylvida-marker",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<span class="sylvida-marker-shell" style="
        width:${size}px;height:${size}px;
        border:${border};
        background:${background};
        opacity:${state === "rejected" ? 0.4 : 1};
        box-shadow:${state === "selected" ? `0 0 0 3px ${color}33` : "0 2px 8px rgba(0,0,0,0.45)"};
      ">${glyph}</span>`,
  });

  cache.set(key, icon);
  return icon;
}

/** Translucent preview that follows the cursor while dragging. */
export function ghostIcon(type: FacilityType, valid: boolean): L.DivIcon {
  const key = `ghost:${type}:${valid}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const color = valid ? facilityColor[type] : "#FF5C68";
  const Glyph = FACILITY_ICONS[type];
  const glyph = renderToStaticMarkup(
    <Glyph size={15} color={color} strokeWidth={1.75} />,
  );

  const icon = L.divIcon({
    className: "sylvida-marker sylvida-ghost",
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    html: `<span class="sylvida-marker-shell" style="
        width:30px;height:30px;
        border:2px dashed ${color};
        background:rgba(11,15,20,0.78);
      ">${glyph}</span>`,
  });

  cache.set(key, icon);
  return icon;
}
