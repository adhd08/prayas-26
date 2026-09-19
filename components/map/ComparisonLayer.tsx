"use client";

/**
 * Before and after, on the same map.
 *
 * The generated plan is drawn into its own Leaflet pane, and that pane is
 * clipped at the divider. The planner drags one handle and watches the same
 * streets change, which is more convincing than two maps side by side.
 */

import { useEffect, useMemo, useRef } from "react";
import { MoveHorizontal } from "lucide-react";
import { Circle, Marker, useMap } from "react-leaflet";
import { heatField } from "@/lib/simulation/engine";
import { facilityColor } from "@/lib/tokens";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { useSylvida } from "@/store/useSylvida";
import { NeedHeatLayer } from "./heatLayer";
import { facilityIcon } from "./markerIcons";

const PANE = "sylvida-after";

export function ComparisonLayer() {
  const map = useMap();
  const open = useSylvida((s) => s.comparisonOpen);
  const split = useSylvida((s) => s.comparisonSplit);
  const need = useSylvida((s) => s.need);
  const facilities = useSylvida((s) => s.facilities);
  const result = useSylvida((s) => s.result);
  const select = useSylvida((s) => s.selectFacility);
  const reduced = useReducedMotion();
  const layerRef = useRef<NeedHeatLayer | null>(null);

  const accepted = useMemo(
    () => (result?.facilities ?? []).filter((f) => f.review !== "rejected"),
    [result],
  );

  const afterField = useMemo(
    () => heatField(need, [...facilities, ...accepted]),
    [need, facilities, accepted],
  );

  useEffect(() => {
    if (!map.getPane(PANE)) {
      const pane = map.createPane(PANE);
      pane.style.zIndex = "420";
      pane.style.pointerEvents = "none";
    }
  }, [map]);

  useEffect(() => {
    const pane = map.getPane(PANE);
    if (!pane) return;
    // Clip from the left so the right-hand side of the map shows the plan.
    pane.style.clipPath = open
      ? `inset(0 0 0 ${(split * 100).toFixed(2)}%)`
      : "inset(0 0 0 100%)";
    pane.style.pointerEvents = open ? "auto" : "none";
  }, [map, open, split]);

  useEffect(() => {
    if (!open) {
      layerRef.current?.remove();
      layerRef.current = null;
      return;
    }
    const layer = new NeedHeatLayer(afterField, { opacity: 0.74, pane: PANE });
    layerRef.current = layer;
    layer.addTo(map);
    return () => {
      layer.remove();
      layerRef.current = null;
    };
    // Field updates go through setField below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, open]);

  useEffect(() => {
    if (open) layerRef.current?.setField(afterField, reduced);
  }, [afterField, open, reduced]);

  if (!open || !result) return null;

  return (
    <>
      {accepted.map((facility) => (
        <Marker
          key={`after-${facility.id}`}
          pane={PANE}
          position={[facility.position.lat, facility.position.lng]}
          icon={facilityIcon(facility.type, "proposed")}
          eventHandlers={{ click: () => select(facility.id) }}
        />
      ))}
      {accepted.map((facility) => (
        <Circle
          key={`after-area-${facility.id}`}
          pane={PANE}
          center={[facility.position.lat, facility.position.lng]}
          radius={facility.serviceRadiusKm * 1000}
          pathOptions={{
            color: facilityColor[facility.type],
            weight: 0.8,
            opacity: 0.35,
            fillOpacity: 0.03,
            fillColor: facilityColor[facility.type],
            interactive: false,
          }}
        />
      ))}
    </>
  );
}

/**
 * The draggable divider, rendered above the map rather than inside it.
 *
 * Only the knob takes pointer events, so panning and zooming keep working
 * while the comparison is on screen.
 */
export function ComparisonHandle() {
  const open = useSylvida((s) => s.comparisonOpen);
  const split = useSylvida((s) => s.comparisonSplit);
  const setSplit = useSylvida((s) => s.setComparisonSplit);
  const trackRef = useRef<HTMLDivElement>(null);

  const startDrag = (event: React.PointerEvent) => {
    event.preventDefault();
    const track = trackRef.current;
    if (!track) return;
    const box = track.getBoundingClientRect();
    const apply = (clientX: number) =>
      setSplit(
        Math.min(0.96, Math.max(0.04, (clientX - box.left) / box.width)),
      );
    const onMove = (e: PointerEvent) => apply(e.clientX);
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  if (!open) return null;

  return (
    <div
      ref={trackRef}
      className="pointer-events-none absolute inset-0 z-[30]"
      style={{ touchAction: "none" }}
    >
      <div
        className="absolute inset-y-0 w-px bg-brand/70"
        style={{ left: `${split * 100}%` }}
      >
        <button
          onPointerDown={startDrag}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setSplit(Math.max(0.04, split - 0.04));
            if (e.key === "ArrowRight") setSplit(Math.min(0.96, split + 0.04));
          }}
          aria-label="Drag to compare the current city with the proposed plan"
          className="pointer-events-auto absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full border border-brand/50 bg-surface-2 text-brand shadow-float"
        >
          <MoveHorizontal size={15} />
        </button>
        <span className="absolute -left-2 top-4 -translate-x-full whitespace-nowrap rounded-xs border border-line bg-surface-2/92 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.13em] text-ink-3">
          Current city
        </span>
        <span className="absolute left-3 top-4 whitespace-nowrap rounded-xs border border-brand/35 bg-surface-2/92 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.13em] text-brand">
          Proposed plan
        </span>
      </div>
    </div>
  );
}

/** Keeps the divider off the map controls while it is visible. */
export const COMPARISON_PANE = PANE;
