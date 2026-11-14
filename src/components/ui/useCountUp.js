import { useEffect, useRef, useState } from 'react';

/**
 * useCountUp — subtle count-up on numbers, per the motion spec (150–250 ms).
 * Respects `prefers-reduced-motion` and never blocks the first paint.
 */
export function useCountUp(target, { duration = 420, decimals = 1 } = {}) {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef(0);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !Number.isFinite(target)) {
      fromRef.current = target;
      setValue(target);
      return undefined;
    }
    const from = fromRef.current;
    const delta = target - from;
    if (Math.abs(delta) < 0.05) {
      fromRef.current = target;
      setValue(target);
      return undefined;
    }
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(from + delta * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return Number.isFinite(value) ? value.toFixed(decimals) : '–';
}
