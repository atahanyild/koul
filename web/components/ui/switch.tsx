"use client";

/**
 * The Signal switch: a 48 by 28 track, a 24 px knob that travels the full 20 px, lime when on. `sm` is 36 by 20.
 * The knob is a plain block so its transform is the only thing that moves.
 */
import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { motion } from "motion/react";
import { SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";

function Switch({ className, size = "default", ...props }: SwitchPrimitive.Root.Props & { size?: "sm" | "default" }) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "group/switch relative inline-flex shrink-0 items-center rounded-full p-0.5 transition-colors outline-none",
        "after:absolute after:-inset-x-2 after:-inset-y-2",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime",
        "data-checked:bg-lime data-unchecked:bg-surface-2 data-disabled:opacity-50",
        size === "default" ? "h-7 w-12" : "h-5 w-9",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        render={<motion.span layout transition={SPRING} />}
        className={cn(
          "pointer-events-none block rounded-full",
          "bg-text group-data-checked/switch:bg-on-lime",
          size === "default" ? "size-6 group-data-checked/switch:translate-x-5" : "size-4 group-data-checked/switch:translate-x-4",
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
