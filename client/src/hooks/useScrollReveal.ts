import { useEffect, useRef, RefObject } from 'react';

interface ScrollRevealOptions {
  threshold?: number;
  rootMargin?: string;
  once?: boolean;
}

/**
 * useScrollReveal — attaches data-reveal class 'revealed' when element enters viewport.
 * Used on all landing page sections for scroll-triggered animations.
 */
export function useScrollReveal<T extends HTMLElement = HTMLElement>(
  options: ScrollRevealOptions = {}
): RefObject<T> {
  const ref = useRef<T>(null);
  const {
    threshold = 0.12,
    rootMargin = '-30px',
    once = true,
  } = options;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Find all [data-reveal] children + the element itself
    const targets = el.hasAttribute('data-reveal')
      ? [el]
      : Array.from(el.querySelectorAll<HTMLElement>('[data-reveal]'));

    if (targets.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
            if (once) observer.unobserve(entry.target);
          } else if (!once) {
            entry.target.classList.remove('revealed');
          }
        });
      },
      { threshold, rootMargin }
    );

    targets.forEach((t) => observer.observe(t));

    return () => observer.disconnect();
  }, [threshold, rootMargin, once]);

  return ref;
}

/**
 * Simpler version for a single element (not container-based).
 */
export function useRevealSingle<T extends HTMLElement = HTMLElement>(
  options: ScrollRevealOptions = {}
): [RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const isRevealedRef = useRef(false);
  const { threshold = 0.12, rootMargin = '-30px', once = true } = options;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('revealed');
          isRevealedRef.current = true;
          if (once) observer.unobserve(el);
        }
      },
      { threshold, rootMargin }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, rootMargin, once]);

  return [ref, isRevealedRef.current];
}
