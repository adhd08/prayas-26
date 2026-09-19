"use client";

import { X } from "lucide-react";
import { USE_MOCK_DATA } from "@/lib/config";
import { useSylvida } from "@/store/useSylvida";
import { z } from "@/lib/tokens";

/**
 * How this works.
 *
 * Technical depth is available but not the default view. A judge who wants to
 * know what drives the numbers can find it in one click; a planner who does
 * not care never sees it.
 */
const PIPELINE = [
  {
    title: "Need scores",
    body: "Each ward carries a 0 to 100 score per service, built from population density, distance to the nearest facility, a vulnerability index and existing capacity. In this prototype the scores are synthetic.",
  },
  {
    title: "Demand feedback",
    body: "New housing adds residents, and residents add demand. Healthcare, education, transit, emergency and green-space need all rise locally when a ward densifies, which is why a housing-heavy plan gives ground on green access.",
  },
  {
    title: "Relief model",
    body: "A facility relieves its primary need inside its service radius with a falloff steeper than linear. Overlapping facilities compound with diminishing returns, and relief is scaled by capacity pressure, so provision improves coverage without ever reaching 100%.",
  },
  {
    title: "Candidate generation",
    body: "Six candidate sites per ward, ninety-six in total, generated from a fixed seed so the search is reproducible.",
  },
  {
    title: "Constraint filtering",
    body: "Each candidate is tested against the active constraints: flood envelope, protected land, land availability, zoning and minimum spacing. Rejected sites are recorded with the rule that rejected them.",
  },
  {
    title: "Multi-objective scoring",
    body: "Surviving candidates are scored on relieved need-points per crore, weighted by the priority sliders, by ward population, by a vulnerability index and by an equity term that pays more for relief where need is already severe.",
  },
  {
    title: "Greedy selection",
    body: "The highest-scoring candidate is committed, then every remaining candidate is re-scored against the updated coverage. Facility siting has diminishing returns, which is what makes marginal-gain search a reasonable method here.",
  },
  {
    title: "What it does not do",
    body: "It does not prove optimality, model road networks, schedule construction, or account for operating cost, land acquisition or political feasibility. It reports a best-found configuration under stated assumptions.",
  },
];

const SOURCES = [
  { label: "Basemap", value: "OpenStreetMap contributors, CARTO cartography" },
  { label: "Ward boundaries", value: "Synthetic, generated from a fixed seed" },
  { label: "Population", value: "Synthetic prototype figures" },
  { label: "Need scores", value: "Synthetic prototype figures" },
  { label: "Land and flood risk", value: "Synthetic prototype figures" },
  { label: "Capital costs", value: "Flat per-type prototype estimates" },
];

export function MethodDrawer() {
  const open = useSylvida((s) => s.methodOpen);
  const setOpen = useSylvida((s) => s.setMethodOpen);

  if (!open) return null;

  return (
    <div
      style={{ zIndex: z.modal }}
      className="fixed inset-0 flex justify-end bg-void/60"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="How Sylvida works"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="scroll-thin h-full w-[420px] overflow-y-auto border-l border-line bg-surface shadow-float"
      >
        <div className="sticky top-0 flex items-start justify-between gap-4 border-b border-line bg-surface px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">
              How this works
            </h2>
            <p className="mt-1 text-[12px] leading-relaxed text-ink-3">
              The pipeline behind every number in the interface.
            </p>
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="rounded-xs p-1 text-ink-4 transition-colors duration-150 hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>

        <ol className="px-5 py-4">
          {PIPELINE.map((step, index) => (
            <li
              key={step.title}
              className="relative border-l border-line pb-5 pl-5 last:pb-0"
            >
              <span className="tabular absolute -left-[11px] top-0 flex h-[21px] w-[21px] items-center justify-center rounded-full border border-line bg-surface text-[10px] text-ink-4">
                {index + 1}
              </span>
              <h3 className="text-[13px] font-medium text-ink">{step.title}</h3>
              <p className="mt-1.5 text-[12px] leading-relaxed text-ink-3">
                {step.body}
              </p>
            </li>
          ))}
        </ol>

        <div className="border-t border-line-soft px-5 py-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.13em] text-ink-3">
            Data sources
          </h3>
          <div className="mt-2.5 space-y-1.5">
            {SOURCES.map((source) => (
              <div
                key={source.label}
                className="flex items-baseline justify-between gap-4"
              >
                <span className="text-[12px] text-ink-3">{source.label}</span>
                <span className="text-right text-[11.5px] text-ink-2">
                  {source.value}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 border-t border-line-soft pt-3 text-[11.5px] leading-relaxed text-ink-4">
            {USE_MOCK_DATA
              ? "Sylvida is running on its bundled prototype engine. Every figure is a modelled estimate from synthetic data, and none of it describes real conditions in Kolkata."
              : "Sylvida is running against a live backend. Figures come from the connected service."}
          </p>
        </div>
      </div>
    </div>
  );
}
