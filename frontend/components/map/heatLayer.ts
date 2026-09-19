/**
 * Continuous need surface.
 *
 * A Leaflet canvas layer rather than circles on the map: planners read a field,
 * not a scatter of discs. Points are rendered as overlapping radial brushes
 * into a low-resolution buffer, then colourised through a 256-entry ramp and
 * scaled up, which gives a smooth gradient for very little work per frame.
 *
 * Intensities are interpolated between the previous and next field when the
 * layer changes, so switching need layers or placing a facility reads as the
 * city responding rather than as a hard cut.
 */

import L from "leaflet";
import { sampleNeedRamp } from "@/lib/tokens";
import type { HeatPoint } from "@/types";

/** Metres. Roughly twice the sample spacing, which is what blends the field. */
const BRUSH_METRES = 820;
/** Buffer scale. Lower is faster and blurrier; 0.34 is the sweet spot here. */
const BUFFER_SCALE = 0.34;
const TRANSITION_MS = 560;
/**
 * Peak contribution of one brush, low enough that the eight or so brushes
 * overlapping a typical pixel sum well short of the 255 channel ceiling.
 */
const BRUSH_WEIGHT = 0.1;
/** Below this accumulated weight a pixel has too little data to colour. */
const COVERAGE_FLOOR = 10;
/** Accumulated weight at which the surface reaches full opacity. */
const COVERAGE_FULL = 72;

function buildPalette(): Uint8ClampedArray {
  const palette = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const [r, g, b] = sampleNeedRamp(i / 255);
    palette[i * 3] = r;
    palette[i * 3 + 1] = g;
    palette[i * 3 + 2] = b;
  }
  return palette;
}

const PALETTE = buildPalette();

export interface HeatLayerOptions {
  /** Peak opacity of the surface, 0-1. */
  opacity?: number;
  /** Suppresses the morph and paints the new field immediately. */
  instant?: boolean;
  /** Custom Leaflet pane, used by the before and after comparison. */
  pane?: string;
}

export class NeedHeatLayer extends L.Layer {
  /** Own reference rather than Leaflet's private _map. */
  private map: L.Map | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private buffer: HTMLCanvasElement | null = null;
  private points: HeatPoint[] = [];
  private current: Float32Array = new Float32Array(0);
  private from: Float32Array = new Float32Array(0);
  private target: Float32Array = new Float32Array(0);
  private transitionStart = 0;
  private frame: number | null = null;
  private opacity: number;
  private instant: boolean;
  private paneName: string;

  constructor(points: HeatPoint[], options: HeatLayerOptions = {}) {
    super();
    this.opacity = options.opacity ?? 0.72;
    this.instant = options.instant ?? false;
    this.paneName = options.pane ?? "overlayPane";
    this.points = points;
    this.current = Float32Array.from(points.map((p) => p.intensity));
    this.from = this.current.slice();
    this.target = this.current.slice();
  }

  onAdd(map: L.Map): this {
    this.map = map;
    const canvas = L.DomUtil.create("canvas", "sylvida-heat") as HTMLCanvasElement;
    canvas.style.position = "absolute";
    canvas.style.pointerEvents = "none";
    canvas.style.willChange = "transform";
    canvas.style.transition = "opacity 140ms linear";
    this.canvas = canvas;
    this.buffer = document.createElement("canvas");

    const pane = map.getPane(this.paneName) ?? map.getPanes().overlayPane;
    pane?.appendChild(canvas);
    map.on("moveend zoomend resize", this.reset, this);
    map.on("zoomstart", this.onZoomStart, this);
    this.reset();
    return this;
  }

  onRemove(map: L.Map): this {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    map.off("moveend zoomend resize", this.reset, this);
    map.off("zoomstart", this.onZoomStart, this);
    this.canvas?.remove();
    this.canvas = null;
    this.buffer = null;
    this.map = null;
    return this;
  }

  setOpacity(value: number) {
    this.opacity = value;
    this.draw();
  }

  /**
   * Hands the layer a new field. Positions are assumed stable, so only the
   * intensities morph; a changed length repaints immediately.
   */
  setField(points: HeatPoint[], instant = false) {
    const lengthChanged = points.length !== this.points.length;
    this.points = points;
    this.target = Float32Array.from(points.map((p) => p.intensity));

    if (instant || this.instant || lengthChanged) {
      this.current = this.target.slice();
      this.from = this.target.slice();
      this.draw();
      return;
    }

    this.from = this.current.slice();
    this.transitionStart = performance.now();
    this.animate();
  }

  private animate = () => {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    const step = () => {
      const t = Math.min(
        1,
        (performance.now() - this.transitionStart) / TRANSITION_MS,
      );
      const eased = 1 - Math.pow(1 - t, 3);
      for (let i = 0; i < this.target.length; i++) {
        const a = this.from[i] ?? 0;
        this.current[i] = a + (this.target[i] - a) * eased;
      }
      this.draw();
      this.frame = t < 1 ? requestAnimationFrame(step) : null;
    };
    this.frame = requestAnimationFrame(step);
  };

  /**
   * The painted surface cannot be re-projected mid-tween without reaching into
   * Leaflet internals, so it fades out for the length of the zoom and is
   * repainted at the new scale on zoomend.
   */
  private onZoomStart = () => {
    if (this.canvas) this.canvas.style.opacity = "0";
  };

  private reset = () => {
    const map = this.map;
    const canvas = this.canvas;
    if (!map || !canvas) return;

    const size = map.getSize();
    canvas.width = size.x;
    canvas.height = size.y;
    canvas.style.width = `${size.x}px`;
    canvas.style.height = `${size.y}px`;

    const topLeft = map.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(canvas, topLeft);

    if (this.buffer) {
      this.buffer.width = Math.max(1, Math.round(size.x * BUFFER_SCALE));
      this.buffer.height = Math.max(1, Math.round(size.y * BUFFER_SCALE));
    }
    canvas.style.opacity = "1";
    this.draw();
  };

  /** Brush radius in buffer pixels for the current zoom. */
  private brushRadius(map: L.Map): number {
    const centre = map.getCenter();
    const metresPerDegLng = 111_320 * Math.cos((centre.lat * Math.PI) / 180);
    const east = L.latLng(
      centre.lat,
      centre.lng + BRUSH_METRES / metresPerDegLng,
    );
    const a = map.latLngToContainerPoint(centre);
    const b = map.latLngToContainerPoint(east);
    return Math.max(4, Math.abs(b.x - a.x) * BUFFER_SCALE);
  }

  private draw() {
    const map = this.map;
    const canvas = this.canvas;
    const buffer = this.buffer;
    if (!map || !canvas || !buffer) return;

    const ctx = canvas.getContext("2d");
    const bctx = buffer.getContext("2d", { willReadFrequently: true });
    if (!ctx || !bctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    bctx.clearRect(0, 0, buffer.width, buffer.height);

    const radius = this.brushRadius(map);
    const pad = radius * 2;

    /*
     * Two accumulations, one pass.
     *
     * Summing alpha alone saturates: where brushes overlap, a moderate need
     * reads as critical simply because several samples landed on the same
     * pixel. So the red channel accumulates need weighted by brush falloff and
     * the green channel accumulates the falloff on its own. Dividing one by
     * the other recovers the actual need at that pixel, and the green channel
     * doubles as coverage, which fades the surface out at the study boundary.
     */
    bctx.globalCompositeOperation = "lighter";

    for (let i = 0; i < this.points.length; i++) {
      const intensity = Math.min(1, Math.max(0, this.current[i] ?? 0));
      const point = map.latLngToContainerPoint([
        this.points[i].lat,
        this.points[i].lng,
      ]);
      const x = point.x * BUFFER_SCALE;
      const y = point.y * BUFFER_SCALE;
      if (
        x < -pad ||
        y < -pad ||
        x > buffer.width + pad ||
        y > buffer.height + pad
      ) {
        continue;
      }
      const weight = Math.round(BRUSH_WEIGHT * 255);
      const value = Math.round(BRUSH_WEIGHT * 255 * intensity);
      const gradient = bctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, `rgb(${value},${weight},0)`);
      gradient.addColorStop(1, "rgb(0,0,0)");
      bctx.fillStyle = gradient;
      bctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }

    bctx.globalCompositeOperation = "source-over";

    const image = bctx.getImageData(0, 0, buffer.width, buffer.height);
    const data = image.data;
    for (let i = 0; i < data.length; i += 4) {
      const weight = data[i + 1];
      if (weight < COVERAGE_FLOOR) {
        data[i + 3] = 0;
        continue;
      }
      const need = Math.min(255, Math.round((data[i] / weight) * 255));
      const index = need * 3;
      data[i] = PALETTE[index];
      data[i + 1] = PALETTE[index + 1];
      data[i + 2] = PALETTE[index + 2];
      // Well-served ground stays quiet; the surface also fades where sample
      // coverage thins out, which softens the edge of the study area.
      const coverage = Math.min(1, weight / COVERAGE_FULL);
      const emphasis = 0.32 + 0.68 * (need / 255);
      data[i + 3] = Math.round(255 * coverage * emphasis);
    }
    bctx.putImageData(image, 0, 0);

    ctx.globalAlpha = this.opacity;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(buffer, 0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;
  }
}

export function createHeatLayer(
  points: HeatPoint[],
  options?: HeatLayerOptions,
) {
  return new NeedHeatLayer(points, options);
}
