"use client";

import { Sparkles, Wand2 } from "lucide-react";
import { useState } from "react";
import {
  BUDGET_BOUNDS,
  PRIORITY_LABELS,
  PRIORITY_ORDER,
} from "@/data/defaults";
import { FACILITY_ORDER, FACILITY_SPECS } from "@/data/facilityCatalog";
import { SCENARIO_PRESETS } from "@/data/scenarios";
import { parsePlanningGoal, QUICK_GOALS } from "@/lib/assistant/planningParser";
import { formatCost } from "@/lib/format";
import { facilityColor, needColor } from "@/lib/tokens";
import { useSylvida } from "@/store/useSylvida";
import { FACILITY_ICONS } from "@/components/shared/facilityGlyphs";
import { Button } from "@/components/shared/Button";
import { Slider, Stepper, Toggle } from "@/components/shared/Controls";
import { Collapsible, SectionHeader } from "@/components/shared/Panel";
import type { ConstraintId, PriorityId } from "@/types";

export function OptimizePanel() {
  const resources = useSylvida((s) => s.resources);
  const setResource = useSylvida((s) => s.setResource);
  const budget = useSylvida((s) => s.budget);
  const setBudget = useSylvida((s) => s.setBudget);
  const priorities = useSylvida((s) => s.priorities);
  const setPriority = useSylvida((s) => s.setPriority);
  const constraints = useSylvida((s) => s.constraints);
  const updateConstraint = useSylvida((s) => s.updateConstraint);
  const loadPreset = useSylvida((s) => s.loadPreset);
  const runOptimization = useSylvida((s) => s.runOptimization);
  const phase = useSylvida((s) => s.optimizationPhase);

  const requested = FACILITY_ORDER.reduce(
    (sum, type) => sum + resources[type] * FACILITY_SPECS[type].cost,
    0,
  );
  const overBudget = requested > budget;

  return (
    <div>
      <SectionHeader
        title="Optimize city"
        hint="Set what is available, what matters, and what is off limits"
      />

      <GoalField />

      <div className="border-t border-line-soft">
        <SectionHeader title="Available resources" />
        <div className="px-4 pb-3">
          {FACILITY_ORDER.map((type) => {
            const Icon = FACILITY_ICONS[type];
            return (
              <Stepper
                key={type}
                label={FACILITY_SPECS[type].label}
                sub={`${formatCost(FACILITY_SPECS[type].cost)} each`}
                value={resources[type]}
                max={40}
                icon={
                  <Icon
                    size={14}
                    color={facilityColor[type]}
                    strokeWidth={1.75}
                  />
                }
                onChange={(value) => setResource(type, value)}
              />
            );
          })}
        </div>
      </div>

      <div className="border-t border-line-soft">
        <SectionHeader title="Budget" />
        <div className="px-4 pb-4">
          <Slider
            label="Capital available"
            value={budget}
            min={BUDGET_BOUNDS.min}
            max={BUDGET_BOUNDS.max}
            step={BUDGET_BOUNDS.step}
            suffix=" Cr"
            onChange={setBudget}
          />
          <div className="mt-2 space-y-1 rounded-sm border border-line-soft bg-surface-2 px-3 py-2.5">
            <Row label="Requested mix" value={formatCost(requested)} />
            <Row label="Budget" value={formatCost(budget)} />
            <Row
              label={overBudget ? "Short by" : "Headroom"}
              value={formatCost(Math.abs(budget - requested))}
              tone={overBudget ? "warn" : "muted"}
            />
          </div>
          {overBudget ? (
            <p className="mt-2 text-[11.5px] leading-snug text-warn">
              The requested mix costs more than the budget. The search will
              stop once the money runs out and report what it could not place.
            </p>
          ) : null}
        </div>
      </div>

      <div className="border-t border-line-soft">
        <SectionHeader
          title="Planning priorities"
          hint="Relative weights, not percentages of a budget"
        />
        <div className="px-4 pb-3">
          {PRIORITY_ORDER.map((id) => (
            <Slider
              key={id}
              label={PRIORITY_LABELS[id]}
              value={priorities[id]}
              accent={accentFor(id)}
              onChange={(value) => setPriority(id, value)}
            />
          ))}
        </div>
      </div>

      <Collapsible
        title="Real-world constraints"
        summary={`${constraints.filter((c) => c.enabled).length} on`}
      >
        <div className="space-y-1">
          {constraints.map((constraint) => (
            <div
              key={constraint.id}
              className="rounded-sm border border-line-soft bg-surface-2 px-3 py-2"
            >
              <Toggle
                label={constraint.label}
                description={constraint.description}
                checked={constraint.enabled}
                onChange={(enabled) =>
                  updateConstraint(constraint.id, { enabled })
                }
              />
              {constraint.enabled && constraint.value !== undefined ? (
                <Slider
                  label="Threshold"
                  value={constraint.value}
                  min={constraint.min ?? 0}
                  max={constraint.max ?? 10}
                  step={constraint.step ?? 1}
                  suffix={` ${constraint.unit ?? ""}`}
                  onChange={(value) =>
                    updateConstraint(constraint.id, { value })
                  }
                />
              ) : null}
              {constraint.enabled && constraint.modes ? (
                <div className="mt-1.5 flex gap-1">
                  {constraint.modes.map((mode) => (
                    <button
                      key={mode}
                      onClick={() => updateConstraint(constraint.id, { mode })}
                      className={`rounded-xs px-2 py-1 text-[11px] transition-colors duration-150 ${
                        constraint.mode === mode
                          ? "bg-brand/14 text-brand"
                          : "text-ink-4 hover:text-ink-2"
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </Collapsible>

      <Collapsible title="Example scenarios" summary={`${SCENARIO_PRESETS.length}`}>
        <div className="space-y-1.5">
          {SCENARIO_PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => loadPreset(preset)}
              className="w-full rounded-sm border border-line-soft bg-surface-2 px-3 py-2.5 text-left transition-colors duration-150 hover:border-line hover:bg-surface-3"
            >
              <span className="block text-[12.5px] font-medium text-ink">
                {preset.name}
              </span>
              <span className="mt-1 block text-[11.5px] leading-snug text-ink-4">
                {preset.description}
              </span>
            </button>
          ))}
        </div>
      </Collapsible>

      <div className="sticky bottom-0 border-t border-line bg-surface px-4 py-3.5">
        <Button
          variant="primary"
          size="lg"
          block
          icon={<Sparkles size={15} />}
          disabled={phase === "running"}
          onClick={() => void runOptimization()}
        >
          {phase === "running" ? "Optimizing" : "Optimize city"}
        </Button>
        <p className="mt-2 text-[11.5px] leading-snug text-ink-4">
          Finds a configuration that balances impact, cost and constraints.
          Reports a best-found result, not a proven optimum.
        </p>
      </div>
    </div>
  );
}

function accentFor(id: PriorityId): string | undefined {
  if (id === "healthcare") return needColor.healthcare;
  if (id === "education") return needColor.education;
  if (id === "transit") return needColor.transit;
  if (id === "housing") return needColor.housing;
  if (id === "greenspace") return needColor.greenspace;
  return undefined;
}

function Row({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "muted" | "warn";
}) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-[11.5px] text-ink-3">{label}</span>
      <span
        className={`tabular text-[12px] ${
          tone === "warn"
            ? "text-warn"
            : tone === "muted"
              ? "text-ink-2"
              : "text-ink"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * Natural-language planning goal.
 *
 * The phrase is mapped to concrete sliders and shown back as the change it
 * caused, so the planner can see exactly what the product understood rather
 * than trusting an invisible interpretation.
 */
function GoalField() {
  const goalText = useSylvida((s) => s.goalText);
  const setGoalText = useSylvida((s) => s.setGoalText);
  const applyGoal = useSylvida((s) => s.applyGoal);
  const feedback = useSylvida((s) => s.goalFeedback);
  const [touched, setTouched] = useState(false);

  const submit = () => {
    setTouched(true);
    applyGoal(parsePlanningGoal(goalText));
  };

  return (
    <div className="px-4 pb-4">
      <label
        htmlFor="goal"
        className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.13em] text-ink-3"
      >
        Describe your goal
      </label>
      <textarea
        id="goal"
        rows={3}
        value={goalText}
        onChange={(e) => setGoalText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
        }}
        placeholder="Prioritize healthcare access in underserved wards while keeping costs below 800 Cr"
        className="w-full resize-none rounded-sm border border-line bg-surface-3 px-3 py-2.5 text-[12.5px] leading-relaxed text-ink outline-none transition-colors duration-150 placeholder:text-ink-4 focus:border-brand/50"
      />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {QUICK_GOALS.map((goal) => (
          <button
            key={goal}
            onClick={() => setGoalText(goal)}
            className="rounded-xs border border-line-soft px-2 py-1 text-[11px] text-ink-3 transition-colors duration-150 hover:border-line hover:text-ink"
          >
            {goal.length > 34 ? `${goal.slice(0, 32)}...` : goal}
          </button>
        ))}
      </div>
      <Button
        block
        className="mt-2.5"
        icon={<Wand2 size={13} />}
        onClick={submit}
      >
        Apply to plan
      </Button>
      {touched && feedback ? (
        <div
          className={`mt-2 rounded-sm border px-3 py-2 ${
            feedback.unrecognised.length > 0
              ? "border-warn/30 bg-warn/8"
              : "border-line-soft bg-surface-2"
          }`}
        >
          <p className="text-[11.5px] leading-relaxed text-ink-2">
            {feedback.summary}
          </p>
        </div>
      ) : null}
    </div>
  );
}

export const CONSTRAINT_IDS: ConstraintId[] = [
  "maxTravel",
  "minSpacing",
  "landAvailability",
  "zoning",
  "floodRisk",
  "protectedLand",
  "existingInfrastructure",
  "populationGrowth",
];
