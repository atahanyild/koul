"use client";

/**
 * One component, two shapes: a bottom sheet on phones (thumb reach, drag handle, safe-area padding) and a right
 * side panel on desktop. Pages never think about which.
 */
import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";

export interface ResponsiveSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Desktop width class, e.g. "sm:max-w-lg". */
  width?: string;
  /** Prevent closing by tapping outside or Escape while an action is in flight. */
  locked?: boolean;
  className?: string;
}

export function ResponsiveSheet({ open, onOpenChange, title, description, children, footer, width = "md:max-w-[520px]", locked = false, className }: ResponsiveSheetProps) {
  const mobile = useIsMobile();
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => { if (locked && !o) return; onOpenChange(o); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/40 transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0 dark:bg-black/60" />
        <DialogPrimitive.Popup
          data-side={mobile ? "bottom" : "right"}
          className={cn(
            "fixed z-50 flex flex-col bg-background text-foreground outline-none transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
            // Phone: bottom sheet
            "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-2xl border-t border-border pb-safe data-ending-style:translate-y-full data-starting-style:translate-y-full",
            // Desktop: right panel
            "md:inset-y-0 md:right-0 md:left-auto md:h-full md:max-h-none md:w-full md:rounded-none md:border-t-0 md:border-l md:data-ending-style:translate-x-6 md:data-ending-style:opacity-0 md:data-starting-style:translate-x-6 md:data-starting-style:opacity-0 md:data-ending-style:translate-y-0 md:data-starting-style:translate-y-0",
            width,
            className,
          )}
        >
          <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-foreground/15 md:hidden" aria-hidden />
          <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-3 md:px-7 md:pt-7">
            <div className="min-w-0">
              <DialogPrimitive.Title className="display text-2xl leading-tight">{title}</DialogPrimitive.Title>
              {description && <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">{description}</DialogPrimitive.Description>}
            </div>
            <DialogPrimitive.Close render={<Button variant="ghost" size="icon-lg" className="-mr-2 -mt-1 shrink-0" aria-label="Close" />} disabled={locked}>
              <X />
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4 md:px-7">{children}</div>
          {footer && <div className="shrink-0 border-t border-border bg-background px-5 py-4 md:px-7 md:py-5">{footer}</div>}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
