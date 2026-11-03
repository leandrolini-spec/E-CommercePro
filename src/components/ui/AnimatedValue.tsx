"use client";

import { useEffect, useRef } from "react";

const NUMBER = /(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?/;

/** Número que sube desde cero hasta su valor. Mantiene el formato argentino ($ 173.300, 30,7 %) y respeta "reducir movimiento". */
export function AnimatedValue({ value, duration = 1000 }: { value: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const m = NUMBER.exec(value);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!m || reduce) {
      el.style.opacity = "1";
      return;
    }
    const decimals = m[2]?.length ?? 0;
    const target = Number(`${m[1].replace(/\./g, "")}.${m[2] ?? "0"}`);
    if (!Number.isFinite(target) || target === 0) {
      el.style.opacity = "1";
      return;
    }
    const grouped = m[1].includes(".");
    const prefix = value.slice(0, m.index);
    const suffix = value.slice(m.index + m[0].length);
    const fmt = (n: number) => {
      const [int, dec] = n.toFixed(decimals).split(".");
      const g = grouped || n >= 10000 ? int.replace(/\B(?=(\d{3})+(?!\d))/g, ".") : int;
      return `${prefix}${dec ? `${g},${dec}` : g}${suffix}`;
    };
    let raf = 0;
    const start = performance.now();
    el.textContent = fmt(0);
    el.style.opacity = "1";
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = t < 1 ? fmt(target * eased) : value;
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return (
    <span ref={ref} className="count tabular-nums" style={{ opacity: 0 }}>
      {value}
    </span>
  );
}
