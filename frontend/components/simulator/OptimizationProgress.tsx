"use client";

import { Check, Loader2 } from "lucide-react";
import { OPTIMIZATION_STEPS } from "@/lib/simulation/optimizer";
import { useSylvida } from "@/store/useSylvida";
import { Button } from "@/components/shared/Button";

/**
 * Optimization progress.
 *
 * A narrow overlay on the map rather than a blocking modal, because the whole
 * point is to watch candidate sites appear and get filtered underneath it.
 * The steps are the real stages of the search, in the order they run.
 */
export function OptimizationProgress() {
  const phase = useSylvida((s) => s.optimizationPhase);
  const progress = useSylvida((s) => s.optimizationProgress);
  const completed = useSylvida((s) => s.completedSteps);
  const candidates = useSylvida((s) => s.candidates);
  const revealed = useSylvida((s) => s.revealedCandidates);
  const cancel = useSylvida((s) => s.cancelOptimization);

  if (phase !== "running") return null;

  const iteration = Math.max(
    1,
    Math.round(progress * (candidates.at(-1)?.iteration ?? 24)),
  );
  const rejected = candidates
    .slice(0, revealed)
    .filter((c) => c.rejectedBy).length;

  return (
    <div className="pointer-events-auto absolute left-1/2 top-5 z-[25] w-[336px] -translate-x-1/2 rounded-lg border border-line bg-surface/95 p-4 shadow-float backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <Loader2 size={14} className="animate-spin text-brand" />
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.13em] text-ink">
          Optimizing city
        </h3>
        <span className="tabular ml-auto text-[11.5px] text-ink-3">
          {Math.round(progress * 100)}%
        </span>
      </div>

      <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-line">
        <div
          className="h-full rounded-full bg-brand transition-[width] duration-100 ease-linear"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      <ol className="mt-3.5 space-y-1.5">
        {OPTIMIZATION_STEPS.map((step) => {
          const done = completed.includes(step.id);
          const active = !done && progress < step.at;
          const current =
            !done &&
            OPTIMIZATION_STEPS.filter((s) => !completed.includes(s.id))[0]
              ?.id === step.id;
          return (
            <li key={step.id} className="flex items-center gap-2">
              <span
                className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border ${
                  done
                    ? "border-ok/60 bg-ok/15 text-ok"
                    : current
                      ? "border-brand/60 bg-brand/12"
                      : "border-line"
                }`}
              >
                {done ? <Check size={9} /> : null}
                {current ? (
                  <span className="h-[5px] w-[5px] rounded-full bg-brand" />
                ) : null}
              </span>
              <span
                className={`text-[12px] ${
                  done ? "text-ink-3" : current ? "text-ink" : "text-ink-4"
                }`}
              >
                {step.label}
              </span>
              {active && !current ? null : null}
            </li>
          );
        })}
      </ol>

      <div className="mt-3.5 flex items-center justify-between border-t border-line-soft pt-3">
        <div>
          <p className="tabular text-[11.5px] text-ink-2">
            Iteration {iteration}
          </p>
          <p className="tabular mt-0.5 text-[11px] text-ink-4">
            {revealed} candidate sites scored, {rejected} excluded by
            constraints
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={cancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
