"use client";

import { Toaster } from "react-hot-toast";
import { NavbarProvider } from "./NavbarContext";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <NavbarProvider>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: "var(--cc-surface)",
            color: "var(--cc-text)",
            border: "1px solid var(--cc-border)",
            borderRadius: "12px",
            fontSize: "14px",
            boxShadow: "0 4px 12px rgba(26, 26, 46, 0.08)",
          },
          success: {
            iconTheme: {
              primary: "var(--cc-success)",
              secondary: "white",
            },
          },
          error: {
            iconTheme: {
              primary: "var(--cc-error)",
              secondary: "white",
            },
          },
        }}
      />
      {children}
    </NavbarProvider>
  );
}
