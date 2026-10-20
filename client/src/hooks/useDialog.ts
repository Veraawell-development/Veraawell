import { useEffect, useRef } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * What every modal needs to behave like a dialog: Escape closes it, focus
 * moves into it when it opens, Tab stays inside it, and focus goes back to
 * whatever opened it when it closes. Spread the returned props on the panel:
 *
 *   const dialog = useDialog(isOpen, onClose);
 *   <div ref={dialog.ref} role="dialog" aria-modal="true" aria-labelledby="…" tabIndex={-1}>
 *
 * When dialogs are stacked, only the innermost one (the last opened) answers
 * Escape — a rating form over the session details closes alone.
 */
const stack: HTMLElement[] = [];

export function useDialog<T extends HTMLElement = HTMLDivElement>(isOpen: boolean, onClose: () => void, view?: string) {
  const ref = useRef<T | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Back to whatever opened the dialog once it closes — across panel swaps.
  useEffect(() => {
    if (!isOpen) return;
    const opener = document.activeElement as HTMLElement | null;
    return () => {
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const panel = ref.current;
    if (!panel) return;
    stack.push(panel);
    // Into the dialog, without scrolling a long one to its first button.
    const first = panel.querySelector<HTMLElement>('[data-autofocus]') || panel;
    first.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== panel) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (items.length === 0) { e.preventDefault(); panel.focus(); return; }
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === firstItem || document.activeElement === panel)) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && document.activeElement === lastItem) {
        e.preventDefault();
        firstItem.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const i = stack.lastIndexOf(panel);
      if (i >= 0) stack.splice(i, 1);
    };
    // `view`: a dialog that swaps its panel (details ↔ cancel confirmation)
    // re-attaches to the new one.
  }, [isOpen, view]);

  return { ref };
}
