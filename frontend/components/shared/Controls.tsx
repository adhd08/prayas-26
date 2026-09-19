"use client";

import { Minus, Plus } from "lucide-react";
import { useId, type ReactNode } from "react";

/**
 * Range input with the value in the label rather than a floating bubble, so
 * the control stays quiet while still being readable at a glance.
 */
export function Slider({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  suffix = "%",
  accent,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  /** Track fill colour. Defaults to brand. */
  accent?: string;
  onChange: (value: number) => void;
}) {
  const id = useId();
  const pct = ((value - min) / (max - min)) * 100;
  const fill = accent ?? "var(--color-brand)";
  return (
    <div className="py-2">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[12.5px] text-ink-2">
          {label}
        </label>
        <span className="tabular text-[12px] text-ink">
          {value}
          {suffix}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="sylvida-range h-4 w-full cursor-pointer appearance-none bg-transparent"
        style={
          {
            "--fill": `${pct}%`,
            "--accent": fill,
          } as React.CSSProperties
        }
      />
    </div>
  );
}

/** Numeric stepper that also accepts typed input. */
export function Stepper({
  label,
  sub,
  value,
  min = 0,
  max = 99,
  icon,
  onChange,
}: {
  label: string;
  sub?: string;
  value: number;
  min?: number;
  max?: number;
  icon?: ReactNode;
  onChange: (value: number) => void;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <div className="flex items-center gap-3 py-1.5">
      {icon ? <span className="shrink-0">{icon}</span> : null}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12.5px] text-ink">{label}</p>
        {sub ? (
          <p className="truncate text-[11px] text-ink-4">{sub}</p>
        ) : null}
      </div>
      <div className="flex items-center rounded-sm border border-line bg-surface-3">
        <button
          onClick={() => onChange(clamp(value - 1))}
          disabled={value <= min}
          aria-label={`Fewer ${label}`}
          className="flex h-7 w-7 items-center justify-center text-ink-3 transition-colors duration-150 hover:text-ink disabled:text-ink-4"
        >
          <Minus size={13} />
        </button>
        <input
          aria-label={`${label} count`}
          value={value}
          onChange={(e) => {
            const parsed = Number(e.target.value.replace(/\D/g, ""));
            onChange(clamp(Number.isFinite(parsed) ? parsed : min));
          }}
          className="tabular h-7 w-9 border-x border-line bg-transparent text-center text-[12.5px] text-ink outline-none"
        />
        <button
          onClick={() => onChange(clamp(value + 1))}
          disabled={value >= max}
          aria-label={`More ${label}`}
          className="flex h-7 w-7 items-center justify-center text-ink-3 transition-colors duration-150 hover:text-ink disabled:text-ink-4"
        >
          <Plus size={13} />
        </button>
      </div>
    </div>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
  description,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  description?: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-start gap-3 rounded-sm py-2 text-left transition-colors duration-150"
    >
      <span
        className={`mt-[3px] flex h-[15px] w-[26px] shrink-0 items-center rounded-full border px-[2px] transition-colors duration-150 ${
          checked
            ? "border-brand/50 bg-brand/25"
            : "border-line bg-surface-3"
        }`}
      >
        <span
          className={`h-[9px] w-[9px] rounded-full transition-transform duration-150 ${
            checked
              ? "translate-x-[9px] bg-brand"
              : "translate-x-0 bg-ink-4"
          }`}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-[12.5px] text-ink">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-[11px] leading-snug text-ink-4">
            {description}
          </span>
        ) : null}
      </span>
    </button>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "md",
}: {
  options: { value: T; label: string; icon?: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
}) {
  return (
    <div
      role="tablist"
      className="inline-flex rounded-sm border border-line bg-surface-3 p-[2px]"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={[
              "inline-flex items-center gap-1.5 rounded-[4px] font-medium transition-colors duration-150",
              size === "sm"
                ? "h-6 px-2.5 text-[11.5px]"
                : "h-7 px-3 text-[12px]",
              active
                ? "bg-brand/14 text-brand"
                : "text-ink-3 hover:text-ink",
            ].join(" ")}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function TextInput({
  label,
  value,
  onChange,
  placeholder,
  suffix,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  suffix?: string;
  inputMode?: "text" | "numeric";
}) {
  const id = useId();
  return (
    <div className="py-1.5">
      <label htmlFor={id} className="mb-1.5 block text-[12px] text-ink-2">
        {label}
      </label>
      <div className="flex items-center rounded-sm border border-line bg-surface-3 focus-within:border-brand/50">
        <input
          id={id}
          value={value}
          inputMode={inputMode}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="tabular h-9 w-full bg-transparent px-3 text-[13px] text-ink outline-none placeholder:text-ink-4"
        />
        {suffix ? (
          <span className="pr-3 text-[12px] text-ink-3">{suffix}</span>
        ) : null}
      </div>
    </div>
  );
}
