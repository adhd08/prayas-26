"use client";

import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";

/**
 * Section heading used across every panel. The label is the only place small
 * uppercase type appears, which keeps the panels scannable without turning
 * the product into a wall of tiny labels.
 */
export function SectionHeader({
  title,
  action,
  hint,
}: {
  title: string;
  action?: ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-4">
      <div className="min-w-0">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.13em] text-ink-3">
          {title}
        </h2>
        {hint ? (
          <p className="mt-1 text-[11.5px] leading-snug text-ink-4">{hint}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function Collapsible({
  title,
  defaultOpen = false,
  summary,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  summary?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-line-soft">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors duration-150 hover:bg-surface-2"
      >
        <ChevronDown
          size={14}
          className={`shrink-0 text-ink-3 transition-transform duration-200 ${
            open ? "" : "-rotate-90"
          }`}
        />
        <span className="flex-1 text-[12.5px] font-medium text-ink-2">
          {title}
        </span>
        {summary ? (
          <span className="tabular text-[11px] text-ink-4">{summary}</span>
        ) : null}
      </button>
      {open ? <div className="px-4 pb-4">{children}</div> : null}
    </div>
  );
}

/** Small key and value row. The value is always monospaced. */
export function Readout({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  const tones = {
    default: "text-ink",
    good: "text-ok",
    warn: "text-warn",
    bad: "text-danger",
  } as const;
  return (
    <div className="flex items-baseline justify-between gap-4 py-[5px]">
      <span className="text-[12px] text-ink-3">{label}</span>
      <span className={`tabular text-[12.5px] ${tones[tone]}`}>{value}</span>
    </div>
  );
}

export function EmptyState({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <div className="px-4 py-6">
      <h3 className="text-[13px] font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 max-w-[34ch] text-[12.5px] leading-relaxed text-ink-3">
        {body}
      </p>
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}

/** Loading placeholder shaped like the content it replaces. */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`relative overflow-hidden rounded-xs bg-surface-3 ${className}`}
    >
      <span className="sweep absolute inset-0" />
    </div>
  );
}
