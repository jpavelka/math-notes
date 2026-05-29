/**
 * useTouchActivation — embedded-map-style gesture gating for touch devices.
 *
 * On coarse-pointer (touch) devices the figure starts inert so the page can be
 * scrolled past it; the caller shows a "tap to interact" overlay and calls
 * `activate()` when tapped. Interaction is released again when the user taps
 * outside the figure or scrolls it off-screen. On mouse devices gestures are
 * never blocked, so desktop behaviour is unchanged.
 */

import { useEffect, useRef, useState, type RefObject } from 'react';

export interface TouchActivation {
  /** True when gestures should be suppressed (touch device + not yet activated). */
  gestureBlocked: boolean;
  /** Ref mirror of `gestureBlocked` for use inside memoized event handlers. */
  gestureBlockedRef: RefObject<boolean>;
  /** Enable interaction (call from the overlay tap). */
  activate: () => void;
}

export function useTouchActivation(
  containerRef: RefObject<HTMLElement | null>,
): TouchActivation {
  const [isTouch, setIsTouch] = useState(false);
  const [active, setActive] = useState(false);

  // Detect coarse pointer on the client (SSR renders the non-gated path first).
  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    const update = () => setIsTouch(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const gestureBlocked = isTouch && !active;
  const gestureBlockedRef = useRef(gestureBlocked);
  gestureBlockedRef.current = gestureBlocked;

  // Release interaction on a tap outside the figure or when it scrolls away.
  useEffect(() => {
    if (!active) return;
    const onPointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setActive(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);

    let observer: IntersectionObserver | null = null;
    if (containerRef.current && typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(
        ([entry]) => { if (!entry.isIntersecting) setActive(false); },
        { threshold: 0 },
      );
      observer.observe(containerRef.current);
    }

    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      observer?.disconnect();
    };
  }, [active, containerRef]);

  return { gestureBlocked, gestureBlockedRef, activate: () => setActive(true) };
}
