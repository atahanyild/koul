"use client";

/**
 * A horizontal rail: cards in one line that you drag, swipe or step through. Native scrolling keeps touch and
 * keyboard behaviour; the mouse gets drag-to-scroll, and a drag never fires the click of the card under it.
 * `useRail()` gives the scroller and the arrow pair a shared state so the arrows can live in a section header,
 * never on top of the cards.
 */
import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const DRAG_SLOP = 6;

export interface RailApi {
  ref: React.RefObject<HTMLDivElement | null>;
  edges: { start: boolean; end: boolean };
  dragging: boolean;
  measure: () => void;
  scrollBy: (dir: -1 | 1) => void;
  handlers: Pick<React.DOMAttributes<HTMLDivElement>, "onPointerDown" | "onPointerMove" | "onPointerUp" | "onPointerLeave" | "onPointerCancel" | "onScroll">;
}

export function useRail(): RailApi {
  const ref = React.useRef<HTMLDivElement>(null);
  const drag = React.useRef<{ startX: number; startLeft: number; moved: number } | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [edges, setEdges] = React.useState({ start: false, end: false });

  const measure = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const next = { start: el.scrollLeft > 4, end: max > 4 && el.scrollLeft < max - 4 };
    // ResizeObserver and the children effect can measure repeatedly. Keep the
    // same object when the edge state did not change, otherwise every measure
    // schedules another render and can form an update loop.
    setEdges((previous) => previous.start === next.start && previous.end === next.end ? previous : next);
  }, []);

  const scrollBy = React.useCallback((dir: -1 | 1) => {
    const el = ref.current;
    if (!el) return;
    const first = el.firstElementChild as HTMLElement | null;
    const step = first ? first.offsetWidth + 16 : Math.round(el.clientWidth * 0.8);
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  }, []);

  const endDrag = React.useCallback(() => {
    if (!drag.current) return;
    const moved = drag.current.moved;
    drag.current = null;
    setDragging(false);
    if (moved > DRAG_SLOP) {
      const swallow = (ev: MouseEvent) => { ev.preventDefault(); ev.stopPropagation(); };
      window.addEventListener("click", swallow, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 60);
    }
  }, []);

  const handlers = React.useMemo(() => ({
    onScroll: measure,
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType !== "mouse" || !ref.current) return;
      drag.current = { startX: e.clientX, startLeft: ref.current.scrollLeft, moved: 0 };
      setDragging(true);
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      const d = drag.current;
      const el = ref.current;
      if (!d || !el) return;
      const dx = e.clientX - d.startX;
      d.moved = Math.max(d.moved, Math.abs(dx));
      if (d.moved > DRAG_SLOP) el.scrollLeft = d.startLeft - dx;
    },
    onPointerUp: endDrag,
    onPointerLeave: endDrag,
    onPointerCancel: endDrag,
  }), [measure, endDrag]);

  return { ref, edges, dragging, measure, scrollBy, handlers };
}

export function RailScroller({ api, label, children, className }: { api: RailApi; label: string; children: React.ReactNode; className?: string }) {
  const { ref, measure } = api;
  React.useEffect(() => {
    measure();
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, ref, children]);

  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      tabIndex={0}
      {...api.handlers}
      style={{ scrollbarWidth: "none" }}
      className={cn(
        "flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain py-1 [&::-webkit-scrollbar]:hidden",
        "-mx-4 px-4 sm:-mx-6 sm:px-6",
        "rounded-xl focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        api.dragging ? "cursor-grabbing select-none" : "md:cursor-grab",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** The step-through pair. Put it in a section header, beside the rest of the header's chips. */
export function RailControls({ api, className }: { api: RailApi; className?: string }) {
  const any = api.edges.start || api.edges.end;
  return (
    <AnimatePresence>
      {any && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.2 }}
          className={cn("hidden items-center gap-1.5 md:flex", className)}
        >
          <RailButton side="left" disabled={!api.edges.start} onClick={() => api.scrollBy(-1)} />
          <RailButton side="right" disabled={!api.edges.end} onClick={() => api.scrollBy(1)} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function RailButton({ side, disabled, onClick }: { side: "left" | "right"; disabled: boolean; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <motion.button
      type="button"
      aria-label={side === "left" ? "Previous" : "Next"}
      onClick={onClick}
      disabled={disabled}
      whileHover={disabled ? undefined : { scale: 1.1 }}
      whileTap={disabled ? undefined : { scale: 0.92 }}
      transition={{ type: "spring", stiffness: 420, damping: 28 }}
      className={cn(
        "flex size-8 items-center justify-center rounded-full border border-border text-foreground transition-colors",
        "hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        disabled && "pointer-events-none opacity-30",
      )}
    >
      <Icon className="size-4" aria-hidden />
    </motion.button>
  );
}
