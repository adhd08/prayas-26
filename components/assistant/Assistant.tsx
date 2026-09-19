"use client";

import { ArrowUp, Sparkle, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { NEIGHBOURHOOD_BY_ID } from "@/data/city";
import { NEED_SPECS } from "@/data/facilityCatalog";
import { assistantApi } from "@/lib/api";
import { z } from "@/lib/tokens";
import { useSylvida } from "@/store/useSylvida";
import { Button } from "@/components/shared/Button";
import type { AssistantContext, AssistantMessage } from "@/types";

/**
 * Planning copilot.
 *
 * Reads the same state the panels read, so every answer is grounded in what is
 * on screen. Anything that would change the plan is confirmed first: the
 * assistant proposes, the planner decides.
 */
export function AssistantButton() {
  const open = useSylvida((s) => s.assistantOpen);
  const openAssistant = useSylvida((s) => s.openAssistant);

  if (open) return null;

  return (
    <button
      onClick={() => openAssistant()}
      style={{ zIndex: z.drawer }}
      className="fixed bottom-[calc(var(--metrics-h)+20px)] right-5 flex h-[52px] items-center gap-2.5 rounded-full border border-line bg-surface-2 pl-4 pr-5 text-[13px] font-medium text-ink shadow-float transition-colors duration-150 hover:border-brand/40"
    >
      <Sparkle size={16} className="text-brand" />
      Ask Sylvida
    </button>
  );
}

export function AssistantDrawer() {
  const open = useSylvida((s) => s.assistantOpen);
  const close = useSylvida((s) => s.closeAssistant);
  const messages = useSylvida((s) => s.messages);
  const busy = useSylvida((s) => s.assistantBusy);
  const send = useSylvida((s) => s.sendAssistantMessage);
  const context = useAssistantContext();
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(
    () => assistantApi.suggestionsFor(context),
    [context],
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, busy]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open) return null;

  const submit = () => {
    if (!draft.trim() || busy) return;
    void send(draft);
    setDraft("");
  };

  return (
    <aside
      style={{ zIndex: z.drawer }}
      className="fixed bottom-[calc(var(--metrics-h)+16px)] right-5 flex h-[660px] max-h-[calc(100vh-var(--nav-h)-var(--metrics-h)-40px)] w-[416px] flex-col rounded-lg border border-line bg-surface shadow-float"
      aria-label="Sylvida planning assistant"
    >
      <header className="flex items-center gap-2.5 border-b border-line-soft px-4 py-3">
        <Sparkle size={15} className="text-brand" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-ink">Sylvida Copilot</p>
          <p className="text-[11px] text-ink-4">Planning assistant</p>
        </div>
        <span className="text-[10.5px] uppercase tracking-[0.12em] text-ok">
          {busy ? "Working" : "Ready"}
        </span>
        <button
          onClick={close}
          aria-label="Close assistant"
          className="rounded-xs p-1 text-ink-4 transition-colors duration-150 hover:text-ink"
        >
          <X size={15} />
        </button>
      </header>

      <ContextStrip context={context} />

      <div ref={scrollRef} className="scroll-thin flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <div className="pt-2">
            <p className="text-[12.5px] leading-relaxed text-ink-3">
              I read the same data the panels do. Ask about a ward, a facility
              or a trade-off, or tell me to change the plan and I will confirm
              before acting.
            </p>
          </div>
        ) : null}

        <div className="space-y-3.5">
          {messages.map((message) => (
            <MessageRow key={message.id} message={message} />
          ))}
          {busy ? (
            <div className="flex gap-1.5 py-1">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink-4"
                  style={{ animationDelay: `${i * 140}ms` }}
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {messages.length === 0 ? (
        <div className="flex flex-wrap gap-1.5 px-4 pb-3">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => void send(suggestion)}
              className="rounded-xs border border-line-soft px-2.5 py-1.5 text-left text-[11.5px] text-ink-3 transition-colors duration-150 hover:border-line hover:text-ink"
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}

      <div className="border-t border-line-soft p-3">
        <div className="flex items-end gap-2 rounded-sm border border-line bg-surface-3 px-3 py-2 focus-within:border-brand/50">
          <textarea
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Ask about the plan, or give an instruction"
            className="max-h-24 flex-1 resize-none bg-transparent py-1 text-[12.5px] leading-relaxed text-ink outline-none placeholder:text-ink-4"
          />
          <button
            onClick={submit}
            disabled={!draft.trim() || busy}
            aria-label="Send"
            className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-brand text-void transition-opacity duration-150 disabled:opacity-35"
          >
            <ArrowUp size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}

function ContextStrip({ context }: { context: AssistantContext }) {
  const label = context.facility
    ? context.facility.name
    : context.neighbourhood
      ? `${context.neighbourhood.name}, ${context.neighbourhood.district}`
      : context.mode === "optimize"
        ? "Current optimization scenario"
        : `${NEED_SPECS[context.need].label} across the city`;

  return (
    <div className="flex items-center gap-2 border-b border-line-soft bg-surface-2 px-4 py-2">
      <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-ink-4">
        Asking about
      </span>
      <span className="truncate text-[12px] text-ink-2">{label}</span>
    </div>
  );
}

function MessageRow({ message }: { message: AssistantMessage }) {
  const confirm = useSylvida((s) => s.confirmIntent);
  const dismiss = useSylvida((s) => s.dismissIntent);

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[84%] rounded-md rounded-br-xs bg-surface-3 px-3 py-2 text-[12.5px] leading-relaxed text-ink">
          {message.text}
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-[12.5px] leading-relaxed text-ink-2">{message.text}</p>

      {message.evidence && message.evidence.length > 0 ? (
        <div className="mt-2.5 rounded-sm border border-line-soft bg-surface-2 px-3 py-2">
          {message.evidence.map((item) => (
            <div
              key={item.label}
              className="flex items-baseline justify-between gap-3 py-[3px]"
            >
              <span className="text-[11.5px] text-ink-3">{item.label}</span>
              <span className="tabular text-right text-[11.5px] text-ink">
                {item.value}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {message.pendingIntent ? (
        <div className="mt-2.5 rounded-sm border border-warn/30 bg-warn/8 px-3 py-2.5">
          <p className="text-[11.5px] text-ink-2">
            This modifies the plan: {message.pendingIntent.summary}.
          </p>
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              variant="primary"
              onClick={() => void confirm(message.id)}
            >
              Confirm
            </Button>
            <Button size="sm" variant="ghost" onClick={() => dismiss(message.id)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {message.provenance === "demo" ? (
        <p className="mt-1.5 text-[10.5px] text-ink-4">
          Prototype estimate from demo data
        </p>
      ) : null}
    </div>
  );
}

/** Mirrors the store into the shape the service layer expects. */
function useAssistantContext(): AssistantContext {
  const mode = useSylvida((s) => s.mode);
  const need = useSylvida((s) => s.need);
  const wardId = useSylvida((s) => s.selectedNeighbourhoodId);
  const facilityId = useSylvida((s) => s.selectedFacilityId);
  const facilities = useSylvida((s) => s.facilities);
  const metrics = useSylvida((s) => s.metrics);
  const budget = useSylvida((s) => s.budget);
  const priorities = useSylvida((s) => s.priorities);
  const result = useSylvida((s) => s.result);

  return useMemo(
    () => ({
      mode,
      need,
      neighbourhood: wardId ? NEIGHBOURHOOD_BY_ID.get(wardId) : undefined,
      facility:
        [...facilities, ...(result?.facilities ?? [])].find(
          (f) => f.id === facilityId,
        ) ?? undefined,
      facilities,
      metrics,
      budget,
      priorities,
      result: result ?? undefined,
    }),
    [mode, need, wardId, facilityId, facilities, metrics, budget, priorities, result],
  );
}
