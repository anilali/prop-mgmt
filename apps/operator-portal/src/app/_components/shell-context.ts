"use client";

import { createContext, use } from "react";

export interface ShellContextValue {
  openNav: () => void;
  openCommandMenu: () => void;
}

export const ShellContext = createContext<ShellContextValue | null>(null);

export function useShell(): ShellContextValue {
  const context = use(ShellContext);
  if (!context) {
    throw new Error("useShell must be used inside AppShell");
  }
  return context;
}
