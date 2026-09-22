"use client";

/**
 * Every duration, easing and spring the app animates with. Components import these and nothing else, so the
 * feel is one thing. Only `transform` and `opacity` move (the rule editor's height is the one exception), and
 * with reduced motion on, MotionConfig turns transforms off and leaves the fades.
 */
import type { Transition, Variants } from "motion/react";

export const DUR = { fast: 0.15, base: 0.24, slow: 0.42 } as const;
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** Anything the user drags or toggles. */
export const SPRING: Transition = { type: "spring", stiffness: 520, damping: 36, mass: 0.8 };
/** Rows sliding into a new order, the save bar arriving. */
export const SPRING_SOFT: Transition = { type: "spring", stiffness: 320, damping: 32 };

export const tween = (duration: number = DUR.base): Transition => ({ duration, ease: EASE_OUT });

/** Fade and rise: pages (8 px), tiles (12 px), bubbles and rows. */
export const rise = (px = 8, duration: number = DUR.base) => ({
  initial: { opacity: 0, y: px },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: px },
  transition: tween(duration),
});

export const fade = (duration: number = DUR.base) => ({
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: tween(duration),
});

/** A parent that shows its children one after another, 40 ms apart. */
export const staggerParent: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.04 } } };
export const staggerChild: Variants = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: tween(DUR.base) } };

/** The LIVE and Watching dots: a slow, quiet loop. */
export const breathe = { animate: { scale: [1, 1.3, 1], opacity: [1, 0.55, 1] }, transition: { duration: 2.4, repeat: Infinity, ease: "easeInOut" as const } };
