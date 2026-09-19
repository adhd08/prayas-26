"use client";

/**
 * The data layers drawn over the basemap.
 *
 * Each one is a small component so the map composition reads as a stack of
 * concerns: the field, the boundaries, the stock, the catchments, the search.
 */

import { useEffect, useMemo, useRef } from "react";
import {
  Circle,
  CircleMarker,
  Marker,
  Polygon,
  Tooltip as LeafletTooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type { LatLngExpression, LeafletMouseEvent } from "leaflet";
import { CITY_BOUNDS, NEIGHBOURHOODS } from "@/data/city";
import { FACILITY_SPECS } from "@/data/facilityCatalog";
import { heatField, wardNeed } from "@/lib/simulation/engine";
import { brand, facilityColor, needRampCss, semantic } from "@/lib/tokens";
import { formatPeopleExact } from "@/lib/format";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { useSylvida } from "@/store/useSylvida";
import { NeedHeatLayer } from "./heatLayer";
import { facilityIcon, ghostIcon } from "./markerIcons";
import type { Facility, LatLng, Neighbourhood, NeedType } from "@/types";

const ring = (n: Neighbourhood): LatLngExpression[] =>
  n.ring.map((p) => [p.lat, p.lng]);

const HEAT_PANE = "sylvida-heat";
const HEAT_OPACITY = 0.68;

/* --- Need surface ---------------------------------------------------------- */

export function HeatSurface({ visible }: { visible: boolean }) {
  const map = useMap();
  const need = useSylvida((s) => s.need);
  const facilities = useSylvida((s) => s.facilities);
  const layerRef = useRef<NeedHeatLayer | null>(null);
  const firstRun = useRef(true);
  const reduced = useReducedMotion();

  const field = useMemo(
    () => heatField(need, facilities),
    [need, facilities],
  );

  useEffect(() => {
    // Own pane, stacked between the tiles and the vector overlay, so ward
    // boundaries and markers stay readable through the surface.
    if (!map.getPane(HEAT_PANE)) {
      const pane = map.createPane(HEAT_PANE);
      pane.style.zIndex = "350";
      pane.style.pointerEvents = "none";
    }
    const layer = new NeedHeatLayer(field, {
      opacity: HEAT_OPACITY,
      pane: HEAT_PANE,
    });
    layerRef.current = layer;
    layer.addTo(map);
    return () => {
      layer.remove();
      layerRef.current = null;
    };
    // The layer is created once; updates go through setField.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    layerRef.current?.setField(field, reduced);
  }, [field, reduced]);

  useEffect(() => {
    layerRef.current?.setOpacity(visible ? HEAT_OPACITY : 0);
  }, [visible]);

  return null;
}

/* --- Study area -------------------------------------------------------------- */

/**
 * Outline of the modelled area.
 *
 * The need surface stops at a hard edge because the model stops there. Drawing
 * the boundary makes that a stated limit rather than a rendering artefact.
 */
export function StudyAreaLayer() {
  return (
    <Polygon
      positions={[
        [CITY_BOUNDS.south, CITY_BOUNDS.west],
        [CITY_BOUNDS.south, CITY_BOUNDS.east],
        [CITY_BOUNDS.north, CITY_BOUNDS.east],
        [CITY_BOUNDS.north, CITY_BOUNDS.west],
      ]}
      pathOptions={{
        color: "#5A6E85",
        weight: 1,
        opacity: 0.55,
        dashArray: "2 6",
        fill: false,
        interactive: false,
      }}
    />
  );
}

/* --- Ward boundaries -------------------------------------------------------- */

export function WardLayer() {
  const need = useSylvida((s) => s.need);
  const facilities = useSylvida((s) => s.facilities);
  const selectedId = useSylvida((s) => s.selectedNeighbourhoodId);
  const hoveredId = useSylvida((s) => s.hoveredNeighbourhoodId);
  const select = useSylvida((s) => s.selectNeighbourhood);
  const hover = useSylvida((s) => s.hoverNeighbourhood);
  const showLabels = useSylvida((s) => s.layers.labels);
  const dragging = useSylvida((s) => s.draggingType);

  return (
    <>
      {NEIGHBOURHOODS.map((ward) => {
        const selected = ward.id === selectedId;
        const hovered = ward.id === hoveredId;
        const dimmed = selectedId !== null && !selected;
        return (
          <Polygon
            key={ward.id}
            positions={ring(ward)}
            pathOptions={{
              color: selected ? brand.cyan : hovered ? "#7C93AA" : "#46596E",
              weight: selected ? 2 : hovered ? 1.6 : 1,
              opacity: dimmed ? 0.3 : 1,
              fillColor: selected ? brand.cyan : "#0B0F14",
              fillOpacity: selected ? 0.06 : dimmed ? 0.22 : 0,
              // Dragging must reach the map beneath, not the ward polygon.
              interactive: !dragging,
            }}
            eventHandlers={{
              mouseover: () => hover(ward.id),
              mouseout: () => hover(null),
              click: () => select(ward.id),
            }}
          >
            {showLabels ? (
              <LeafletTooltip
                direction="top"
                offset={[0, -6]}
                opacity={1}
                className="sylvida-tip"
              >
                <WardTip ward={ward} need={need} facilities={facilities} />
              </LeafletTooltip>
            ) : null}
          </Polygon>
        );
      })}
    </>
  );
}

function WardTip({
  ward,
  need,
  facilities,
}: {
  ward: Neighbourhood;
  need: NeedType;
  facilities: Facility[];
}) {
  const score = Math.round(wardNeed(ward, need, facilities));
  return (
    <div className="min-w-[150px]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink">
        {ward.name}
      </p>
      <p className="mt-1 text-[11px] text-ink-3">
        {formatPeopleExact(ward.population)} residents
      </p>
      <div className="mt-2 flex items-center gap-2">
        <span
          className="h-2 w-2 rounded-full"
          style={{ background: needRampCss(score / 100) }}
        />
        <span className="tabular text-[11.5px] text-ink">{score} / 100</span>
      </div>
    </div>
  );
}

/* --- Facilities -------------------------------------------------------------- */

export function FacilityLayer() {
  const facilities = useSylvida((s) => s.facilities);
  const result = useSylvida((s) => s.result);
  const selectedId = useSylvida((s) => s.selectedFacilityId);
  const select = useSylvida((s) => s.selectFacility);
  const move = useSylvida((s) => s.moveFacility);
  const showExisting = useSylvida((s) => s.layers.existing);
  const showProposed = useSylvida((s) => s.layers.proposed);
  const comparing = useSylvida((s) => s.comparisonOpen);

  // While the comparison is open the generated sites belong to the clipped
  // "after" pane only, so they are left out of the base layer here.
  const proposals = comparing ? [] : (result?.facilities ?? []);
  const visible = [
    ...facilities.filter((f) =>
      f.origin === "existing" ? showExisting : showProposed,
    ),
    ...(showProposed ? proposals : []),
  ];

  return (
    <>
      {visible.map((facility) => {
        const selected = facility.id === selectedId;
        return (
          <Marker
            key={facility.id}
            position={[facility.position.lat, facility.position.lng]}
            icon={facilityIcon(
              facility.type,
              facility.origin,
              facility.review === "rejected"
                ? "rejected"
                : selected
                  ? "selected"
                  : "default",
            )}
            draggable={facility.origin !== "existing"}
            zIndexOffset={selected ? 500 : facility.origin === "existing" ? 0 : 200}
            eventHandlers={{
              click: () => select(facility.id),
              dragend: (event) => {
                const { lat, lng } = event.target.getLatLng();
                move(facility.id, { lat, lng });
              },
            }}
          >
            <LeafletTooltip
              direction="top"
              offset={[0, -16]}
              opacity={1}
              className="sylvida-tip"
            >
              <span className="text-[11.5px] text-ink">{facility.name}</span>
              <span className="ml-2 text-[11px] text-ink-4">
                {facility.origin === "existing"
                  ? "Existing"
                  : facility.origin === "proposed"
                    ? "Proposed"
                    : "Your plan"}
              </span>
            </LeafletTooltip>
          </Marker>
        );
      })}
    </>
  );
}

/* --- Service areas ------------------------------------------------------------ */

export function ServiceAreaLayer() {
  const facilities = useSylvida((s) => s.facilities);
  const result = useSylvida((s) => s.result);
  const selectedId = useSylvida((s) => s.selectedFacilityId);
  const show = useSylvida((s) => s.layers.serviceAreas);

  const all = [...facilities, ...(result?.facilities ?? [])];
  const selected = all.find((f) => f.id === selectedId);
  // Only the selected catchment is drawn. Drawing all of them turns the map
  // into overlapping discs and hides the field underneath.
  const shown = selected ? [selected] : [];

  if (!show) return null;

  return (
    <>
      {shown.map((facility) => (
        <Circle
          key={`area-${facility.id}`}
          center={[facility.position.lat, facility.position.lng]}
          radius={facility.serviceRadiusKm * 1000}
          pathOptions={{
            color: facilityColor[facility.type],
            weight: 1.2,
            opacity: 0.65,
            fillColor: facilityColor[facility.type],
            fillOpacity: 0.07,
            interactive: false,
          }}
        />
      ))}
    </>
  );
}

/* --- Constraint overlays --------------------------------------------------------- */

export function ConstraintLayer() {
  const show = useSylvida((s) => s.layers.constraints);
  if (!show) return null;

  return (
    <>
      {NEIGHBOURHOODS.filter((w) => w.floodRisk > 0.55).map((ward) => (
        <Polygon
          key={`flood-${ward.id}`}
          positions={ring(ward)}
          pathOptions={{
            color: "#5C7BE8",
            weight: 1,
            opacity: 0.5,
            fillColor: "#5C7BE8",
            fillOpacity: 0.14,
            interactive: false,
            dashArray: "3 5",
          }}
        />
      ))}
      {NEIGHBOURHOODS.filter((w) => w.isProtected).map((ward) => (
        <Polygon
          key={`protected-${ward.id}`}
          positions={ring(ward)}
          pathOptions={{
            color: semantic.warn,
            weight: 1,
            opacity: 0.55,
            fillColor: semantic.warn,
            fillOpacity: 0.1,
            interactive: false,
            dashArray: "1 6",
          }}
        />
      ))}
    </>
  );
}

/* --- Optimization search ----------------------------------------------------------- */

export function CandidateLayer() {
  const phase = useSylvida((s) => s.optimizationPhase);
  const revealed = useSylvida((s) => s.revealedCandidates);
  const candidates = useSylvida((s) => s.candidates);

  if (phase !== "running" || candidates.length === 0) return null;

  return (
    <>
      {candidates.slice(0, revealed).map((candidate) => (
        <CircleMarker
          key={candidate.id}
          center={[candidate.position.lat, candidate.position.lng]}
          radius={candidate.rejectedBy ? 3 : 5}
          pathOptions={{
            color: candidate.rejectedBy ? "#4A5562" : facilityColor[candidate.type],
            weight: 1,
            opacity: candidate.rejectedBy ? 0.45 : 0.9,
            fillColor: candidate.rejectedBy
              ? "#4A5562"
              : facilityColor[candidate.type],
            fillOpacity: candidate.rejectedBy ? 0.12 : 0.28,
            interactive: false,
          }}
        />
      ))}
    </>
  );
}

/* --- Placement ---------------------------------------------------------------------- */

export function PlacementLayer() {
  const draggingType = useSylvida((s) => s.draggingType);
  const ghost = useSylvida((s) => s.ghost);
  const updateGhost = useSylvida((s) => s.updateGhost);
  const drop = useSylvida((s) => s.dropFacility);
  const cancelDrag = useSylvida((s) => s.cancelDrag);
  const clearSelection = useSylvida((s) => s.clearSelection);

  useMapEvents({
    mousemove: (event: LeafletMouseEvent) => {
      if (!draggingType) return;
      updateGhost({ lat: event.latlng.lat, lng: event.latlng.lng });
    },
    click: (event: LeafletMouseEvent) => {
      if (draggingType) {
        drop({ lat: event.latlng.lat, lng: event.latlng.lng });
        return;
      }
      clearSelection();
    },
  });

  useEffect(() => {
    if (!draggingType) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancelDrag();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draggingType, cancelDrag]);

  if (!draggingType || !ghost) return null;

  const spec = FACILITY_SPECS[draggingType];
  const valid = ghost.check.ok;

  return (
    <>
      <Circle
        center={[ghost.point.lat, ghost.point.lng]}
        radius={spec.serviceRadiusKm * 1000}
        pathOptions={{
          color: valid ? facilityColor[draggingType] : semantic.danger,
          weight: 1.2,
          opacity: 0.7,
          dashArray: "4 6",
          fillColor: valid ? facilityColor[draggingType] : semantic.danger,
          fillOpacity: 0.06,
          interactive: false,
        }}
      />
      <Marker
        position={[ghost.point.lat, ghost.point.lng]}
        icon={ghostIcon(draggingType, valid)}
        interactive={false}
        zIndexOffset={900}
      />
    </>
  );
}

/* --- Camera ------------------------------------------------------------------------- */

export function CameraController({ bounds }: { bounds: LatLng[] }) {
  const map = useMap();
  const focus = useSylvida((s) => s.mapFocus);
  const reduced = useReducedMotion();
  const fitted = useRef(false);

  useEffect(() => {
    if (fitted.current || bounds.length === 0) return;
    fitted.current = true;
    map.fitBounds(
      bounds.map((p) => [p.lat, p.lng] as [number, number]),
      { padding: [48, 48], animate: false },
    );
  }, [map, bounds]);

  useEffect(() => {
    if (!focus) return;
    map.flyTo([focus.center.lat, focus.center.lng], focus.zoom ?? map.getZoom(), {
      duration: reduced ? 0 : 0.85,
    });
  }, [focus, map, reduced]);

  return null;
}
