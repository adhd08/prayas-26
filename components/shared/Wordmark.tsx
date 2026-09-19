"use client";

/**
 * Wordmark.
 *
 * The mark is a single geometric glyph: three stacked bars of different
 * lengths, a city read as layered systems. Kept as inline SVG because it is
 * the one piece of identity the product owns.
 */
export function Wordmark({
  size = 18,
  withMark = true,
}: {
  size?: number;
  withMark?: boolean;
}) {
  return (
    <span className="flex items-center gap-2">
      {withMark ? (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <rect x="3" y="4" width="18" height="3" rx="1.2" fill="#52D6E8" />
          <rect
            x="3"
            y="10.5"
            width="12"
            height="3"
            rx="1.2"
            fill="#55D6A6"
            opacity="0.85"
          />
          <rect
            x="3"
            y="17"
            width="7"
            height="3"
            rx="1.2"
            fill="#A7B0BD"
            opacity="0.6"
          />
        </svg>
      ) : null}
      <span
        className="font-semibold tracking-[-0.01em] text-ink"
        style={{ fontSize: size }}
      >
        Sylvida
      </span>
    </span>
  );
}
