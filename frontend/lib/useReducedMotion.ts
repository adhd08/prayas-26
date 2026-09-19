"use client";

import { useEffect, useState } from "react";

/**
 * Tracks prefers-reduced-motion.
 *
 * Returns false during server render so markup matches on hydration, then
 * settles to the real preference. Every animation in Sylvida checks this and
 * degrades to an instant state change rather than switching itself off.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
