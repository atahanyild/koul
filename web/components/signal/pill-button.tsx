"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** Motion's drag and animation handlers share names with React's; the HTML ones are dropped from the props. */
type MotionSafe<T> = Omit<T, "onDrag" | "onDragStart" | "onDragEnd" | "onAnimationStart" | "onAnimationEnd" | "onAnimationIteration">;
const MotionLink = motion.create(Link);
/** Every clickable pill presses to 97% while held. */
const PRESS = { whileTap: { scale: 0.97 }, transition: SPRING } as const;

export type PillVariant = "lime" | "onLime" | "onLimeOutline" | "outline" | "ghost" | "white";
export type PillSize = "sm" | "md" | "lg";

const variants: Record<PillVariant, string> = {
  /** The primary action anywhere on a dark surface. */
  lime: "bg-lime text-on-lime hover:brightness-95 active:brightness-90",
  /** The primary action on a lime tile: ink on lime. */
  onLime: "bg-on-lime text-lime hover:opacity-90 active:opacity-80",
  onLimeOutline: "border border-on-lime text-on-lime hover:bg-on-lime/10 active:bg-on-lime/20",
  outline: "border border-line text-text hover:bg-surface-2 active:bg-surface-2 active:brightness-110",
  ghost: "bg-surface-2 text-text hover:brightness-110 active:brightness-125",
  /** The selected filter pill. */
  white: "bg-text text-background hover:opacity-90 active:opacity-80",
};

const sizes: Record<PillSize, string> = {
  sm: "h-9 px-4 text-[14px]",
  md: "h-11 px-5 text-[15px]",
  lg: "h-14 px-7 text-[17px]",
};

type Common = { variant?: PillVariant; size?: PillSize; full?: boolean; className?: string; children: React.ReactNode };
type ButtonProps = Common & MotionSafe<React.ButtonHTMLAttributes<HTMLButtonElement>> & { href?: undefined };
type LinkProps = Common & MotionSafe<Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">> & { href: string; disabled?: boolean };

/** Every button and link-button in the app is a fully round pill with a 44 px minimum height. */
export function PillButton(props: ButtonProps | LinkProps) {
  const { variant = "lime", size = "md", full, className, children } = props;
  const cls = cn(
    "inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-bold whitespace-nowrap transition-[filter,opacity,background-color] select-none",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime disabled:opacity-40 disabled:hover:brightness-100 disabled:hover:opacity-40 aria-disabled:opacity-40 aria-disabled:hover:opacity-40",
    variants[variant],
    sizes[size],
    full && "w-full",
    className,
  );
  if ("href" in props && props.href !== undefined) {
    const { href, disabled, onClick, variant: _v, size: _s, full: _f, className: _c, children: _ch, ...rest } = props;
    void _v; void _s; void _f; void _c; void _ch;
    // A disabled link keeps its cursor (not-allowed) and its place in the layout, but goes nowhere.
    return (
      <MotionLink href={href} aria-disabled={disabled || undefined} tabIndex={disabled ? -1 : undefined} className={cls} onClick={disabled ? (e) => e.preventDefault() : onClick} {...(disabled ? {} : PRESS)} {...rest}>
        {children}
      </MotionLink>
    );
  }
  const { variant: _v, size: _s, full: _f, className: _c, children: _ch, type = "button", ...rest } = props as ButtonProps;
  void _v; void _s; void _f; void _c; void _ch;
  return (
    <motion.button type={type} className={cls} {...(rest.disabled ? {} : PRESS)} {...rest}>
      {children}
    </motion.button>
  );
}

/** A round 44 px button for one icon: back, close, the "?" on the access chip, the composer's send arrow. */
export function IconButton({ variant = "ghost", size = "md", className, children, ...rest }: MotionSafe<React.ButtonHTMLAttributes<HTMLButtonElement>> & { variant?: PillVariant; size?: "md" | "lg" }) {
  return (
    <motion.button
      type="button"
      {...(rest.disabled ? {} : PRESS)}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full transition-[filter,opacity,background-color] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime disabled:opacity-40 disabled:hover:brightness-100",
        size === "md" ? "size-11" : "size-14",
        variants[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </motion.button>
  );
}
