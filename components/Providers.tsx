"use client";

import { Toaster } from "react-hot-toast";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: "#fff",
            color: "#1f2937",
            border: "1px solid #e5e7eb",
          },
        }}
      />
      {children}
    </>
  );
}
