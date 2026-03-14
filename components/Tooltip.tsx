"use client";

import { useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";

interface TooltipProps {
  text: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function Tooltip({ text, children, className, style }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const ref = useRef<HTMLSpanElement>(null);

  const show = useCallback(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 6, left: rect.left + rect.width / 2 });
    setVisible(true);
  }, []);

  return (
    <>
      <span
        ref={ref}
        className={className}
        style={style}
        onMouseEnter={show}
        onMouseLeave={() => setVisible(false)}
      >
        {children}
      </span>
      {visible &&
        createPortal(
          <div
            className="fixed z-[9999] max-w-xs px-3 py-2 text-xs text-white rounded-lg shadow-lg pointer-events-none -translate-x-1/2"
            style={{
              top: pos.top,
              left: pos.left,
              backgroundColor: "var(--cc-text-primary, #1a1a1a)",
            }}
          >
            {text}
          </div>,
          document.body
        )}
    </>
  );
}
