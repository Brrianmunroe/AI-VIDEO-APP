import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Returns focusable elements that are inside the given container.
 * @param {HTMLElement | null} container
 * @returns {HTMLElement[]}
 */
function getFocusableElements(container) {
  if (!container) return [];
  const nodes = container.querySelectorAll(FOCUSABLE_SELECTOR);
  return Array.from(nodes).filter((el) => {
    if (el.getAttribute('aria-hidden') === 'true') return false;
    const style = window.getComputedStyle(el);
    return style.visibility !== 'hidden' && style.display !== 'none';
  });
}

/**
 * useFocusTrap - Keeps keyboard focus inside a modal/dialog while active.
 * When active: focus moves into the container on open, Tab/Shift+Tab wrap within the container.
 * When inactive: focus is restored to the element that had it before open.
 *
 * @param {React.RefObject<HTMLElement | null>} containerRef - Ref to the dialog/modal DOM element
 * @param {boolean} isActive - Whether the trap is active (e.g. modal is open)
 */
export function useFocusTrap(containerRef, isActive) {
  const previousFocusRef = useRef(/** @type {HTMLElement | null} */ (null));

  useEffect(() => {
    if (!isActive || !containerRef?.current) return;

    const container = containerRef.current;

    // Store the element that had focus when the modal opened
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // Move focus into the modal (first focusable, or the container if we give it tabindex="-1")
    const focusable = getFocusableElements(container);
    if (focusable.length > 0) {
      focusable[0].focus();
    } else {
      container.setAttribute('tabindex', '-1');
      container.focus();
    }

    const handleKeyDown = (e) => {
      if (e.key !== 'Tab') return;
      const focusable = getFocusableElements(container);
      if (focusable.length === 0) return;

      const current = document.activeElement;
      const currentIndex = focusable.indexOf(current);
      const lastIndex = focusable.length - 1;

      if (e.shiftKey) {
        // Shift+Tab: if we're on the first, wrap to last
        if (currentIndex <= 0) {
          e.preventDefault();
          focusable[lastIndex].focus();
        }
      } else {
        // Tab: if we're on the last, wrap to first
        if (currentIndex === -1 || currentIndex >= lastIndex) {
          e.preventDefault();
          focusable[0].focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      if (previousFocusRef.current?.focus) {
        previousFocusRef.current.focus();
      }
      previousFocusRef.current = null;
    };
  }, [isActive, containerRef]);
}
