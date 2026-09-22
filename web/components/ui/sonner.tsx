"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          // The Signal tokens themselves: an opaque surface, the hairline, the text colour. `--popover` does not exist.
          "--normal-bg": "var(--surface)",
          "--normal-text": "var(--text)",
          "--normal-border": "var(--line)",
          "--success-bg": "var(--surface)",
          "--success-text": "var(--text)",
          "--success-border": "var(--line)",
          "--error-bg": "var(--surface)",
          "--error-text": "var(--text)",
          "--error-border": "var(--line)",
          "--border-radius": "var(--radius-group)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast !border !border-line !bg-surface !text-text !shadow-none",
          description: "!text-muted",
          actionButton: "!rounded-full !bg-lime !text-on-lime !font-bold",
          cancelButton: "!rounded-full !bg-surface-2 !text-text",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
