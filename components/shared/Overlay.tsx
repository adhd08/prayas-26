"use client";

import { Info, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { z } from "@/lib/tokens";

/** Closes on outside pointer-down and on Escape. */
function useDismiss(
  ref: React.RefObject<HTMLElement | null>,
  open: boolean,
  close: () => void,
) {
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [ref, open, close]);
}

export function Popover({
  trigger,
  children,
  align = "left",
  width = 260,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: ReactNode;
  align?: "left" | "right";
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open ? (
        <div
          style={{ width, zIndex: z.drawer }}
          className={`absolute top-[calc(100%+6px)] ${
            align === "right" ? "right-0" : "left-0"
          } rounded-md border border-line bg-surface-2 p-3 shadow-[0_18px_44px_rgba(0,0,0,0.36)]`}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

/** The small circled "i" that opens an explanation of a number. */
export function InfoDot({
  title,
  children,
  align = "left",
}: {
  title: string;
  children: ReactNode;
  align?: "left" | "right";
}) {
  return (
    <Popover
      align={align}
      width={280}
      trigger={({ open, toggle }) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
          aria-label={`About ${title}`}
          className={`flex h-5 w-5 items-center justify-center rounded-full transition-colors duration-150 ${
            open ? "text-brand" : "text-ink-4 hover:text-ink-2"
          }`}
        >
          <Info size={13} />
        </button>
      )}
    >
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">
        {title}
      </p>
      {children}
    </Popover>
  );
}

/** Hover description. Pointer only; the same text is in the panel body. */
export function Tooltip({
  label,
  children,
  side = "top",
}: {
  label: string;
  children: ReactNode;
  side?: "top" | "bottom";
}) {
  return (
    <span className="group/tt relative inline-flex">
      {children}
      <span
        role="tooltip"
        style={{ zIndex: z.toast }}
        className={`pointer-events-none absolute left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-xs border border-line bg-surface-3 px-2 py-1 text-[11px] text-ink-2 shadow-panel group-hover/tt:block ${
          side === "top" ? "bottom-[calc(100%+6px)]" : "top-[calc(100%+6px)]"
        }`}
      >
        {label}
      </span>
    </span>
  );
}

export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  width = 440,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children?: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      style={{ zIndex: z.modal }}
      className="fixed inset-0 flex items-center justify-center bg-void/72 px-6 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        style={{ width }}
        onClick={(e) => e.stopPropagation()}
        className="rounded-lg border border-line bg-surface-2 shadow-[0_18px_44px_rgba(0,0,0,0.36)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-line-soft px-5 py-4">
          <div>
            <h2 className="text-[14px] font-semibold text-ink">{title}</h2>
            {description ? (
              <p className="mt-1 text-[12.5px] leading-relaxed text-ink-3">
                {description}
              </p>
            ) : null}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 rounded-xs p-1 text-ink-4 transition-colors duration-150 hover:text-ink"
          >
            <X size={15} />
          </button>
        </div>
        {children ? <div className="px-5 py-4">{children}</div> : null}
        {footer ? (
          <div className="flex justify-end gap-2 border-t border-line-soft px-5 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
