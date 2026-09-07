"use client";

import { useEffect, type RefObject } from "react";

/**
 * Close an open panel when the page asks to be done with it.
 *
 * Two of the phone's navigation controls open a panel over the screen — the
 * current-event selector and the More menu — and both have to shut on the
 * same three things: Escape, a press anywhere outside them, and choosing
 * something inside them. The first two live here; the third is each link's own
 * `onClick`, because a client-side navigation never unmounts the nav and so
 * would otherwise leave the panel standing over the screen it just opened.
 *
 * `pointerdown` rather than `click`: a press that starts outside should
 * dismiss, and waiting for the click means the press-and-drag that scrolls
 * the page behind the panel leaves it open.
 *
 * `close` has to be stable — a `useCallback` or a setter — or this
 * resubscribes on every render.
 */
export function useDismiss(
  open: boolean,
  holder: RefObject<HTMLElement | null>,
  close: () => void,
) {
  useEffect(() => {
    if (!open) return;

    function onKey(pressed: KeyboardEvent) {
      if (pressed.key === "Escape") close();
    }

    function onPointerDown(pressed: PointerEvent) {
      const target = pressed.target;
      if (target instanceof Node && holder.current?.contains(target)) return;
      close();
    }

    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, holder, close]);
}
