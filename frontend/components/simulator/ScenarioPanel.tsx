"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useEffect } from "react";
import { WHAT_IF_SCENARIOS } from "@/data/defaults";
import { formatCost, formatMetric, formatTimestamp } from "@/lib/format";
import { useSylvida } from "@/store/useSylvida";
import { Button } from "@/components/shared/Button";
import { Collapsible } from "@/components/shared/Panel";

/** Saved scenarios and the what-if probes, both collapsed by default. */
export function ScenarioPanel() {
  const scenarios = useSylvida((s) => s.scenarios);
  const loadScenarios = useSylvida((s) => s.loadScenarios);
  const deleteScenario = useSylvida((s) => s.deleteScenario);

  useEffect(() => {
    void loadScenarios();
  }, [loadScenarios]);

  return (
    <>
      <Collapsible title="Saved scenarios" summary={String(scenarios.length)}>
        {scenarios.length === 0 ? (
          <p className="text-[12px] leading-relaxed text-ink-4">
            Nothing saved yet. Save a scenario from the top bar to compare two
            approaches side by side.
          </p>
        ) : (
          <div className="space-y-1.5">
            {scenarios.map((scenario) => (
              <div
                key={scenario.id}
                className="rounded-sm border border-line-soft bg-surface-2 px-3 py-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[12.5px] font-medium text-ink">
                      {scenario.name}
                    </p>
                    <p className="tabular mt-0.5 text-[11px] text-ink-4">
                      {formatTimestamp(scenario.createdAt)} -{" "}
                      {formatCost(scenario.budget)}
                    </p>
                  </div>
                  <button
                    onClick={() => void deleteScenario(scenario.id)}
                    aria-label={`Delete ${scenario.name}`}
                    className="shrink-0 rounded-xs p-1 text-ink-4 transition-colors duration-150 hover:text-danger"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 border-t border-line-soft pt-2">
                  <Cell
                    label="Healthcare"
                    value={`${scenario.metrics.healthcareCoverage.toFixed(0)}%`}
                  />
                  <Cell
                    label="Transit"
                    value={`${scenario.metrics.transitCoverage.toFixed(0)}%`}
                  />
                  <Cell
                    label="Underserved"
                    value={formatMetric(
                      scenario.metrics.underservedPopulation,
                      "people",
                    )}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Collapsible>

      <WhatIfSection />
    </>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.1em] text-ink-4">
        {label}
      </p>
      <p className="tabular mt-0.5 text-[12px] text-ink-2">{value}</p>
    </div>
  );
}

/**
 * What-if probes.
 *
 * Each one perturbs the plan or the demand side and re-runs the same engine,
 * so the numbers stay comparable with everything else on screen.
 */
function WhatIfSection() {
  const run = useSylvida((s) => s.runWhatIf);
  const busy = useSylvida((s) => s.whatIfBusy);
  const outcome = useSylvida((s) => s.whatIf);
  const clear = useSylvida((s) => s.clearWhatIf);

  return (
    <Collapsible title="What if" summary={`${WHAT_IF_SCENARIOS.length}`}>
      <div className="space-y-1.5">
        {WHAT_IF_SCENARIOS.map((scenario) => (
          <button
            key={scenario.id}
            onClick={() => void run(scenario.id)}
            disabled={busy !== null}
            className={`flex w-full items-start gap-2 rounded-sm border px-3 py-2.5 text-left transition-colors duration-150 ${
              outcome?.id === scenario.id
                ? "border-brand/35 bg-brand/8"
                : "border-line-soft bg-surface-2 hover:border-line hover:bg-surface-3"
            } disabled:opacity-60`}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] text-ink">
                {scenario.label}
              </span>
              <span className="mt-0.5 block text-[11px] leading-snug text-ink-4">
                {scenario.description}
              </span>
            </span>
            {busy === scenario.id ? (
              <Loader2 size={13} className="mt-0.5 animate-spin text-brand" />
            ) : null}
          </button>
        ))}
      </div>

      {outcome ? (
        <div className="mt-3 rounded-sm border border-line bg-surface-2 px-3 py-3">
          <p className="text-[12px] font-medium text-ink">{outcome.label}</p>
          <div className="mt-2 space-y-1">
            {outcome.deltas.map((delta) => {
              const change = delta.after - delta.before;
              const good = delta.invert ? change < 0 : change > 0;
              if (Math.abs(change) < 0.05) return null;
              return (
                <div
                  key={delta.key}
                  className="flex items-baseline justify-between gap-3"
                >
                  <span className="text-[11.5px] text-ink-3">
                    {delta.label}
                  </span>
                  <span
                    className={`tabular text-[11.5px] ${good ? "text-ok" : "text-attention"}`}
                  >
                    {change > 0 ? "+" : "−"}
                    {formatMetric(Math.abs(change), delta.unit)}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-2.5 border-t border-line-soft pt-2 text-[11px] leading-relaxed text-ink-4">
            {outcome.note}
          </p>
          <Button size="sm" variant="ghost" className="mt-2" onClick={clear}>
            Clear
          </Button>
        </div>
      ) : null}
    </Collapsible>
  );
}
