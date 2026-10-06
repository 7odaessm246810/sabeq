'use client';

/**
 * Motion helpers ported from the design bundle (`Sabeq.reveal`, `drawPath`, `magnetic`, `parallax`).
 * All of them respect prefers-reduced-motion (Motion.md → Reduced motion).
 */
import { useEffect, useRef, type RefObject } from 'react';

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Adds `is-in` to every `.sb-reveal` inside `root` when it scrolls into view (fade + rise).
 * `data-delay` on an element staggers it (ms).
 */
export function useReveal(root: RefObject<HTMLElement | null>, deps: readonly unknown[] = []) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const items = [...el.querySelectorAll<HTMLElement>('.sb-reveal:not(.is-in)')];
    if (!('IntersectionObserver' in window) || prefersReducedMotion()) {
      items.forEach((x) => x.classList.add('is-in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('is-in');
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -8% 0px' },
    );
    for (const x of items) {
      if (x.dataset.delay) x.style.transitionDelay = `${x.dataset.delay}ms`;
      io.observe(x);
    }
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** Runs `fn` once when `el` is at least `threshold` visible. */
export function useInView(ref: RefObject<Element | null>, fn: () => void, threshold = 0.3): void {
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!('IntersectionObserver' in window)) {
      fnRef.current();
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          fnRef.current();
          io.disconnect();
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, threshold]);
}

/** Draws an SVG path from start to end (stroke-dashoffset). */
export function drawPath(path: SVGPathElement | null, ms = 1400, delay = 0): void {
  if (!path) return;
  const len = path.getTotalLength();
  const reduce = prefersReducedMotion();
  path.style.transition = 'none';
  path.style.strokeDasharray = String(len);
  path.style.strokeDashoffset = reduce ? '0' : String(len);
  if (reduce) return;
  path.getBoundingClientRect();
  path.style.transition = `stroke-dashoffset ${ms}ms cubic-bezier(0.65,0,0.35,1) ${delay}ms`;
  requestAnimationFrame(() => {
    path.style.strokeDashoffset = '0';
  });
}

/** Hides a path's stroke until `drawPath` runs (avoids a flash of the full line). */
export function hidePath(path: SVGPathElement | null): void {
  if (!path || prefersReducedMotion()) return;
  const len = path.getTotalLength();
  path.style.strokeDasharray = String(len);
  path.style.strokeDashoffset = String(len);
}

/** The element drifts toward the pointer — hero and final CTA only (strength 0.18). */
export function useMagnetic(ref: RefObject<HTMLElement | null>, strength = 0.18) {
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    el.classList.add('sb-magnetic');
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left - r.width / 2) * strength;
      const y = (e.clientY - r.top - r.height / 2) * strength;
      el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
    };
    const leave = () => {
      el.style.transform = '';
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    return () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
    };
  }, [ref, strength]);
}

/** Subtle 3-layer parallax in the hero (6 / 10 / 16 px). */
export function useParallax(
  container: RefObject<HTMLElement | null>,
  layers: readonly { ref: RefObject<Element | null>; depth: number }[],
) {
  useEffect(() => {
    const el = container.current;
    if (!el || prefersReducedMotion()) return;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const dx = (e.clientX - r.left) / r.width - 0.5;
      const dy = (e.clientY - r.top) / r.height - 0.5;
      for (const l of layers) {
        const node = l.ref.current as HTMLElement | SVGElement | null;
        if (node)
          node.style.transform = `translate(${(dx * l.depth).toFixed(1)}px,${(dy * l.depth).toFixed(1)}px)`;
      }
    };
    const leave = () => {
      for (const l of layers) {
        const node = l.ref.current as HTMLElement | SVGElement | null;
        if (node) node.style.transform = '';
      }
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    return () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
    };
  }, [container, layers]);
}
