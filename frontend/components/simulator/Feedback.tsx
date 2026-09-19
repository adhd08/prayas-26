"use client";

import { AlertTriangle, ArrowRight, Check, Info, X } from "lucide-react";
import { ONBOARDING_STEPS } from "@/data/defaults";
import { useSylvida } from "@/store/useSylvida";
import { Button } from "@/components/shared/Button";
import { Modal } from "@/components/shared/Overlay";
import { z } from "@/lib/tokens";

/** Transient confirmations. Never a dialog: the planner keeps working. */
export function Toasts() {
  const toasts = useSylvida((s) => s.toasts);
  const dismiss = useSylvida((s) => s.dismissToast);

  return (
    <div
      style={{ zIndex: z.toast }}
      className="pointer-events-none fixed bottom-[calc(var(--metrics-h)+16px)] left-1/2 flex w-[360px] -translate-x-1/2 flex-col gap-2"
    >
      {toasts.map((toast) => {
        const tone =
          toast.tone === "success"
            ? "border-ok/35"
            : toast.tone === "warning"
              ? "border-warn/35"
              : toast.tone === "danger"
                ? "border-danger/35"
                : "border-line";
        return (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto rounded-md border ${tone} bg-surface-2/96 px-3.5 py-3 shadow-float backdrop-blur-sm`}
          >
            <div className="flex items-start gap-2.5">
              <span className="mt-[2px] shrink-0">
                {toast.tone === "success" ? (
                  <Check size={14} className="text-ok" />
                ) : toast.tone === "warning" ? (
                  <AlertTriangle size={14} className="text-warn" />
                ) : (
                  <Info size={14} className="text-ink-3" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-medium text-ink">
                  {toast.title}
                </p>
                {toast.body ? (
                  <p className="mt-1 text-[11.5px] leading-snug text-ink-3">
                    {toast.body}
                  </p>
                ) : null}
                {toast.readout ? (
                  <p className="tabular mt-1.5 flex items-center gap-2 text-[11.5px] text-ink-2">
                    <span className="text-ink-4">{toast.readout.label}</span>
                    {toast.readout.from}
                    <ArrowRight size={11} className="text-ink-4" />
                    <span className="text-ok">{toast.readout.to}</span>
                  </p>
                ) : null}
              </div>
              <button
                onClick={() => dismiss(toast.id)}
                aria-label="Dismiss"
                className="shrink-0 rounded-xs p-0.5 text-ink-4 transition-colors duration-150 hover:text-ink"
              >
                <X size={12} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Refused placement.
 *
 * A refusal always names the rule that refused and offers a way forward,
 * because silently rejecting a click teaches the planner nothing.
 */
export function BlockedDialog() {
  const blocked = useSylvida((s) => s.blocked);
  const dismiss = useSylvida((s) => s.dismissBlocked);
  const beginDrag = useSylvida((s) => s.draggingType);
  const arm = useSylvida((s) => s.beginDrag);
  const updateConstraint = useSylvida((s) => s.updateConstraint);
  const constraints = useSylvida((s) => s.constraints);

  if (!blocked) return null;

  const relatedConstraint =
    blocked.code === "flood"
      ? constraints.find((c) => c.id === "floodRisk")
      : blocked.code === "protected"
        ? constraints.find((c) => c.id === "protectedLand")
        : blocked.code === "land"
          ? constraints.find((c) => c.id === "landAvailability")
          : blocked.code === "spacing"
            ? constraints.find((c) => c.id === "minSpacing")
            : undefined;

  return (
    <Modal
      open
      title={blocked.title}
      description={blocked.message}
      onClose={dismiss}
      footer={
        <>
          <Button onClick={dismiss}>Cancel</Button>
          {relatedConstraint ? (
            <Button
              onClick={() => {
                updateConstraint(relatedConstraint.id, { enabled: false });
                dismiss();
              }}
            >
              Relax {relatedConstraint.label.toLowerCase()}
            </Button>
          ) : null}
          <Button
            variant="primary"
            onClick={() => {
              if (beginDrag) arm(beginDrag);
              dismiss();
            }}
          >
            Choose another site
          </Button>
        </>
      }
    >
      <p className="text-[12px] leading-relaxed text-ink-4">
        Constraints are prototype spatial rules. Switching one off is recorded
        in the decision trace of any plan generated afterwards.
      </p>
    </Modal>
  );
}

/**
 * First-run orientation. Four steps, dismissed permanently once finished.
 */
export function Onboarding() {
  const step = useSylvida((s) => s.onboardingStep);
  const advance = useSylvida((s) => s.advanceOnboarding);
  const skip = useSylvida((s) => s.skipOnboarding);

  if (step === null) return null;
  const current = ONBOARDING_STEPS[step];

  return (
    <div
      style={{ zIndex: z.modal }}
      className="fixed bottom-[calc(var(--metrics-h)+20px)] left-[calc(var(--panel-left)+20px)] w-[320px] rounded-lg border border-line bg-surface-2 p-4 shadow-float"
      role="dialog"
      aria-label="Getting started"
    >
      <div className="flex items-center gap-1.5">
        {ONBOARDING_STEPS.map((item, index) => (
          <span
            key={item.title}
            className={`h-[3px] flex-1 rounded-full transition-colors duration-200 ${
              index <= step ? "bg-brand" : "bg-line"
            }`}
          />
        ))}
      </div>
      <h3 className="mt-3 text-[14px] font-semibold text-ink">
        {current.title}
      </h3>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-3">
        {current.body}
      </p>
      <div className="mt-4 flex items-center justify-between">
        <button
          onClick={skip}
          className="text-[12px] text-ink-4 transition-colors duration-150 hover:text-ink-2"
        >
          Skip
        </button>
        <Button size="sm" variant="primary" onClick={advance}>
          {step === ONBOARDING_STEPS.length - 1 ? "Got it" : "Next"}
        </Button>
      </div>
    </div>
  );
}
