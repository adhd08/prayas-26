"use client";

import {
  Crosshair,
  Layers,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  RotateCcw,
} from "lucide-react";
import { useMap } from "react-leaflet";
import { CITY_BOUNDS } from "@/data/city";
import { NEED_SPECS } from "@/data/facilityCatalog";
import { needRampGradient, z } from "@/lib/tokens";
import { useSylvida } from "@/store/useSylvida";
import { IconButton } from "@/components/shared/Button";
import { Popover } from "@/components/shared/Overlay";
import { Toggle } from "@/components/shared/Controls";

const FIT: [[number, number], [number, number]] = [
  [CITY_BOUNDS.south, CITY_BOUNDS.west],
  [CITY_BOUNDS.north, CITY_BOUNDS.east],
];

export function MapControls() {
  const map = useMap();
  const presentMode = useSylvida((s) => s.presentMode);
  const setPresentMode = useSylvida((s) => s.setPresentMode);
  const clearSelection = useSylvida((s) => s.clearSelection);

  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{ zIndex: z.mapControl }}
    >
      <div className="pointer-events-auto absolute left-3 top-3 flex flex-col gap-1.5">
        <IconButton label="Zoom in" onClick={() => map.zoomIn()}>
          <Plus size={15} />
        </IconButton>
        <IconButton label="Zoom out" onClick={() => map.zoomOut()}>
          <Minus size={15} />
        </IconButton>
        <IconButton
          label="Fit the study area"
          onClick={() => map.fitBounds(FIT, { padding: [48, 48] })}
        >
          <Crosshair size={15} />
        </IconButton>
        <IconButton
          label="Reset the view"
          onClick={() => {
            map.fitBounds(FIT, { padding: [48, 48] });
            clearSelection();
          }}
        >
          <RotateCcw size={15} />
        </IconButton>
      </div>

      <div className="pointer-events-auto absolute right-3 top-3 flex items-start gap-1.5">
        <LayerMenu />
        <IconButton
          label={presentMode ? "Leave presentation mode" : "Presentation mode"}
          active={presentMode}
          onClick={() => setPresentMode(!presentMode)}
        >
          {presentMode ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </IconButton>
      </div>
    </div>
  );
}

function LayerMenu() {
  const layers = useSylvida((s) => s.layers);
  const toggle = useSylvida((s) => s.toggleLayer);

  return (
    <Popover
      align="right"
      width={252}
      trigger={({ open, toggle: openMenu }) => (
        <IconButton label="Map layers" active={open} onClick={openMenu}>
          <Layers size={15} />
        </IconButton>
      )}
    >
      <div className="space-y-0.5">
        <Toggle
          label="Need surface"
          checked={layers.heat}
          onChange={() => toggle("heat")}
        />
        <Toggle
          label="Existing infrastructure"
          checked={layers.existing}
          onChange={() => toggle("existing")}
        />
        <Toggle
          label="Proposed infrastructure"
          checked={layers.proposed}
          onChange={() => toggle("proposed")}
        />
        <Toggle
          label="Service area of selection"
          checked={layers.serviceAreas}
          onChange={() => toggle("serviceAreas")}
        />
        <Toggle
          label="Constraint overlays"
          description="Flood envelope and protected land"
          checked={layers.constraints}
          onChange={() => toggle("constraints")}
        />
        <Toggle
          label="Ward labels on hover"
          checked={layers.labels}
          onChange={() => toggle("labels")}
        />
      </div>
    </Popover>
  );
}

/**
 * Legend.
 *
 * Carries the origin key as well as the ramp, because marker colour alone
 * does not say whether something already exists or is only proposed.
 */
export function MapLegend({ collapsed }: { collapsed?: boolean }) {
  const need = useSylvida((s) => s.need);
  const layersConstraints = useSylvida((s) => s.layers.constraints);

  if (collapsed) return null;

  return (
    <div
      className="pointer-events-auto absolute bottom-3 left-3 w-[214px] rounded-md border border-line bg-surface/92 p-3 backdrop-blur-sm"
      style={{ zIndex: z.mapControl }}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-ink-3">
        {NEED_SPECS[need].label} need
      </p>
      <div
        className="mt-2 h-[6px] w-full rounded-full"
        style={{ background: needRampGradient }}
      />
      <div className="mt-1.5 flex justify-between text-[10.5px] text-ink-4">
        <span>Low</span>
        <span className="tabular">0</span>
        <span className="tabular">100</span>
        <span>Critical</span>
      </div>

      <div className="mt-3 space-y-1.5 border-t border-line-soft pt-2.5">
        <LegendRow variant="existing" label="Existing" />
        <LegendRow variant="proposed" label="Proposed by Sylvida" />
        <LegendRow variant="user" label="Placed by you" />
      </div>

      {layersConstraints ? (
        <div className="mt-2.5 space-y-1.5 border-t border-line-soft pt-2.5">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-5 rounded-[2px] border border-[#5C7BE8]/60 bg-[#5C7BE8]/25" />
            <span className="text-[11px] text-ink-3">Flood envelope</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-5 rounded-[2px] border border-warn/60 bg-warn/18" />
            <span className="text-[11px] text-ink-3">Protected land</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LegendRow({
  variant,
  label,
}: {
  variant: "existing" | "proposed" | "user";
  label: string;
}) {
  const style =
    variant === "existing"
      ? "border border-ink-3/60"
      : variant === "proposed"
        ? "border-2 border-dashed border-brand"
        : "border-2 border-brand bg-brand/25";
  return (
    <div className="flex items-center gap-2">
      <span className={`h-3.5 w-3.5 rounded-full bg-surface-3 ${style}`} />
      <span className="text-[11px] text-ink-3">{label}</span>
    </div>
  );
}
