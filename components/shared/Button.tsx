"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  /** Right-hand adornment, for shortcut hints or counts. */
  trailing?: ReactNode;
  block?: boolean;
}

/**
 * One button hierarchy for the whole product. Primary is solid brand and is
 * used once per surface; everything else recedes.
 */
const variants: Record<Variant, string> = {
  primary:
    "bg-brand text-void font-semibold hover:bg-[#6ee0ef] active:translate-y-px disabled:bg-brand/35 disabled:text-void/60",
  secondary:
    "border border-line bg-surface-3 text-ink hover:border-[#31465c] hover:bg-[#1f2a37] active:translate-y-px disabled:text-ink-4",
  ghost:
    "text-ink-2 hover:bg-surface-3 hover:text-ink active:translate-y-px disabled:text-ink-4",
  danger:
    "border border-danger/40 bg-danger/10 text-danger hover:bg-danger/18 active:translate-y-px",
};

const sizes: Record<Size, string> = {
  sm: "h-7 gap-1.5 px-2.5 text-[12px]",
  md: "h-9 gap-2 px-3.5 text-[13px]",
  lg: "h-11 gap-2 px-5 text-[14px]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "secondary",
      size = "md",
      icon,
      trailing,
      block,
      className = "",
      children,
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        className={[
          "inline-flex items-center justify-center rounded-sm transition-colors duration-150",
          "disabled:cursor-not-allowed disabled:opacity-70",
          variants[variant],
          sizes[size],
          block ? "w-full" : "",
          className,
        ].join(" ")}
        {...rest}
      >
        {icon}
        {children}
        {trailing ? <span className="ml-auto pl-2">{trailing}</span> : null}
      </button>
    );
  },
);

export interface IconButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
  size?: "sm" | "md";
}

export function IconButton({
  label,
  active,
  size = "md",
  className = "",
  children,
  ...rest
}: IconButtonProps) {
  return (
    <button
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={[
        "inline-flex items-center justify-center rounded-sm border transition-colors duration-150",
        size === "sm" ? "h-7 w-7" : "h-9 w-9",
        active
          ? "border-brand/45 bg-brand/12 text-brand"
          : "border-line bg-surface-3 text-ink-2 hover:border-[#31465c] hover:text-ink",
        className,
      ].join(" ")}
      {...rest}
    >
      {children}
    </button>
  );
}
