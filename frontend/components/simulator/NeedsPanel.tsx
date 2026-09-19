"use client";

import { useMemo } from "react";
import { NEIGHBOURHOODS } from "@/data/city";
import { FACILITY_SPECS, NEED_ORDER, NEED_SPECS } from "@/data/facilityCatalog";
import { formatKm, formatPeopleExact } from "@/lib/format";
import {
  nearestFacility,
  wardNeed,
} from "@/lib/simulation/engine";
import { needRampCss } from "@/lib/tokens";
import { useSylvida } from "@/store/useSylvida";
import { InfoDot } from "@/components/shared/Overlay";
import { SectionHeader } from "@/components/shared/Panel";
import type { Facility, NeedType } from "@/types";

/**
 * City needs.
 *
 * The score is the population-weighted need across the sixteen wards, which is
 * why it moves when a facility is placed. Each row carries an explanation of
 * what feeds the number, because a score nobody can interrogate is just a
 * decoration.
 */
export function NeedsPanel() {
  const need = useSylvida((s) => s.need);
  const setNeed = useSylvida((s) => s.setNeed);
  const facilities = useSylvida((s) => s.facilities);

  const scores = useMemo(() => {
    const out = {} as Record<NeedType, number>;
    for (const key of NEED_ORDER) {
      let weighted = 0;
      let total = 0;
      for (const ward of NEIGHBOURHOODS) {
        weighted += wardNeed(ward, key, facilities) * ward.population;
        total += ward.population;
      }
      out[key] = total === 0 ? 0 : weighted / total;
    }
    return out;
  }, [facilities]);

  return (
    <section>
      <SectionHeader title="City needs" hint="Population-weighted, 0 to 100" />
      <div className="px-2 pb-2">
        {NEED_ORDER.map((key) => (
          <NeedRow
            key={key}
            need={key}
            score={scores[key]}
            active={key === need}
            facilities={facilities}
            onSelect={() => setNeed(key)}
          />
        ))}
      </div>
    </section>
  );
}

function NeedRow({
  need,
  score,
  active,
  facilities,
  onSelect,
}: {
  need: NeedType;
  score: number;
  active: boolean;
  facilities: Facility[];
  onSelect: () => void;
}) {
  const spec = NEED_SPECS[need];
  const rounded = Math.round(score);

  return (
    <div
      className={`group flex items-center gap-2 rounded-sm px-2 transition-colors duration-150 ${
        active ? "bg-brand/8" : "hover:bg-surface-2"
      }`}
    >
      <button
        onClick={onSelect}
        aria-pressed={active}
        className="flex min-w-0 flex-1 items-center gap-2.5 py-2 text-left"
      >
        <span
          aria-hidden
          className={`h-6 w-[2px] shrink-0 rounded-full transition-colors duration-150 ${
            active ? "bg-brand" : "bg-transparent"
          }`}
        />
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: needRampCss(rounded / 100) }}
        />
        <span
          className={`min-w-0 flex-1 truncate text-[13px] ${
            active ? "text-ink" : "text-ink-2"
          }`}
        >
          {spec.label}
        </span>
        <span
          className={`tabular text-[12.5px] ${
            active ? "text-ink" : "text-ink-3"
          }`}
        >
          {rounded}
        </span>
        <span className="text-[11px] text-ink-4">/100</span>
      </button>
      <NeedExplanation need={need} score={rounded} facilities={facilities} />
    </div>
  );
}

function NeedExplanation({
  need,
  score,
  facilities,
}: {
  need: NeedType;
  score: number;
  facilities: Facility[];
}) {
  const spec = NEED_SPECS[need];

  const worst = useMemo(() => {
    return [...NEIGHBOURHOODS]
      .map((ward) => ({ ward, value: wardNeed(ward, need, facilities) }))
      .sort((a, b) => b.value - a.value)[0];
  }, [need, facilities]);

  const nearest = nearestFacility(
    worst.ward.centroid,
    spec.servedBy,
    facilities,
  );

  return (
    <InfoDot title={`${spec.label} need`} align="right">
      <p className="tabular text-[20px] font-semibold text-ink">
        {score}
        <span className="ml-1 text-[12px] font-normal text-ink-4">/ 100</span>
      </p>
      <p className="mt-2 text-[11.5px] uppercase tracking-[0.1em] text-ink-4">
        Based on
      </p>
      <div className="mt-1.5 space-y-1">
        {spec.inputs.map((input) => (
          <div key={input.label} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[11.5px] text-ink-3">
              {input.label}
            </span>
            <span
              aria-hidden
              className="h-[3px] w-10 shrink-0 rounded-full bg-line"
            >
              <span
                className="block h-full rounded-full bg-brand/70"
                style={{ width: `${input.weight}%` }}
              />
            </span>
            <span className="tabular w-8 shrink-0 text-right text-[11px] text-ink-3">
              {input.weight}%
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 border-t border-line-soft pt-2.5">
        <p className="text-[11.5px] uppercase tracking-[0.1em] text-ink-4">
          Highest need
        </p>
        <p className="mt-1 text-[12.5px] text-ink">
          {worst.ward.name}, {formatPeopleExact(worst.ward.population)}{" "}
          residents
        </p>
        <p className="mt-0.5 text-[11.5px] text-ink-3">
          Nearest {FACILITY_SPECS[spec.servedBy].label.toLowerCase()}:{" "}
          {nearest ? formatKm(nearest.distanceKm) : "none in the study area"}
        </p>
      </div>
      <p className="mt-3 border-t border-line-soft pt-2 text-[11px] leading-snug text-ink-4">
        Prototype estimate from demo data, not a measured survey.
      </p>
    </InfoDot>
  );
}
