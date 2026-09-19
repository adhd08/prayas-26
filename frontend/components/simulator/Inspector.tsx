"use client";

import {
  ArrowRight,
  Check,
  ListTree,
  MessageSquare,
  Move,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { NEIGHBOURHOOD_BY_ID } from "@/data/city";
import {
  FACILITY_SPECS,
  NEED_ORDER,
  NEED_SPECS,
} from "@/data/facilityCatalog";
import {
  formatCost,
  formatKm,
  formatPeopleExact,
  formatPercent,
} from "@/lib/format";
import {
  accessFromNeed,
  capacityPressure,
  computeMetrics,
  nearestFacility,
  populationServed,
  wardNeed,
  worstNeedScore,
} from "@/lib/simulation/engine";
import { facilityColor, needRampCss } from "@/lib/tokens";
import { useSylvida } from "@/store/useSylvida";
import { FACILITY_ICONS } from "@/components/shared/facilityGlyphs";
import { Button } from "@/components/shared/Button";
import { EmptyState, Readout, SectionHeader } from "@/components/shared/Panel";
import type { Facility, Neighbourhood } from "@/types";

export function Inspector() {
  const wardId = useSylvida((s) => s.selectedNeighbourhoodId);
  const facilityId = useSylvida((s) => s.selectedFacilityId);
  const facilities = useSylvida((s) => s.facilities);
  const result = useSylvida((s) => s.result);

  const ward = wardId ? NEIGHBOURHOOD_BY_ID.get(wardId) : undefined;
  const facility =
    [...facilities, ...(result?.facilities ?? [])].find(
      (f) => f.id === facilityId,
    ) ?? undefined;

  if (facility) return <FacilityInspector facility={facility} />;
  if (ward) return <WardInspector ward={ward} />;
  return <NothingSelected />;
}

function NothingSelected() {
  const startOnboarding = useSylvida((s) => s.startOnboarding);
  return (
    <div>
      <SectionHeader title="Select an element" />
      <EmptyState
        title="Nothing selected"
        body="Choose a ward or a facility on the map to inspect what it changes."
      >
        <ul className="space-y-1.5 text-[12px] text-ink-3">
          <li>Hover a ward for a summary</li>
          <li>Click a ward to inspect access and population</li>
          <li>Pick a facility type, then click the map to place it</li>
          <li>Switch to Optimize to generate a configuration</li>
        </ul>
        <Button className="mt-4" size="sm" onClick={startOnboarding}>
          Replay the tour
        </Button>
      </EmptyState>
    </div>
  );
}

/* --- Ward ------------------------------------------------------------------ */

function WardInspector({ ward }: { ward: Neighbourhood }) {
  const facilities = useSylvida((s) => s.facilities);
  const clear = useSylvida((s) => s.clearSelection);
  const focusOn = useSylvida((s) => s.focusOn);
  const openAssistant = useSylvida((s) => s.openAssistant);
  const selectNeed = useSylvida((s) => s.setNeed);

  const needs = useMemo(
    () =>
      NEED_ORDER.map((need) => ({
        need,
        score: wardNeed(ward, need, facilities),
      })),
    [ward, facilities],
  );

  const worst = worstNeedScore(ward, facilities);
  const hospital = nearestFacility(ward.centroid, "hospital", facilities);

  return (
    <div>
      <SectionHeader
        title="Ward"
        action={
          <button
            onClick={clear}
            aria-label="Clear selection"
            className="rounded-xs p-1 text-ink-4 transition-colors duration-150 hover:text-ink"
          >
            <X size={14} />
          </button>
        }
      />

      <div className="px-4">
        <div className="flex items-baseline gap-2">
          <h3 className="text-[19px] font-semibold text-ink">{ward.name}</h3>
          <span className="text-[12px] text-ink-4">{ward.district}</span>
        </div>
        <p className="mt-1 text-[12.5px] text-ink-3">
          {formatPeopleExact(ward.population)} residents
        </p>

        <div className="mt-3 rounded-sm border border-line-soft bg-surface-2 px-3 py-2.5">
          <p className="text-[11px] uppercase tracking-[0.12em] text-ink-4">
            Sharpest gap
          </p>
          <p className="mt-1 flex items-center gap-2 text-[13px] text-ink">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: needRampCss(worst.score / 100) }}
            />
            {NEED_SPECS[worst.need].label}
            <span className="tabular ml-auto text-ink-2">
              {Math.round(worst.score)} / 100
            </span>
          </p>
        </div>
      </div>

      <div className="mt-4 px-4">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.13em] text-ink-3">
          Access by service
        </p>
        {needs.map(({ need, score }) => (
          <button
            key={need}
            onClick={() => selectNeed(need)}
            className="flex w-full items-center gap-2.5 rounded-xs py-[5px] text-left transition-colors duration-150 hover:bg-surface-2"
          >
            <span className="w-[86px] shrink-0 truncate text-[12px] text-ink-3">
              {NEED_SPECS[need].label}
            </span>
            <span className="h-[4px] flex-1 overflow-hidden rounded-full bg-line-soft">
              <span
                className="block h-full rounded-full transition-[width] duration-500"
                style={{
                  width: `${accessFromNeed(score)}%`,
                  background: needRampCss(score / 100),
                }}
              />
            </span>
            <span className="tabular w-10 shrink-0 text-right text-[11.5px] text-ink-2">
              {formatPercent(accessFromNeed(score))}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-4 border-t border-line-soft px-4 pt-3">
        <Readout
          label="Nearest hospital"
          value={hospital ? formatKm(hospital.distanceKm) : "None"}
        />
        <Readout
          label="Vulnerability index"
          value={`${ward.vulnerability} / 100`}
        />
        <Readout
          label="Land suitability"
          value={formatPercent(ward.landSuitability * 100)}
        />
        <Readout
          label="Flood exposure"
          value={formatPercent(ward.floodRisk * 100)}
          tone={ward.floodRisk > 0.55 ? "warn" : "default"}
        />
        {ward.isProtected ? (
          <Readout label="Designation" value="Protected" tone="warn" />
        ) : null}
      </div>

      <div className="mt-4 flex gap-2 px-4 pb-4">
        <Button
          size="sm"
          icon={<MessageSquare size={13} />}
          onClick={() => openAssistant(`Why is ${ward.name} underserved?`)}
        >
          Ask Sylvida
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => focusOn(ward.centroid, 14)}
        >
          Zoom to ward
        </Button>
      </div>
    </div>
  );
}

/* --- Facility ---------------------------------------------------------------- */

function FacilityInspector({ facility }: { facility: Facility }) {
  const facilities = useSylvida((s) => s.facilities);
  const clear = useSylvida((s) => s.clearSelection);
  const remove = useSylvida((s) => s.deleteFacility);
  const openAssistant = useSylvida((s) => s.openAssistant);
  const review = useSylvida((s) => s.reviewFacility);
  const focusOn = useSylvida((s) => s.focusOn);
  const [traceOpen, setTraceOpen] = useState(false);

  const spec = FACILITY_SPECS[facility.type];
  const Icon = FACILITY_ICONS[facility.type];
  const color = facilityColor[facility.type];

  const inPlan = facilities.some((f) => f.id === facility.id);
  const pool = inPlan ? facilities : [...facilities, facility];

  const { before, after } = useMemo(() => {
    const without = pool.filter((f) => f.id !== facility.id);
    return { before: computeMetrics(without), after: computeMetrics(pool) };
  }, [pool, facility.id]);

  const coverageKey = coverageKeyFor(facility);
  const served = populationServed(facility, pool);
  const pressure = capacityPressure(facility);

  return (
    <div>
      <SectionHeader
        title={
          facility.origin === "existing"
            ? "Existing facility"
            : facility.origin === "proposed"
              ? "Proposed facility"
              : "Your facility"
        }
        action={
          <button
            onClick={clear}
            aria-label="Clear selection"
            className="rounded-xs p-1 text-ink-4 transition-colors duration-150 hover:text-ink"
          >
            <X size={14} />
          </button>
        }
      />

      <div className="px-4">
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-sm border"
            style={{ borderColor: `${color}55`, background: `${color}14` }}
          >
            <Icon size={16} color={color} strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-[16px] font-semibold text-ink">
              {facility.name}
            </h3>
            <p className="text-[11.5px] text-ink-4">
              {spec.label} - {formatKm(facility.serviceRadiusKm)} catchment
            </p>
          </div>
        </div>

        <div className="mt-3.5 border-t border-line-soft pt-3">
          <Readout
            label="Residents in service area"
            value={formatPeopleExact(served)}
          />
          <Readout
            label={`Design capacity`}
            value={`${facility.capacity.toLocaleString("en-IN")} ${spec.capacityUnit}`}
          />
          <Readout
            label="Capacity pressure"
            value={
              pressure >= 0.99
                ? "Within design catchment"
                : `${Math.round((1 / Math.max(pressure, 0.01)) * 100)}% of design load`
            }
            tone={pressure < 0.6 ? "warn" : "default"}
          />
          <Readout
            label="Estimated capital cost"
            value={
              facility.estimatedCost
                ? formatCost(facility.estimatedCost)
                : "Already built"
            }
          />
        </div>
      </div>

      {facility.origin !== "existing" ? (
        <div className="mt-4 px-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.13em] text-ink-3">
            What it changes
          </p>
          <div className="rounded-sm border border-line-soft bg-surface-2 px-3 py-3">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-[10.5px] uppercase tracking-[0.12em] text-ink-4">
                  Without
                </p>
                <p className="tabular mt-1 text-[17px] text-ink-2">
                  {formatPercent(before[coverageKey], 1)}
                </p>
              </div>
              <ArrowRight size={14} className="mb-1.5 text-ink-4" />
              <div className="text-right">
                <p className="text-[10.5px] uppercase tracking-[0.12em] text-ink-4">
                  With
                </p>
                <p className="tabular mt-1 text-[17px] text-ok">
                  {formatPercent(after[coverageKey], 1)}
                </p>
              </div>
            </div>
            <div className="mt-3 border-t border-line-soft pt-2.5">
              <Readout
                label="Underserved residents"
                value={`${formatPeopleExact(before.underservedPopulation)} → ${formatPeopleExact(after.underservedPopulation)}`}
                tone={
                  after.underservedPopulation < before.underservedPopulation
                    ? "good"
                    : "default"
                }
              />
            </div>
          </div>
        </div>
      ) : null}

      {facility.rationale ? (
        <div className="mt-4 px-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.13em] text-ink-3">
            Why here
          </p>
          <p className="text-[12.5px] leading-relaxed text-ink-2">
            {facility.rationale.headline}
          </p>
          <div className="mt-2.5 space-y-0.5 border-t border-line-soft pt-2">
            {facility.rationale.evidence.map((item) => (
              <Readout
                key={item.label}
                label={item.label}
                value={item.value}
              />
            ))}
          </div>

          <button
            onClick={() => setTraceOpen((v) => !v)}
            aria-expanded={traceOpen}
            className="mt-3 flex items-center gap-1.5 text-[12px] text-brand transition-colors duration-150 hover:text-ink"
          >
            <ListTree size={13} />
            {traceOpen ? "Hide decision trace" : "View decision trace"}
          </button>

          {traceOpen ? (
            <ol className="mt-2.5 space-y-2 border-l border-line pl-3">
              {facility.rationale.trace.map((step, index) => (
                <li key={step} className="relative text-[12px] leading-relaxed text-ink-3">
                  <span className="tabular absolute -left-[19px] top-[1px] flex h-4 w-4 items-center justify-center rounded-full border border-line bg-surface text-[9px] text-ink-4">
                    {index + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2 px-4 pb-4">
        <Button
          size="sm"
          icon={<MessageSquare size={13} />}
          onClick={() =>
            openAssistant(`Why did you place ${facility.name} here?`)
          }
        >
          Ask Sylvida
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={<Move size={13} />}
          onClick={() => focusOn(facility.position, 15)}
        >
          Locate
        </Button>
        {facility.origin === "user" ? (
          <Button
            size="sm"
            variant="danger"
            icon={<Trash2 size={13} />}
            onClick={() => remove(facility.id)}
          >
            Remove
          </Button>
        ) : null}
        {facility.origin === "proposed" ? (
          <div className="flex w-full gap-2 pt-1">
            <Button
              size="sm"
              variant={facility.review === "accepted" ? "primary" : "secondary"}
              icon={<Check size={13} />}
              onClick={() => review(facility.id, "accepted")}
            >
              Accept
            </Button>
            <Button
              size="sm"
              variant={facility.review === "rejected" ? "danger" : "secondary"}
              icon={<X size={13} />}
              onClick={() => review(facility.id, "rejected")}
            >
              Reject
            </Button>
          </div>
        ) : null}
      </div>

      <p className="px-4 pb-5 text-[11px] leading-snug text-ink-4">
        Prototype estimate. Service areas are straight-line radii, not road
        network travel times.
      </p>
    </div>
  );
}

function coverageKeyFor(facility: Facility) {
  switch (FACILITY_SPECS[facility.type].primaryNeed) {
    case "healthcare":
      return "healthcareCoverage" as const;
    case "education":
      return "educationCoverage" as const;
    case "transit":
      return "transitCoverage" as const;
    case "greenspace":
      return "greenspaceCoverage" as const;
    case "emergency":
      return "emergencyCoverage" as const;
    default:
      return "housingAdequacy" as const;
  }
}
