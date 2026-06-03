import { useEffect } from 'react';

// Ref-count so stacked dialogs (e.g. a confirm over a form) only restore once.
let lockCount = 0;
let saved: { overflow: string; htmlOverflow: string; paddingRight: string } | null = null;

/**
 * Locks page scrolling while `active` is true. Sets `overflow: hidden` on BOTH
 * <html> and <body> (the app's scroll container can be either), and pads for the
 * removed scrollbar to avoid a layout shift. With scrolling locked, the document
 * can't extend past the viewport, so a `fixed inset-0` dialog backdrop always
 * covers the whole screen — no lighter strip shows below short content.
 */
export const useBodyScrollLock = (active: boolean): void => {
  useEffect(() => {
    if (!active) return;

    const html = document.documentElement;
    const body = document.body;

    if (lockCount === 0) {
      saved = {
        overflow: body.style.overflow,
        htmlOverflow: html.style.overflow,
        paddingRight: body.style.paddingRight,
      };

      const scrollbarWidth = window.innerWidth - html.clientWidth;
      if (scrollbarWidth > 0) {
        const current = parseFloat(getComputedStyle(body).paddingRight) || 0;
        body.style.paddingRight = `${current + scrollbarWidth}px`;
      }
      html.style.overflow = 'hidden';
      body.style.overflow = 'hidden';
    }
    lockCount += 1;

    return () => {
      lockCount -= 1;
      if (lockCount === 0 && saved) {
        body.style.overflow = saved.overflow;
        html.style.overflow = saved.htmlOverflow;
        body.style.paddingRight = saved.paddingRight;
        saved = null;
      }
    };
  }, [active]);
};
