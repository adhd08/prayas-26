"use client";

import { useEffect, useRef, useState } from "react";
import { Map, NavigationControl, type StyleSpecification } from "maplibre-gl";
import { MapboxOverlay } from "@deck.gl/mapbox";
import type { LayersList } from "@deck.gl/core";

const emptyLayers: LayersList = [];
const blankStyle: StyleSpecification = {
  version: 8, sources: {},
  layers: [{ id: "background", type: "background", paint: { "background-color": "#18181b" } }],
};

export default function MapCanvas({ layers = emptyLayers }: { layers?: LayersList }) {
  const container = useRef<HTMLDivElement>(null);
  const overlay = useRef<MapboxOverlay | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!container.current) return;
    let map: Map | undefined;
    try {
      map = new Map({
        container: container.current,
        style: process.env.NEXT_PUBLIC_MAP_STYLE_URL || blankStyle,
        center: [78.96, 20.59], zoom: 4,
      });
      const deck = new MapboxOverlay({ interleaved: true, layers: [] });
      overlay.current = deck;
      map.addControl(deck);
      map.addControl(new NavigationControl(), "top-right");
      map.on("error", () => setError("Map could not load. Check the style URL and WebGL support."));
      const resize = new ResizeObserver(() => map?.resize());
      resize.observe(container.current);
      return () => {
        resize.disconnect();
        map?.remove();
        overlay.current = null;
      };
    } catch {
      map?.remove();
      overlay.current = null;
      queueMicrotask(() => setError("Map initialization needs WebGL support."));
    }
  }, []);

  useEffect(() => { overlay.current?.setProps({ layers }); }, [layers]);

  return (
    <div className="relative h-80 overflow-hidden rounded-lg border">
      <div ref={container} className="h-full w-full" aria-label="Map canvas" />
      {error ? <p role="alert" className="absolute bottom-4 left-4 right-4 rounded bg-background p-3 text-sm">{error}</p> : null}
    </div>
  );
}
