"use client";

import { NEIGHBOURHOODS } from "@/data/city";
import {
  formatCost,
  formatMinutes,
  formatPeople,
  formatPercent,
} from "@/lib/format";
import { useSylvida } from "@/store/useSylvida";
import { AnimatedNumber } from "@/components/shared/AnimatedNumber";
import { InfoDot } from "@/components/shared/Overlay";

/**
 * Live metrics.
 *
 * Always on screen, because the product's whole argument is that a change over
 * there produces a consequence down here. Numbers animate only when they
 * change, so the bar is quiet while the planner is reading it.
 */
export function MetricsBar() {
  const metrics = useSylvida((s) => s.metrics);
  const budget = useSylvida((s) => s.budget);

  return (
    <footer
      className="flex h-[var(--metrics-h)] shrink-0 items-stretch gap-px overflow-x-auto border-t border-line bg-surface"
      style={{ zIndex: 20 }}
    >
      <Metric
        label="Population"
        value={metrics.population}
        format={formatPeople}
        detail="Sum of the sixteen modelled wards, including residents added by new housing."
      />
      <Metric
        label="Healthcare"
        value={metrics.healthcareCoverage}
        format={(v) => formatPercent(v, 1)}
        detail="Population-weighted access to a hospital, after distance falloff and capacity pressure."
      />
      <Metric
        label="Education"
        value={metrics.educationCoverage}
        format={(v) => formatPercent(v, 1)}
        detail="Population-weighted access to a school within its catchment."
      />
      <Metric
        label="Transit"
        value={metrics.transitCoverage}
        format={(v) => formatPercent(v, 1)}
        detail="Share of residents inside the 1.8 km walk shed of a stop."
      />
      <Metric
        label="Green space"
        value={metrics.greenspaceCoverage}
        format={(v) => formatPercent(v, 1)}
        detail="Open-space access per resident. Falls when a ward densifies without new parks."
      />
      <Metric
        label="Underserved"
        value={metrics.underservedPopulation}
        format={formatPeople}
        tone="equity"
        detail="Residents whose worst-served need sits above the adequacy threshold of 70 out of 100."
      />
      <Metric
        label="Average trip"
        value={metrics.averageTravelMinutes}
        format={formatMinutes}
        detail="Mean journey to the nearest hospital, school, stop and park at 18 km/h."
      />
      <Metric
        label="Committed"
        value={metrics.committedCost}
        format={formatCost}
        detail={`Capital committed by facilities in the current plan, against a budget of ${formatCost(budget)}.`}
        warn={metrics.committedCost > budget}
      />
    </footer>
  );
}

function Metric({
  label,
  value,
  format,
  detail,
  tone,
  warn,
}: {
  label: string;
  value: number;
  format: (value: number) => string;
  detail: string;
  tone?: "equity";
  warn?: boolean;
}) {
  return (
    <div className="flex min-w-[124px] flex-1 flex-col justify-center bg-surface px-4 py-3">
      <div className="flex items-center gap-1">
        <span className="text-[10.5px] font-medium uppercase tracking-[0.13em] text-ink-4">
          {label}
        </span>
        <InfoDot title={label}>
          <p className="text-[12px] leading-relaxed text-ink-2">{detail}</p>
          <p className="mt-2 border-t border-line-soft pt-2 text-[11px] text-ink-4">
            Prototype estimate based on demo data.
          </p>
        </InfoDot>
      </div>
      <AnimatedNumber
        value={value}
        format={format}
        className={`tabular mt-1 text-[19px] leading-none ${
          warn ? "text-warn" : tone === "equity" ? "text-attention" : "text-ink"
        }`}
      />
    </div>
  );
}

export const WARD_TOTAL = NEIGHBOURHOODS.length;
