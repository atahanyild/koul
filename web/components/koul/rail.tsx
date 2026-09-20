"use client";

/**
 * A horizontal rail: cards in one line that you drag or swipe through, with snap points, edge fades and arrow
 * buttons on desktop. A drag never fires the click of the card underneath it.
 */
import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DRAG_SLOP = 6;

export function Rail({ children, label, className, itemClassName }: { children: React.ReactNode; label: string; className?: string; itemClassName?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const drag = React.useRef<{ startX: number; startLeft: number; moved: number } | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [edges, setEdges] = React.useState({ start: false, end: false });

  const measure = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdges({ start: el.scrollLeft > 4, end: el.scrollLeft < max - 4 });
  }, []);

  React.useEffect(() => {
    measure();
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, children]);

  const step = () => {
    const el = ref.current;
    if (!el) return 320;
    const first = el.firstElementChild as HTMLElement | null;
    return first ? first.offsetWidth + 16 : Math.round(el.clientWidth * 0.8);
  };
  const scrollBy = (dir: -1 | 1) => ref.current?.scrollBy({ left: dir * step(), behavior: "smooth" });

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || !ref.current) return;
    drag.current = { startX: e.clientX, startLeft: ref.current.scrollLeft, moved: 0 };
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = ref.current;
    if (!d || !el) return;
    const dx = e.clientX - d.startX;
    d.moved = Math.max(d.moved, Math.abs(dx));
    if (d.moved > DRAG_SLOP) el.scrollLeft = d.startLeft - dx;
  };
  const endDrag = () => {
    if (!drag.current) return;
    const moved = drag.current.moved;
    drag.current = null;
    setDragging(false);
    // Swallow the click that follows a real drag so a card does not open.
    if (moved > DRAG_SLOP) {
      const swallow = (ev: MouseEvent) => { ev.preventDefault(); ev.stopPropagation(); };
      window.addEventListener("click", swallow, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 60);
    }
  };

  return (
    <div className={cn("relative", className)}>
      <div
        ref={ref}
        role="group"
        aria-label={label}
        tabIndex={0}
        onScroll={measure}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        onPointerCancel={endDrag}
        style={{ scrollbarWidth: "none" }}
        className={cn(
          "flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain pb-1 [&::-webkit-scrollbar]:hidden",
          "-mx-4 px-4 sm:-mx-6 sm:px-6",
          "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:rounded-xl",
          dragging ? "cursor-grabbing select-none" : "md:cursor-grab",
          itemClassName,
        )}
      >
        {children}
      </div>

      <div className={cn("pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-background to-transparent transition-opacity max-sm:hidden", edges.start ? "opacity-100" : "opacity-0")} aria-hidden />
      <div className={cn("pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent transition-opacity max-sm:hidden", edges.end ? "opacity-100" : "opacity-0")} aria-hidden />

      <div className="pointer-events-none absolute inset-y-0 left-0 right-0 hidden items-center justify-between md:flex">
        <RailButton side="left" show={edges.start} onClick={() => scrollBy(-1)} />
        <RailButton side="right" show={edges.end} onClick={() => scrollBy(1)} />
      </div>
    </div>
  );
}

function RailButton({ side, show, onClick }: { side: "left" | "right"; show: boolean; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <Button
      variant="outline"
      size="icon-lg"
      aria-label={side === "left" ? "Previous" : "Next"}
      tabIndex={show ? undefined : -1}
      onClick={onClick}
      className={cn(
        "pointer-events-auto size-10 rounded-full border-border bg-background/90 shadow-md backdrop-blur transition-opacity",
        side === "left" ? "-ml-4" : "-mr-4",
        show ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <Icon className="size-4" aria-hidden />
    </Button>
  );
}
