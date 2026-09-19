"use client";

import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { APP_VERSION, MIN_DESKTOP_WIDTH } from "@/lib/config";
import { z } from "@/lib/tokens";
import { useSylvida } from "@/store/useSylvida";
import { AssistantButton, AssistantDrawer } from "@/components/assistant/Assistant";
import { IconButton } from "@/components/shared/Button";
import { Skeleton } from "@/components/shared/Panel";
import { BuildPanel } from "./BuildPanel";
import { BlockedDialog, Onboarding, Toasts } from "./Feedback";
import { Inspector } from "./Inspector";
import { MethodDrawer } from "./MethodDrawer";
import { MetricsBar } from "./MetricsBar";
import { NeedsPanel } from "./NeedsPanel";
import { OptimizationProgress } from "./OptimizationProgress";
import { OptimizePanel } from "./OptimizePanel";
import { ResultsPanel } from "./ResultsPanel";
import { ScenarioPanel } from "./ScenarioPanel";
import { TopNav } from "./TopNav";

/** Leaflet touches window on import, so the canvas is client-only. */
const MapCanvas = dynamic(() => import("@/components/map/MapCanvas"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[#0A0E13]">
      <div className="w-[240px]">
        <Skeleton className="h-2 w-24" />
        <p className="mt-3 text-[12px] text-ink-4">Loading city...</p>
      </div>
    </div>
  ),
});

export function SimulatorShell() {
  const mode = useSylvida((s) => s.mode);
  const leftCollapsed = useSylvida((s) => s.leftCollapsed);
  const rightCollapsed = useSylvida((s) => s.rightCollapsed);
  const setLeftCollapsed = useSylvida((s) => s.setLeftCollapsed);
  const setRightCollapsed = useSylvida((s) => s.setRightCollapsed);
  const startOnboarding = useSylvida((s) => s.startOnboarding);
  const phase = useSylvida((s) => s.optimizationPhase);
  const narrow = useNarrowViewport();

  useEffect(() => {
    startOnboarding();
  }, [startOnboarding]);

  if (narrow) return <NarrowNotice />;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-void">
      <TopNav />

      <div className="flex min-h-0 flex-1">
        <aside
          className="relative flex shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-[260ms]"
          style={{
            zIndex: z.panel,
            width: leftCollapsed
              ? "var(--panel-left-collapsed)"
              : "var(--panel-left)",
          }}
        >
          {leftCollapsed ? (
            <div className="flex justify-center pt-3">
              <IconButton
                label="Expand the planning panel"
                size="sm"
                onClick={() => setLeftCollapsed(false)}
              >
                <PanelLeftOpen size={14} />
              </IconButton>
            </div>
          ) : (
            <>
              <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
                {mode === "plan" ? (
                  <>
                    <NeedsPanel />
                    <div className="border-t border-line-soft" />
                    <BuildPanel />
                    <ScenarioPanel />
                  </>
                ) : (
                  <OptimizePanel />
                )}
              </div>
              <div className="flex items-center justify-between border-t border-line-soft px-3 py-2">
                <span className="text-[10px] text-ink-4">{APP_VERSION}</span>
                <IconButton
                  label="Collapse the planning panel"
                  size="sm"
                  onClick={() => setLeftCollapsed(true)}
                >
                  <PanelLeftClose size={14} />
                </IconButton>
              </div>
            </>
          )}
        </aside>

        <main className="relative min-w-0 flex-1">
          <MapCanvas />
          <OptimizationProgress />
        </main>

        <aside
          className="relative flex shrink-0 flex-col border-l border-line bg-surface transition-[width] duration-[260ms]"
          style={{
            zIndex: z.panel,
            width: rightCollapsed
              ? "var(--panel-left-collapsed)"
              : "var(--panel-right)",
          }}
        >
          {rightCollapsed ? (
            <div className="flex justify-center pt-3">
              <IconButton
                label="Expand the inspector"
                size="sm"
                onClick={() => setRightCollapsed(false)}
              >
                <PanelRightOpen size={14} />
              </IconButton>
            </div>
          ) : (
            <>
              <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
                {mode === "optimize" && phase !== "idle" ? (
                  <ResultsPanel />
                ) : (
                  <Inspector />
                )}
              </div>
              <div className="flex justify-end border-t border-line-soft px-3 py-2">
                <IconButton
                  label="Collapse the inspector"
                  size="sm"
                  onClick={() => setRightCollapsed(true)}
                >
                  <PanelRightClose size={14} />
                </IconButton>
              </div>
            </>
          )}
        </aside>
      </div>

      <MetricsBar />

      <Toasts />
      <BlockedDialog />
      <Onboarding />
      <MethodDrawer />
      <AssistantButton />
      <AssistantDrawer />
    </div>
  );
}

function useNarrowViewport(): boolean {
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const check = () => setNarrow(window.innerWidth < MIN_DESKTOP_WIDTH);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  return narrow;
}

function NarrowNotice() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-8">
      <div className="max-w-[380px]">
        <h1 className="text-[20px] font-semibold text-ink">
          Open Sylvida on a desktop-sized screen
        </h1>
        <p className="mt-3 text-[13px] leading-relaxed text-ink-3">
          The planning workspace puts a map, two panels and a live metrics bar
          on screen at once. Below {MIN_DESKTOP_WIDTH} pixels wide there is not
          enough room to show cause and effect side by side, so the simulator
          waits for a wider window rather than showing you a worse version of
          itself.
        </p>
      </div>
    </div>
  );
}
