"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

interface NavbarContextValue {
  searchSlot: ReactNode | null;
  setSearchSlot: (node: ReactNode | null) => void;
}

const NavbarContext = createContext<NavbarContextValue>({
  searchSlot: null,
  setSearchSlot: () => {},
});

export function NavbarProvider({ children }: { children: ReactNode }) {
  const [searchSlot, setSearchSlot] = useState<ReactNode | null>(null);
  return (
    <NavbarContext.Provider value={{ searchSlot, setSearchSlot }}>
      {children}
    </NavbarContext.Provider>
  );
}

export const useNavbarSlot = () => useContext(NavbarContext);
