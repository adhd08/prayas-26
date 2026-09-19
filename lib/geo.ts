/** Geometry helpers shared by the map, the story scene and the engine. */

import type { LatLng, Ring } from "@/types";

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in kilometres. */
export function distanceKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** Ray-casting point-in-polygon test. */
export function pointInRing(point: LatLng, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].lng;
    const yi = ring[i].lat;
    const xj = ring[j].lng;
    const yj = ring[j].lat;
    const intersects =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function ringCentroid(ring: Ring): LatLng {
  let area = 0;
  let lat = 0;
  let lng = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const cross = ring[j].lng * ring[i].lat - ring[i].lng * ring[j].lat;
    area += cross;
    lng += (ring[j].lng + ring[i].lng) * cross;
    lat += (ring[j].lat + ring[i].lat) * cross;
  }
  if (area === 0) return ring[0];
  const f = 1 / (3 * area);
  return { lat: lat * f, lng: lng * f };
}

/** Planar approximation, adequate at city scale. Square kilometres. */
export function ringAreaKm2(ring: Ring): number {
  const latScale = 111.32;
  const lngScale = 111.32 * Math.cos(toRad(ringCentroid(ring).lat));
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    area +=
      ring[j].lng * lngScale * (ring[i].lat * latScale) -
      ring[i].lng * lngScale * (ring[j].lat * latScale);
  }
  return Math.abs(area / 2);
}

export function boundsOf(rings: Ring[]): {
  south: number;
  west: number;
  north: number;
  east: number;
} {
  let south = Infinity;
  let west = Infinity;
  let north = -Infinity;
  let east = -Infinity;
  for (const ring of rings) {
    for (const p of ring) {
      if (p.lat < south) south = p.lat;
      if (p.lat > north) north = p.lat;
      if (p.lng < west) west = p.lng;
      if (p.lng > east) east = p.lng;
    }
  }
  return { south, west, north, east };
}

export const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Maps `v` from one range to another, clamped to the output range. */
export function mapRange(
  v: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number {
  if (inMax === inMin) return outMin;
  return clamp(
    outMin + ((v - inMin) / (inMax - inMin)) * (outMax - outMin),
    Math.min(outMin, outMax),
    Math.max(outMin, outMax),
  );
}

/** Smooth 0-1 ramp used for scroll windows and falloff curves. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0 || 1), 0, 1);
  return t * t * (3 - 2 * t);
}
