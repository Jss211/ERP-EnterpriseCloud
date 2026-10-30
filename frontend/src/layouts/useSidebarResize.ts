import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';

const STORAGE_KEY = 'erp_sidebar_width';
const MIN_WIDTH = 240;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 288;
const clamp = (width: number, max = MAX_WIDTH) => Math.max(MIN_WIDTH, Math.min(max, width));

export function useSidebarResize() {
  const [preferredWidth, setPreferredWidth] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const width = stored === null ? DEFAULT_WIDTH : Number(stored);
      return Number.isFinite(width) ? clamp(width) : DEFAULT_WIDTH;
    } catch { return DEFAULT_WIDTH; }
  });
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const [resizing, setResizing] = useState(false);
  const drag = useRef<{ pointerId: number; x: number; width: number } | null>(null);
  const maxWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, viewportWidth - 480));
  const width = clamp(preferredWidth, maxWidth);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, String(preferredWidth)); } catch { /* Keep the width for this session when storage is unavailable. */ }
  }, [preferredWidth]);

  useEffect(() => {
    const resize = () => { setViewportWidth(window.innerWidth); drag.current = null; setResizing(false); };
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  useEffect(() => {
    if (!resizing) return;
    const { cursor, userSelect } = document.body.style;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    return () => { document.body.style.cursor = cursor; document.body.style.userSelect = userSelect; };
  }, [resizing]);

  const stopResize = () => { drag.current = null; setResizing(false); };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !event.isPrimary || window.innerWidth < 768) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, x: event.clientX, width };
    setResizing(true);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (start && start.pointerId === event.pointerId) setPreferredWidth(clamp(start.width + event.clientX - start.x, maxWidth));
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    stopResize();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 40 : 10;
    const next = { ArrowLeft: width - step, ArrowRight: width + step, Home: MIN_WIDTH, End: maxWidth }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    setPreferredWidth(clamp(next, maxWidth));
  };
  return { width, minWidth: MIN_WIDTH, maxWidth, resizing, stopResize,
    separatorEvents: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onLostPointerCapture: stopResize, onKeyDown } };
}
