/**
 * Runtime configuration.
 *
 * Endpoint URLs and the demo city live here so no component ever hardcodes
 * either. Flipping NEXT_PUBLIC_USE_MOCK_DATA to "false" is the single switch
 * that moves lib/api off the bundled mock services.
 */

export const USE_MOCK_DATA =
  process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

function num(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Central Kolkata. Replaceable without touching any component. */
export const DEMO_CITY = {
  id: "central-kolkata",
  name: "Central Kolkata",
  lat: num(process.env.NEXT_PUBLIC_DEMO_CITY_LAT, 22.5726),
  lng: num(process.env.NEXT_PUBLIC_DEMO_CITY_LNG, 88.3639),
  zoom: num(process.env.NEXT_PUBLIC_DEMO_CITY_ZOOM, 13),
  currency: "INR",
} as const;

/** Cities the selector offers. Only the demo city has bundled data. */
export const CITY_OPTIONS = [
  { id: "central-kolkata", name: "Central Kolkata", available: true },
  { id: "delhi", name: "Delhi", available: false },
  { id: "bengaluru", name: "Bengaluru", available: false },
  { id: "mumbai", name: "Mumbai", available: false },
] as const;

export const APP_VERSION = "Sylvida Prototype v0.1";

/**
 * Basemap.
 *
 * Standard OpenStreetMap tiles, which need no API key, turned dark by the CSS
 * filter on `.leaflet-tile-pane` in globals.css. Hosted dark styles (CARTO,
 * Stadia, Mapbox) all require a key now, and a demo that breaks without one is
 * not worth the slightly nicer cartography. Attribution is required and is
 * rendered by Leaflet's attribution control.
 *
 * To swap in a keyed dark style later, set `url` and drop the tile-pane filter.
 */
export const BASEMAP = {
  url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19,
} as const;

/** Minimum width below which the desktop layout stops being honest. */
export const MIN_DESKTOP_WIDTH = 1080;
