"use client";

import type { ToasterProps } from "sonner";
import { Toaster as Sonner, toast } from "sonner";

import { useTheme } from "./theme";

export const Toaster = ({ toastOptions, ...props }: ToasterProps) => {
  const { themeMode } = useTheme();

  return (
    <Sonner
      theme={themeMode === "auto" ? "system" : themeMode}
      className="toaster group"
      gap={8}
      style={
        {
          "--normal-bg": "var(--raised)",
          "--normal-text": "var(--fg)",
          "--normal-border": "var(--line-2)",
          "--success-bg": "var(--raised)",
          "--success-text": "var(--fg)",
          "--success-border": "var(--line-2)",
          "--error-bg": "var(--raised)",
          "--error-text": "var(--fg)",
          "--error-border": "var(--line-2)",
          "--border-radius": "9px",
          "--width": "min(360px, calc(100vw - 32px))",
        } as React.CSSProperties
      }
      toastOptions={{
        ...toastOptions,
        style: {
          fontSize: "12.5px",
          padding: "8px 8px 8px 12px",
          boxShadow: "var(--shadow-popover)",
          ...toastOptions?.style,
        },
        classNames: {
          success: "[&_[data-icon]]:text-green",
          error: "[&_[data-icon]]:text-red",
          actionButton:
            "bg-raised! text-foreground! border-line-2! hover:border-line-3! h-6! rounded-md! border! px-2! text-[12px]! font-medium!",
          cancelButton:
            "text-fg-2! hover:text-foreground! h-6! rounded-md! bg-transparent! px-2! text-[12px]! font-medium!",
          ...toastOptions?.classNames,
        },
      }}
      {...props}
    />
  );
};

export { toast };
