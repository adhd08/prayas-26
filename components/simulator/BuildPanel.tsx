"use client";

import { X } from "lucide-react";
import { FACILITY_ORDER, FACILITY_SPECS } from "@/data/facilityCatalog";
import { formatCost, formatKm } from "@/lib/format";
import { facilityColor } from "@/lib/tokens";
import { useSylvida } from "@/store/useSylvida";
import { FACILITY_ICONS } from "@/components/shared/facilityGlyphs";
import { SectionHeader } from "@/components/shared/Panel";
import type { FacilityType } from "@/types";

/**
 * Build palette.
 *
 * Picking a type arms the map: the cursor becomes a crosshair, a ghost marker
 * follows it with the service area attached, and the next click places the
 * facility. Escape cancels. Click-to-arm beats HTML drag and drop here because
 * the target is a canvas that also needs to pan.
 */
export function BuildPanel() {
  const draggingType = useSylvida((s) => s.draggingType);
  const beginDrag = useSylvida((s) => s.beginDrag);
  const cancelDrag = useSylvida((s) => s.cancelDrag);
  const budget = useSylvida((s) => s.budget);
  const committed = useSylvida((s) => s.metrics.committedCost);

  return (
    <section>
      <SectionHeader
        title="Add infrastructure"
        hint={
          draggingType
            ? "Click the map to place. Escape cancels."
            : "Pick a type, then click a site on the map"
        }
        action={
          draggingType ? (
            <button
              onClick={cancelDrag}
              className="flex items-center gap-1 rounded-xs px-1.5 py-1 text-[11px] text-ink-3 transition-colors duration-150 hover:text-ink"
            >
              <X size={12} />
              Cancel
            </button>
          ) : null
        }
      />

      <div className="px-2 pb-1">
        {FACILITY_ORDER.map((type) => (
          <BuildItem
            key={type}
            type={type}
            active={draggingType === type}
            affordable={committed + FACILITY_SPECS[type].cost <= budget}
            onPick={() =>
              draggingType === type ? cancelDrag() : beginDrag(type)
            }
          />
        ))}
      </div>

      <div className="mx-4 mb-3 mt-1 flex items-center justify-between rounded-sm border border-line-soft bg-surface-2 px-3 py-2">
        <span className="text-[11.5px] text-ink-3">Committed</span>
        <span className="tabular text-[12px] text-ink">
          {formatCost(committed)}
          <span className="text-ink-4"> / {formatCost(budget)}</span>
        </span>
      </div>
    </section>
  );
}

function BuildItem({
  type,
  active,
  affordable,
  onPick,
}: {
  type: FacilityType;
  active: boolean;
  affordable: boolean;
  onPick: () => void;
}) {
  const spec = FACILITY_SPECS[type];
  const Icon = FACILITY_ICONS[type];
  const color = facilityColor[type];

  return (
    <button
      onClick={onPick}
      aria-pressed={active}
      className={`flex w-full items-center gap-3 rounded-sm px-2 py-2 text-left transition-colors duration-150 ${
        active ? "bg-brand/10 ring-1 ring-brand/35" : "hover:bg-surface-2"
      }`}
    >
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border"
        style={{
          borderColor: `${color}55`,
          background: `${color}12`,
        }}
      >
        <Icon size={15} color={color} strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-ink">
          {spec.label}
        </span>
        <span className="block truncate text-[11px] text-ink-4">
          {formatKm(spec.serviceRadiusKm)} catchment
        </span>
      </span>
      <span
        className={`tabular shrink-0 text-[11.5px] ${
          affordable ? "text-ink-3" : "text-warn"
        }`}
      >
        {formatCost(spec.cost)}
      </span>
    </button>
  );
}
