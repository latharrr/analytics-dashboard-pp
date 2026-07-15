"use client";

import { createContext, useContext, useState } from "react";

interface MobileNavState {
  isOpen: boolean;
  setOpen: (open: boolean) => void;
}

const MobileNavContext = createContext<MobileNavState | null>(null);

export function MobileNavProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  return (
    <MobileNavContext.Provider value={{ isOpen, setOpen }}>{children}</MobileNavContext.Provider>
  );
}

export function useMobileNav(): MobileNavState {
  const ctx = useContext(MobileNavContext);
  if (!ctx) throw new Error("useMobileNav must be used within MobileNavProvider");
  return ctx;
}
