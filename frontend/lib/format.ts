/** Number and unit formatting. One vocabulary for every readout. */

import type { MetricUnit } from "@/types";

export function formatPercent(v: number, digits = 0): string {
  return `${v.toFixed(digits)}%`;
}

/** 18420 becomes "18,420"; 1_840_000 becomes "1.84M". */
export function formatPeople(v: number): string {
  const n = Math.round(v);
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 100_000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString("en-IN");
}

export function formatPeopleExact(v: number): string {
  return Math.round(v).toLocaleString("en-IN");
}

/** Crore INR. */
export function formatCost(v: number): string {
  return `₹${Math.round(v).toLocaleString("en-IN")} Cr`;
}

export function formatMinutes(v: number): string {
  return `${v.toFixed(0)} min`;
}

export function formatKm(v: number, digits = 1): string {
  return `${v.toFixed(digits)} km`;
}

export function formatMetric(value: number, unit: MetricUnit): string {
  switch (unit) {
    case "percent":
      return formatPercent(value);
    case "people":
      return formatPeople(value);
    case "minutes":
      return formatMinutes(value);
    case "crore":
      return formatCost(value);
    case "km2":
      return `${value.toFixed(1)} km²`;
  }
}

/** Signed change with the sign always shown, for delta readouts. */
export function formatSigned(value: number, unit: MetricUnit): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${formatMetric(Math.abs(value), unit)}`;
}

export function formatPoints(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(0)} pts`;
}

export function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Sentence case for a need or facility id. */
export function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
