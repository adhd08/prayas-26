"use client";

import { AlertTriangle, PencilLine, SplitSquareHorizontal } from "lucide-react";
import { useState } from "react";
import { FACILITY_ORDER, FACILITY_SPECS } from "@/data/facilityCatalog";
import {
  formatCost,
  formatMetric,
  formatPeopleExact,
  formatPercent,
} from "@/lib/format";
import { facilityColor } from "@/lib/tokens";
import { useSylvida } from "@/store/useSylvida";
import { FACILITY_ICONS } from "@/components/shared/facilityGlyphs";
import { Button } from "@/components/shared/Button";
import { Segmented } from "@/components/shared/Controls";
import { Readout, SectionHeader } from "@/components/shared/Panel";
import type { MetricDelta, Tradeoff } from "@/types";

type View = "summary" | "tradeoffs" | "method";

/**
 * Optimization result.
 *
 * Deliberately called a best-found configuration. Greedy marginal-gain search
 * does not prove optimality, and the inputs are demo data, so claiming an
 * optimal city would be a claim the product cannot support.
 */
export function ResultsPanel() {
  const phase = useSylvida((s) => s.optimizationPhase);
  const result = useSylvida((s) => s.result);
  const infeasible = useSylvida((s) => s.infeasible);
  const adopt = useSylvida((s) => s.adoptResult);
  const toggleComparison = useSylvida((s) => s.toggleComparison);
  const comparing = useSylvida((s) => s.comparisonOpen);
  const [view, setView] = useState<View>("summary");

  if (phase === "infeasible" && infeasible) {
    return <Infeasible reason={infeasible.reason} suggestions={infeasible.suggestions} />;
  }

  if (!result) {
    return (
      <div>
        <SectionHeader title="Result" />
        <p className="px-4 pb-5 text-[12.5px] leading-relaxed text-ink-3">
          Configure resources and priorities, then run the optimizer to
          generate a city plan.
        </p>
      </div>
    );
  }

  const counts = FACILITY_ORDER.map((type) => ({
    type,
    count: result.facilities.filter(
      (f) => f.type === type && f.review !== "rejected",
    ).length,
  })).filter((row) => row.count > 0);

  const rejected = result.facilities.filter(
    (f) => f.review === "rejected",
  ).length;

  return (
    <div>
      <SectionHeader
        title="Best-found configuration"
        hint="Based on current priorities, constraints and available resources"
      />

      <div className="px-4">
        <div className="flex flex-wrap gap-1.5">
          {counts.map(({ type, count }) => {
            const Icon = FACILITY_ICONS[type];
            return (
              <span
                key={type}
                className="flex items-center gap-1.5 rounded-sm border border-line-soft bg-surface-2 px-2 py-1.5"
              >
                <Icon
                  size={13}
                  color={facilityColor[type]}
                  strokeWidth={1.75}
                />
                <span className="tabular text-[12px] text-ink">{count}</span>
                <span className="text-[11.5px] text-ink-4">
                  {FACILITY_SPECS[type].label}
                </span>
              </span>
            );
          })}
        </div>

        <div className="mt-3 rounded-sm border border-line-soft bg-surface-2 px-3 py-2.5">
          <Readout label="Capital committed" value={formatCost(result.cost)} />
          <Readout
            label="Budget headroom"
            value={formatCost(result.budget - result.cost)}
            tone="good"
          />
          <Readout
            label="Candidate sites scored"
            value={result.candidatesEvaluated.toLocaleString("en-IN")}
          />
          <Readout
            label="Search iterations"
            value={String(result.iterations)}
          />
          {rejected > 0 ? (
            <Readout
              label="Rejected by you"
              value={`${rejected} site${rejected === 1 ? "" : "s"}`}
              tone="warn"
            />
          ) : null}
        </div>
      </div>

      <div className="px-4 pt-4">
        <Segmented
          size="sm"
          value={view}
          onChange={setView}
          options={[
            { value: "summary", label: "Impact" },
            { value: "tradeoffs", label: "Trade-offs" },
            { value: "method", label: "Assumptions" },
          ]}
        />
      </div>

      <div className="px-4 pb-4 pt-3">
        {view === "summary" ? <Deltas deltas={result.deltas} /> : null}
        {view === "tradeoffs" ? (
          <Tradeoffs tradeoffs={result.tradeoffs} />
        ) : null}
        {view === "method" ? (
          <ul className="space-y-2">
            {result.assumptions.map((item) => (
              <li
                key={item}
                className="border-l border-line pl-3 text-[12px] leading-relaxed text-ink-3"
              >
                {item}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 border-t border-line-soft px-4 py-3.5">
        <Button
          variant={comparing ? "primary" : "secondary"}
          block
          icon={<SplitSquareHorizontal size={14} />}
          onClick={() => toggleComparison()}
        >
          {comparing ? "Hide before and after" : "Compare before and after"}
        </Button>
        <Button
          block
          variant="secondary"
          icon={<PencilLine size={14} />}
          onClick={adopt}
        >
          Adopt and edit plan
        </Button>
        <p className="text-[11px] leading-snug text-ink-4">
          Adopting moves every accepted site into your plan, where you can move
          or remove any of them. Sylvida recommends; you decide.
        </p>
      </div>
    </div>
  );
}

function Deltas({ deltas }: { deltas: MetricDelta[] }) {
  return (
    <div className="space-y-2">
      {deltas.map((delta) => {
        const change = delta.after - delta.before;
        const good = delta.invert ? change < 0 : change > 0;
        return (
          <div
            key={delta.key}
            className="rounded-sm border border-line-soft bg-surface-2 px-3 py-2.5"
          >
            <div className="flex items-baseline justify-between">
              <span className="text-[12px] text-ink-2">{delta.label}</span>
              <span
                className={`tabular text-[11.5px] ${good ? "text-ok" : "text-attention"}`}
              >
                {change > 0 ? "+" : "−"}
                {formatMetric(Math.abs(change), delta.unit)}
              </span>
            </div>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="tabular text-[14px] text-ink-3">
                {formatMetric(delta.before, delta.unit)}
              </span>
              <span className="text-ink-4">{"→"}</span>
              <span className="tabular text-[16px] text-ink">
                {formatMetric(delta.after, delta.unit)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Tradeoffs({ tradeoffs }: { tradeoffs: Tradeoff[] }) {
  const max = Math.max(
    ...tradeoffs
      .filter((t) => t.unit === "percentagePoints")
      .map((t) => Math.abs(t.change)),
    1,
  );

  return (
    <div className="space-y-2.5">
      <p className="text-[12px] leading-relaxed text-ink-3">
        Objectives compete for one budget. These are the choices this
        configuration made.
      </p>
      {tradeoffs.map((tradeoff) => {
        const isPoints = tradeoff.unit === "percentagePoints";
        const width = isPoints
          ? (Math.abs(tradeoff.change) / max) * 50
          : 0;
        const positive = tradeoff.change > 0;
        return (
          <div key={tradeoff.label}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[12px] text-ink-2">{tradeoff.label}</span>
              <span
                className={`tabular text-[12px] ${
                  !isPoints
                    ? "text-ink-2"
                    : positive
                      ? "text-ok"
                      : "text-attention"
                }`}
              >
                {tradeoff.unit === "crore"
                  ? formatCost(tradeoff.change)
                  : tradeoff.unit === "km2"
                    ? `${tradeoff.change.toFixed(2)} km²`
                    : tradeoff.unit === "people"
                      ? formatPeopleExact(tradeoff.change)
                      : `${positive ? "+" : "−"}${Math.abs(tradeoff.change).toFixed(1)} pts`}
              </span>
            </div>
            {isPoints ? (
              <div className="relative mt-1 h-[3px]">
                <span className="absolute left-1/2 top-0 h-full w-px bg-line" />
                <span
                  className={`absolute top-0 h-full rounded-full ${
                    positive ? "bg-ok" : "bg-attention"
                  }`}
                  style={{
                    width: `${width}%`,
                    left: positive ? "50%" : `${50 - width}%`,
                  }}
                />
              </div>
            ) : null}
            <p className="mt-1 text-[11px] leading-snug text-ink-4">
              {tradeoff.note}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function Infeasible({
  reason,
  suggestions,
}: {
  reason: string;
  suggestions: string[];
}) {
  const runOptimization = useSylvida((s) => s.runOptimization);
  return (
    <div>
      <SectionHeader title="No valid configuration found" />
      <div className="px-4">
        <div className="flex gap-2.5 rounded-sm border border-warn/30 bg-warn/8 px-3 py-3">
          <AlertTriangle size={15} className="mt-[1px] shrink-0 text-warn" />
          <p className="text-[12.5px] leading-relaxed text-ink-2">{reason}</p>
        </div>
        <p className="mt-3.5 text-[11px] font-semibold uppercase tracking-[0.13em] text-ink-3">
          What would help
        </p>
        <ul className="mt-2 space-y-2">
          {suggestions.map((suggestion) => (
            <li
              key={suggestion}
              className="border-l border-line pl-3 text-[12px] leading-relaxed text-ink-3"
            >
              {suggestion}
            </li>
          ))}
        </ul>
        <Button
          className="mt-4"
          block
          onClick={() => void runOptimization()}
        >
          Run again
        </Button>
      </div>
    </div>
  );
}

export const PERCENT = formatPercent;
