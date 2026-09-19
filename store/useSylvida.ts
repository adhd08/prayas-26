"use client";

/**
 * Application state.
 *
 * One store, sliced by concern. Components read what they need and call
 * actions; none of them talk to the engine or the services directly, so the
 * backend handover stays confined to lib/api.
 */

import { create } from "zustand";
import { EXISTING_FACILITIES, NEIGHBOURHOOD_BY_ID } from "@/data/city";
import {
  DEFAULT_BUDGET,
  DEFAULT_CONSTRAINTS,
  DEFAULT_PRIORITIES,
  DEFAULT_RESOURCES,
} from "@/data/defaults";
import { FACILITY_SPECS } from "@/data/facilityCatalog";
import type { ScenarioPreset } from "@/data/scenarios";
import {
  assistantApi,
  optimizationApi,
  scenarioApi,
  simulationApi,
} from "@/lib/api";
import { formatCost, formatPeopleExact } from "@/lib/format";
import {
  checkPlacement,
  computeMetrics,
  createFacility,
  populationServed,
  type PlacementCheck,
} from "@/lib/simulation/engine";
import { OPTIMIZATION_STEPS } from "@/lib/simulation/optimizer";
import type {
  AssistantContext,
  AssistantIntent,
  AssistantMessage,
  Constraint,
  ConstraintId,
  Facility,
  FacilityType,
  InfeasibleResult,
  LatLng,
  NeedType,
  OptimizationCandidate,
  OptimizationPhase,
  OptimizationResult,
  ParsedPlanningGoal,
  PlanningMode,
  PlanningPriorities,
  PriorityId,
  ResourceBudget,
  Scenario,
  SimulationMetrics,
  WhatIfId,
  WhatIfOutcome,
} from "@/types";

export interface Toast {
  id: string;
  title: string;
  body?: string;
  tone: "info" | "success" | "warning" | "danger";
  /** Optional before and after pair rendered as a compact readout. */
  readout?: { label: string; from: string; to: string };
}

/** The slice of state that undo and redo restore. */
interface PlanSnapshot {
  facilities: Facility[];
  budget: number;
  priorities: PlanningPriorities;
  resources: ResourceBudget;
  constraints: Constraint[];
}

interface MapFocus {
  center: LatLng;
  zoom?: number;
  /** Bumped on every request so the map re-runs the move. */
  nonce: number;
}

interface State {
  mode: PlanningMode;
  need: NeedType;

  facilities: Facility[];
  metrics: SimulationMetrics;

  selectedNeighbourhoodId: string | null;
  selectedFacilityId: string | null;
  hoveredNeighbourhoodId: string | null;

  budget: number;
  priorities: PlanningPriorities;
  resources: ResourceBudget;
  constraints: Constraint[];
  goalText: string;
  goalFeedback: ParsedPlanningGoal | null;

  /** Facility type currently being dragged from the build palette. */
  draggingType: FacilityType | null;
  ghost: { point: LatLng; check: PlacementCheck } | null;
  blocked: PlacementCheck | null;

  optimizationPhase: OptimizationPhase;
  optimizationProgress: number;
  completedSteps: string[];
  result: OptimizationResult | null;
  infeasible: InfeasibleResult | null;
  /** Published as soon as the search returns so the map can animate it. */
  candidates: OptimizationCandidate[];
  revealedCandidates: number;

  comparisonOpen: boolean;
  comparisonSplit: number;

  layers: {
    heat: boolean;
    existing: boolean;
    proposed: boolean;
    serviceAreas: boolean;
    constraints: boolean;
    labels: boolean;
  };

  leftCollapsed: boolean;
  rightCollapsed: boolean;
  presentMode: boolean;
  methodOpen: boolean;
  onboardingStep: number | null;

  assistantOpen: boolean;
  assistantBusy: boolean;
  messages: AssistantMessage[];

  scenarios: Scenario[];
  whatIf: WhatIfOutcome | null;
  whatIfBusy: WhatIfId | null;

  toasts: Toast[];
  mapFocus: MapFocus | null;

  past: PlanSnapshot[];
  future: PlanSnapshot[];
}

interface Actions {
  setMode: (mode: PlanningMode) => void;
  setNeed: (need: NeedType) => void;

  selectNeighbourhood: (id: string | null) => void;
  selectFacility: (id: string | null) => void;
  hoverNeighbourhood: (id: string | null) => void;
  clearSelection: () => void;
  focusOn: (center: LatLng, zoom?: number) => void;

  beginDrag: (type: FacilityType) => void;
  updateGhost: (point: LatLng | null) => void;
  cancelDrag: () => void;
  dropFacility: (point: LatLng) => void;
  moveFacility: (id: string, point: LatLng) => void;
  deleteFacility: (id: string) => void;
  dismissBlocked: () => void;

  setBudget: (value: number) => void;
  setPriority: (id: PriorityId, value: number) => void;
  setResource: (type: FacilityType, value: number) => void;
  updateConstraint: (id: ConstraintId, patch: Partial<Constraint>) => void;
  setGoalText: (text: string) => void;
  applyGoal: (goal: ParsedPlanningGoal) => void;

  runOptimization: () => Promise<void>;
  cancelOptimization: () => void;
  adoptResult: () => void;
  reviewFacility: (id: string, review: "accepted" | "rejected") => void;
  toggleComparison: (open?: boolean) => void;
  setComparisonSplit: (value: number) => void;

  toggleLayer: (key: keyof State["layers"]) => void;
  setLeftCollapsed: (value: boolean) => void;
  setRightCollapsed: (value: boolean) => void;
  setPresentMode: (value: boolean) => void;
  setMethodOpen: (value: boolean) => void;
  advanceOnboarding: () => void;
  skipOnboarding: () => void;
  startOnboarding: () => void;

  openAssistant: (seed?: string) => void;
  closeAssistant: () => void;
  sendAssistantMessage: (text: string) => Promise<void>;
  confirmIntent: (messageId: string) => Promise<void>;
  dismissIntent: (messageId: string) => void;

  loadScenarios: () => Promise<void>;
  saveScenario: (name: string) => Promise<void>;
  deleteScenario: (id: string) => Promise<void>;
  loadPreset: (preset: ScenarioPreset) => void;
  exportScenario: () => void;

  runWhatIf: (id: WhatIfId) => Promise<void>;
  clearWhatIf: () => void;

  pushToast: (toast: Omit<Toast, "id">) => void;
  dismissToast: (id: string) => void;

  undo: () => void;
  redo: () => void;
  resetPlan: () => void;
  restoreDemo: () => void;
}

export type SylvidaStore = State & Actions;

const ONBOARDING_KEY = "sylvida.onboarded.v1";

const baseFacilities = () => EXISTING_FACILITIES.map((f) => ({ ...f }));

function snapshot(state: State): PlanSnapshot {
  return {
    facilities: state.facilities.map((f) => ({ ...f })),
    budget: state.budget,
    priorities: { ...state.priorities },
    resources: { ...state.resources },
    constraints: state.constraints.map((c) => ({ ...c })),
  };
}

let toastSeq = 0;
let optimizationTimer: ReturnType<typeof setInterval> | null = null;

/** Total wall-clock time of the optimization reveal, in milliseconds. */
const RUN_DURATION = 5200;
const RUN_TICK = 70;

export const useSylvida = create<SylvidaStore>((set, get) => {
  /** Applies a plan change, records it for undo and refreshes metrics. */
  const commit = (
    mutate: (draft: State) => Partial<State>,
    options: { history?: boolean } = { history: true },
  ) => {
    const state = get();
    const before = options.history === false ? null : snapshot(state);
    const patch = mutate(state);
    const facilities = patch.facilities ?? state.facilities;
    set({
      ...patch,
      metrics: computeMetrics(facilities),
      ...(before ? { past: [...state.past, before].slice(-40), future: [] } : {}),
    });
  };

  const restore = (snap: PlanSnapshot) => ({
    facilities: snap.facilities,
    budget: snap.budget,
    priorities: snap.priorities,
    resources: snap.resources,
    constraints: snap.constraints,
    metrics: computeMetrics(snap.facilities),
  });

  const assistantContext = (): AssistantContext => {
    const s = get();
    return {
      mode: s.mode,
      need: s.need,
      neighbourhood: s.selectedNeighbourhoodId
        ? NEIGHBOURHOOD_BY_ID.get(s.selectedNeighbourhoodId)
        : undefined,
      facility:
        s.facilities.find((f) => f.id === s.selectedFacilityId) ?? undefined,
      facilities: s.facilities,
      metrics: s.metrics,
      budget: s.budget,
      priorities: s.priorities,
      result: s.result ?? undefined,
    };
  };

  const initialFacilities = baseFacilities();

  return {
    mode: "plan",
    need: "healthcare",

    facilities: initialFacilities,
    metrics: computeMetrics(initialFacilities),

    selectedNeighbourhoodId: null,
    selectedFacilityId: null,
    hoveredNeighbourhoodId: null,

    budget: DEFAULT_BUDGET,
    priorities: { ...DEFAULT_PRIORITIES },
    resources: { ...DEFAULT_RESOURCES },
    constraints: DEFAULT_CONSTRAINTS.map((c) => ({ ...c })),
    goalText: "",
    goalFeedback: null,

    draggingType: null,
    ghost: null,
    blocked: null,

    optimizationPhase: "idle",
    optimizationProgress: 0,
    completedSteps: [],
    result: null,
    infeasible: null,
    candidates: [],
    revealedCandidates: 0,

    comparisonOpen: false,
    comparisonSplit: 0.5,

    layers: {
      heat: true,
      existing: true,
      proposed: true,
      serviceAreas: true,
      constraints: false,
      labels: true,
    },

    leftCollapsed: false,
    rightCollapsed: false,
    presentMode: false,
    methodOpen: false,
    // Left null on both server and client so hydration matches; the shell
    // starts the tour from an effect once it knows this is a first visit.
    onboardingStep: null,

    assistantOpen: false,
    assistantBusy: false,
    messages: [],

    scenarios: [],
    whatIf: null,
    whatIfBusy: null,

    toasts: [],
    mapFocus: null,

    past: [],
    future: [],

    /* --- selection ------------------------------------------------------- */

    setMode: (mode) => set({ mode, blocked: null, draggingType: null, ghost: null }),
    setNeed: (need) => set({ need }),

    selectNeighbourhood: (id) =>
      set({ selectedNeighbourhoodId: id, selectedFacilityId: null }),
    selectFacility: (id) =>
      set({ selectedFacilityId: id, selectedNeighbourhoodId: null }),
    hoverNeighbourhood: (id) => set({ hoveredNeighbourhoodId: id }),
    clearSelection: () =>
      set({ selectedFacilityId: null, selectedNeighbourhoodId: null }),
    focusOn: (center, zoom) =>
      set({ mapFocus: { center, zoom, nonce: Date.now() } }),

    /* --- placement -------------------------------------------------------- */

    beginDrag: (type) => set({ draggingType: type, blocked: null }),

    updateGhost: (point) => {
      const s = get();
      if (!s.draggingType || !point) {
        set({ ghost: null });
        return;
      }
      set({
        ghost: {
          point,
          check: checkPlacement(
            point,
            s.draggingType,
            s.facilities,
            s.constraints,
          ),
        },
      });
    },

    cancelDrag: () => set({ draggingType: null, ghost: null }),

    dropFacility: (point) => {
      const s = get();
      const type = s.draggingType;
      if (!type) return;
      const check = checkPlacement(point, type, s.facilities, s.constraints);
      if (!check.ok) {
        set({ blocked: check, draggingType: null, ghost: null });
        return;
      }

      const index =
        s.facilities.filter((f) => f.type === type && f.origin !== "existing")
          .length + 1;
      const facility = createFacility(type, point, "user", index);
      const before = s.metrics;
      const next = [...s.facilities, facility];
      const after = computeMetrics(next);
      const served = populationServed(facility, next);
      const spec = FACILITY_SPECS[type];

      commit(() => ({
        facilities: next,
        draggingType: null,
        ghost: null,
        selectedFacilityId: facility.id,
        selectedNeighbourhoodId: null,
      }));

      const coverageKey =
        spec.primaryNeed === "healthcare"
          ? "healthcareCoverage"
          : spec.primaryNeed === "education"
            ? "educationCoverage"
            : spec.primaryNeed === "transit"
              ? "transitCoverage"
              : spec.primaryNeed === "greenspace"
                ? "greenspaceCoverage"
                : spec.primaryNeed === "emergency"
                  ? "emergencyCoverage"
                  : "housingAdequacy";

      get().pushToast({
        title: `${facility.name} placed`,
        body: `${formatPeopleExact(served)} residents within the estimated service area. ${formatCost(spec.cost)} committed.`,
        tone: "success",
        readout: {
          label: `${spec.primaryNeed === "housing" ? "Housing adequacy" : "Coverage"}`,
          from: `${before[coverageKey].toFixed(1)}%`,
          to: `${after[coverageKey].toFixed(1)}%`,
        },
      });
    },

    moveFacility: (id, point) => {
      const s = get();
      const facility = s.facilities.find((f) => f.id === id);
      if (!facility) return;
      const check = checkPlacement(
        point,
        facility.type,
        s.facilities.filter((f) => f.id !== id),
        s.constraints,
      );
      if (!check.ok) {
        set({ blocked: check });
        return;
      }
      commit((draft) => ({
        facilities: draft.facilities.map((f) =>
          f.id === id ? { ...f, position: point } : f,
        ),
      }));
      get().pushToast({
        title: `${facility.name} moved`,
        body: check.message,
        tone: "info",
      });
    },

    deleteFacility: (id) => {
      const s = get();
      const facility = s.facilities.find((f) => f.id === id);
      if (!facility || facility.origin === "existing") return;
      commit((draft) => ({
        facilities: draft.facilities.filter((f) => f.id !== id),
        selectedFacilityId: null,
      }));
      get().pushToast({
        title: `${facility.name} removed`,
        body: `${formatCost(facility.estimatedCost)} returned to the budget. Undo restores it.`,
        tone: "info",
      });
    },

    dismissBlocked: () => set({ blocked: null }),

    /* --- objective -------------------------------------------------------- */

    setBudget: (value) => commit(() => ({ budget: value })),
    setPriority: (id, value) =>
      commit((draft) => ({ priorities: { ...draft.priorities, [id]: value } })),
    setResource: (type, value) =>
      commit((draft) => ({
        resources: { ...draft.resources, [type]: Math.max(0, value) },
      })),
    updateConstraint: (id, patch) =>
      commit((draft) => ({
        constraints: draft.constraints.map((c) =>
          c.id === id ? { ...c, ...patch } : c,
        ),
      })),
    setGoalText: (text) => set({ goalText: text }),

    applyGoal: (goal) => {
      commit((draft) => {
        const priorities = { ...draft.priorities, ...goal.priorities };
        const constraints = draft.constraints.map((c) => {
          const change = goal.constraints.find((g) => g.id === c.id);
          if (!change) return c;
          return {
            ...c,
            ...(change.enabled !== undefined ? { enabled: change.enabled } : {}),
            ...(change.value !== undefined ? { value: change.value } : {}),
          };
        });
        return {
          priorities,
          constraints,
          budget: goal.budget ?? draft.budget,
          goalFeedback: goal,
        };
      });
      get().pushToast({
        title: "Planning objective updated",
        body: goal.summary,
        tone: "info",
      });
    },

    /* --- optimization ------------------------------------------------------ */

    runOptimization: async () => {
      const s = get();
      if (s.optimizationPhase === "running") return;
      if (optimizationTimer) clearInterval(optimizationTimer);

      set({
        optimizationPhase: "running",
        optimizationProgress: 0,
        completedSteps: [],
        result: null,
        infeasible: null,
        candidates: [],
        revealedCandidates: 0,
        comparisonOpen: false,
      });

      const outcome = await optimizationApi.run({
        facilities: s.facilities,
        resources: s.resources,
        budget: s.budget,
        priorities: s.priorities,
        constraints: s.constraints,
      });

      const candidates = outcome.ok ? outcome.result.candidates : [];
      const candidateCount = candidates.length;
      const started = Date.now();
      set({ candidates });

      optimizationTimer = setInterval(() => {
        const elapsed = Date.now() - started;
        const progress = Math.min(1, elapsed / RUN_DURATION);
        const completed = OPTIMIZATION_STEPS.filter(
          (step) => progress >= step.at,
        ).map((step) => step.id);

        set({
          optimizationProgress: progress,
          completedSteps: completed,
          revealedCandidates: Math.round(
            candidateCount * Math.min(1, progress / 0.88),
          ),
        });

        if (progress >= 1) {
          if (optimizationTimer) clearInterval(optimizationTimer);
          optimizationTimer = null;
          if (outcome.ok) {
            set({
              optimizationPhase: "complete",
              result: outcome.result,
              comparisonOpen: true,
            });
            get().pushToast({
              title: "Optimization complete",
              body: `${outcome.result.facilities.length} sites selected for ${formatCost(outcome.result.cost)} of a ${formatCost(outcome.result.budget)} budget.`,
              tone: "success",
            });
          } else {
            set({
              optimizationPhase: "infeasible",
              infeasible: outcome.infeasible,
            });
            get().pushToast({
              title: "No valid configuration found",
              body: outcome.infeasible.reason,
              tone: "warning",
            });
          }
        }
      }, RUN_TICK);
    },

    cancelOptimization: () => {
      if (optimizationTimer) clearInterval(optimizationTimer);
      optimizationTimer = null;
      set({
        optimizationPhase: "idle",
        optimizationProgress: 0,
        completedSteps: [],
        candidates: [],
        revealedCandidates: 0,
      });
    },

    /** Moves the generated sites into the working plan so they can be edited. */
    adoptResult: () => {
      const s = get();
      if (!s.result) return;
      const accepted = s.result.facilities.filter(
        (f) => f.review !== "rejected",
      );
      commit(() => ({
        facilities: [...s.facilities, ...accepted],
        mode: "plan" as PlanningMode,
        comparisonOpen: false,
      }));
      get().pushToast({
        title: "Plan adopted",
        body: `${accepted.length} proposed sites moved into your plan. Every one can be moved or removed.`,
        tone: "success",
      });
    },

    reviewFacility: (id, review) =>
      set((state) => ({
        result: state.result
          ? {
              ...state.result,
              facilities: state.result.facilities.map((f) =>
                f.id === id ? { ...f, review } : f,
              ),
            }
          : null,
      })),

    toggleComparison: (open) =>
      set((state) => ({ comparisonOpen: open ?? !state.comparisonOpen })),
    setComparisonSplit: (value) => set({ comparisonSplit: value }),

    /* --- interface -------------------------------------------------------- */

    toggleLayer: (key) =>
      set((state) => ({
        layers: { ...state.layers, [key]: !state.layers[key] },
      })),
    setLeftCollapsed: (value) => set({ leftCollapsed: value }),
    setRightCollapsed: (value) => set({ rightCollapsed: value }),
    setPresentMode: (value) =>
      set({ presentMode: value, leftCollapsed: value, rightCollapsed: value }),
    setMethodOpen: (value) => set({ methodOpen: value }),

    /** Starts the tour unless this browser has already finished it. */
    startOnboarding: () => {
      try {
        if (window.localStorage.getItem(ONBOARDING_KEY)) return;
      } catch {
        // Storage blocked. Showing the tour once per session is acceptable.
      }
      set({ onboardingStep: 0 });
    },
    advanceOnboarding: () => {
      const step = get().onboardingStep;
      if (step === null) return;
      if (step >= 3) {
        get().skipOnboarding();
        return;
      }
      set({ onboardingStep: step + 1 });
    },
    skipOnboarding: () => {
      try {
        window.localStorage.setItem(ONBOARDING_KEY, "1");
      } catch {
        // Nothing to do: the tour simply reappears next session.
      }
      set({ onboardingStep: null });
    },

    /* --- assistant --------------------------------------------------------- */

    openAssistant: (seed) => {
      set({ assistantOpen: true });
      if (seed) void get().sendAssistantMessage(seed);
    },
    closeAssistant: () => set({ assistantOpen: false }),

    sendAssistantMessage: async (text) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const userMessage: AssistantMessage = {
        id: `m-${Date.now()}-u`,
        role: "user",
        text: trimmed,
        createdAt: Date.now(),
      };
      set((state) => ({
        messages: [...state.messages, userMessage],
        assistantBusy: true,
      }));

      const answer = await assistantApi.sendMessage(trimmed, assistantContext());

      const reply: AssistantMessage = {
        id: `m-${Date.now()}-a`,
        role: "assistant",
        text: answer.text,
        createdAt: Date.now(),
        evidence: answer.evidence,
        provenance: answer.provenance,
        pendingIntent: answer.intent.mutating ? answer.intent : undefined,
      };

      set((state) => ({
        messages: [...state.messages, reply],
        assistantBusy: false,
      }));

      // Read-only intents act immediately; they change the view, not the plan.
      const intent = answer.intent;
      if (intent.type === "SELECT_LAYER" && intent.payload.need) {
        get().setNeed(intent.payload.need);
      }
      if (intent.type === "FOCUS_LOCATION" && intent.payload.neighbourhoodId) {
        const ward = NEIGHBOURHOOD_BY_ID.get(intent.payload.neighbourhoodId);
        if (ward) {
          get().selectNeighbourhood(ward.id);
          get().focusOn(ward.centroid, 14);
        }
      }
      if (intent.type === "COMPARE" && get().result) {
        get().toggleComparison(true);
      }
    },

    confirmIntent: async (messageId) => {
      const state = get();
      const message = state.messages.find((m) => m.id === messageId);
      const intent = message?.pendingIntent;
      if (!intent) return;

      set({
        messages: state.messages.map((m) =>
          m.id === messageId ? { ...m, pendingIntent: undefined } : m,
        ),
      });

      await executeIntent(intent, get);
    },

    dismissIntent: (messageId) =>
      set((state) => ({
        messages: state.messages.map((m) =>
          m.id === messageId ? { ...m, pendingIntent: undefined } : m,
        ),
      })),

    /* --- scenarios ---------------------------------------------------------- */

    loadScenarios: async () => {
      const scenarios = await scenarioApi.list();
      set({ scenarios });
    },

    saveScenario: async (name) => {
      const s = get();
      const scenario: Scenario = {
        id: `sc-${Date.now().toString(36)}`,
        name: name.trim() || "Untitled scenario",
        description: s.goalText || "Saved from the planning workspace.",
        createdAt: new Date().toISOString(),
        budget: s.budget,
        priorities: { ...s.priorities },
        resources: { ...s.resources },
        constraints: s.constraints.map((c) => ({ ...c })),
        facilities: s.facilities.map((f) => ({ ...f })),
        metrics: s.metrics,
        provenance: "demo",
      };
      const scenarios = await scenarioApi.save(scenario);
      set({ scenarios });
      get().pushToast({
        title: "Scenario saved",
        body: scenario.name,
        tone: "success",
      });
    },

    deleteScenario: async (id) => {
      const scenarios = await scenarioApi.remove(id);
      set({ scenarios });
    },

    loadPreset: (preset) => {
      commit(() => ({
        budget: preset.budget,
        priorities: { ...preset.priorities },
        resources: { ...preset.resources },
        goalText: preset.description,
      }));
      get().pushToast({
        title: `${preset.name} loaded`,
        body: preset.description,
        tone: "info",
      });
    },

    exportScenario: () => {
      const s = get();
      const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        city: "central-kolkata",
        provenance: "demo",
        budget: s.budget,
        priorities: s.priorities,
        resources: s.resources,
        constraints: s.constraints,
        facilities: s.facilities,
        metrics: s.metrics,
        result: s.result,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `sylvida-scenario-${Date.now()}.json`;
      link.click();
      URL.revokeObjectURL(url);
      get().pushToast({
        title: "Scenario exported",
        body: "A JSON snapshot of the current plan was downloaded.",
        tone: "success",
      });
    },

    /* --- what-if ------------------------------------------------------------ */

    runWhatIf: async (id) => {
      set({ whatIfBusy: id });
      const s = get();
      const outcome = await simulationApi.whatIf(id, s.facilities, s.budget);
      set({ whatIf: outcome, whatIfBusy: null });
    },
    clearWhatIf: () => set({ whatIf: null }),

    /* --- toasts -------------------------------------------------------------- */

    pushToast: (toast) => {
      toastSeq += 1;
      const id = `t-${toastSeq}`;
      set((state) => ({ toasts: [...state.toasts, { ...toast, id }].slice(-3) }));
      setTimeout(() => get().dismissToast(id), 5200);
    },
    dismissToast: (id) =>
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

    /* --- history -------------------------------------------------------------- */

    undo: () => {
      const s = get();
      const previous = s.past[s.past.length - 1];
      if (!previous) return;
      set({
        ...restore(previous),
        past: s.past.slice(0, -1),
        future: [snapshot(s), ...s.future].slice(0, 40),
      });
    },

    redo: () => {
      const s = get();
      const next = s.future[0];
      if (!next) return;
      set({
        ...restore(next),
        past: [...s.past, snapshot(s)].slice(-40),
        future: s.future.slice(1),
      });
    },

    resetPlan: () => {
      const s = get();
      const facilities = baseFacilities();
      set({
        past: [...s.past, snapshot(s)].slice(-40),
        future: [],
        facilities,
        metrics: computeMetrics(facilities),
        result: null,
        infeasible: null,
        optimizationPhase: "idle",
        optimizationProgress: 0,
        completedSteps: [],
        candidates: [],
        revealedCandidates: 0,
        comparisonOpen: false,
        selectedFacilityId: null,
        selectedNeighbourhoodId: null,
        whatIf: null,
      });
      get().pushToast({
        title: "Scenario reset",
        body: "The city is back to its existing infrastructure.",
        tone: "info",
      });
    },

    restoreDemo: () => {
      get().resetPlan();
      const facilities = baseFacilities();
      set({
        mode: "plan",
        need: "healthcare",
        budget: DEFAULT_BUDGET,
        priorities: { ...DEFAULT_PRIORITIES },
        resources: { ...DEFAULT_RESOURCES },
        constraints: DEFAULT_CONSTRAINTS.map((c) => ({ ...c })),
        goalText: "",
        goalFeedback: null,
        facilities,
        metrics: computeMetrics(facilities),
        messages: [],
        past: [],
        future: [],
        presentMode: false,
        leftCollapsed: false,
        rightCollapsed: false,
      });
    },
  };
});

/** Runs a confirmed assistant action against the store. */
async function executeIntent(
  intent: AssistantIntent,
  get: () => SylvidaStore,
): Promise<void> {
  const store = get();

  switch (intent.type) {
    case "SET_BUDGET":
      if (intent.payload.budget !== undefined) {
        store.setBudget(intent.payload.budget);
        store.pushToast({
          title: "Budget updated",
          body: formatCost(intent.payload.budget),
          tone: "info",
        });
      }
      return;

    case "OPTIMIZE":
      if (intent.payload.need) {
        store.setPriority(intent.payload.need as PriorityId, 90);
      }
      store.setMode("optimize");
      await store.runOptimization();
      return;

    case "ADD_FACILITY": {
      const type = intent.payload.facilityType;
      if (!type) return;
      const best = await optimizationApi.bestSite(type, {
        facilities: store.facilities,
        resources: store.resources,
        budget: store.budget,
        priorities: store.priorities,
        constraints: store.constraints,
      });
      if (!best) {
        store.pushToast({
          title: "No feasible site",
          body: "Current constraints leave nowhere to put that facility.",
          tone: "warning",
        });
        return;
      }
      store.beginDrag(type);
      store.dropFacility(best.position);
      store.focusOn(best.position, 14);
      return;
    }

    case "MOVE_FACILITY": {
      const id = intent.payload.facilityId;
      const type = intent.payload.facilityType;
      if (!id || !type) return;
      const best = await optimizationApi.bestSite(type, {
        facilities: store.facilities.filter((f) => f.id !== id),
        resources: store.resources,
        budget: store.budget,
        priorities: store.priorities,
        constraints: store.constraints,
      });
      if (!best) return;
      store.moveFacility(id, best.position);
      store.focusOn(best.position, 14);
      return;
    }

    default:
      return;
  }
}
