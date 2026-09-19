"use client";

/**
 * The planning canvas.
 *
 * Leaflet is wrapped here and nowhere else. Swapping to MapLibre later means
 * replacing this file and the layer components beside it; nothing in the
 * panels, the store or the engine knows which map library is in use.
 */

import "leaflet/dist/leaflet.css";
import { useEffect, useState } from "react";
import { MapContainer, TileLayer } from "react-leaflet";
import { CITY_BOUNDS, NEIGHBOURHOODS } from "@/data/city";
import { BASEMAP, DEMO_CITY } from "@/lib/config";
import { z } from "@/lib/tokens";
import { useSylvida } from "@/store/useSylvida";
import {
  CameraController,
  CandidateLayer,
  ConstraintLayer,
  FacilityLayer,
  HeatSurface,
  PlacementLayer,
  ServiceAreaLayer,
  StudyAreaLayer,
  WardLayer,
} from "./layers";
import { ComparisonHandle, ComparisonLayer } from "./ComparisonLayer";
import { MapControls, MapLegend } from "./MapControls";

const CORNERS = [
  { lat: CITY_BOUNDS.south, lng: CITY_BOUNDS.west },
  { lat: CITY_BOUNDS.north, lng: CITY_BOUNDS.east },
];

export default function MapCanvas() {
  const draggingType = useSylvida((s) => s.draggingType);
  const heatVisible = useSylvida((s) => s.layers.heat);
  const presentMode = useSylvida((s) => s.presentMode);
  const [tilesFailed, setTilesFailed] = useState(false);

  // The placement cursor has to live on the container, which Leaflet owns.
  useEffect(() => {
    const root = document.querySelector(".sylvida-map");
    if (!root) return;
    root.classList.toggle("sylvida-cursor-place", Boolean(draggingType));
  }, [draggingType]);

  return (
    <div
      className="sylvida-map relative h-full w-full"
      style={{ zIndex: z.mapOverlay }}
    >
      <MapContainer
        center={[DEMO_CITY.lat, DEMO_CITY.lng]}
        zoom={DEMO_CITY.zoom}
        minZoom={11}
        maxZoom={17}
        zoomControl={false}
        attributionControl
        preferCanvas
        className="relative z-0 h-full w-full"
      >
        <TileLayer
          url={BASEMAP.url}
          attribution={BASEMAP.attribution}
          maxZoom={BASEMAP.maxZoom}
          eventHandlers={{ tileerror: () => setTilesFailed(true) }}
        />

        <HeatSurface visible={heatVisible} />
        <ConstraintLayer />
        <StudyAreaLayer />
        <WardLayer />
        <ServiceAreaLayer />
        <CandidateLayer />
        <FacilityLayer />
        <ComparisonLayer />
        <PlacementLayer />
        <CameraController bounds={CORNERS} />
        <MapControls />
        <MapLegend collapsed={presentMode} />
      </MapContainer>

      <ComparisonHandle />

      {tilesFailed ? (
        <div className="pointer-events-none absolute bottom-3 right-3 z-[25] max-w-[260px] rounded-md border border-warn/35 bg-surface/94 px-3 py-2.5">
          <p className="text-[12px] font-medium text-warn">
            Basemap tiles unavailable
          </p>
          <p className="mt-1 text-[11.5px] leading-snug text-ink-3">
            Ward boundaries, the need surface and every metric still work. Only
            the street imagery is missing.
          </p>
        </div>
      ) : null}
    </div>
  );
}

export const WARD_COUNT = NEIGHBOURHOODS.length;
