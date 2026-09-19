"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { checkApiHealth } from "@/lib/api/client";

const MapCanvas = dynamic(() => import("@/components/map/map-canvas"), {
  ssr: false,
  loading: () => <p className="py-8 text-sm text-muted-foreground">Loading map libraries…</p>,
});

export function FoundationCheck() {
  const [status, setStatus] = useState("API connection has not been checked.");
  const [checking, setChecking] = useState(false);
  const [showMap, setShowMap] = useState(false);

  async function check() {
    setChecking(true);
    try {
      const result = await checkApiHealth();
      setStatus(`${result.service}: ${result.status}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "API is unavailable.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Button onClick={check} disabled={checking}>{checking ? "Checking…" : "Check API connection"}</Button>
        <Button variant="outline" onClick={() => setShowMap(!showMap)} aria-expanded={showMap}>
          {showMap ? "Close map canvas" : "Open map canvas"}
        </Button>
      </div>
      <p role="status" className="text-sm text-muted-foreground">{status}</p>
      {showMap ? <div className="space-y-3">
        <MapCanvas />
        <p className="text-xs text-muted-foreground">MapLibre + deck.gl canvas. Set a map style URL to load a basemap.</p>
      </div> : null}
    </div>
  );
}
