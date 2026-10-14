"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CPTCode } from "@/types";

interface InterpretationBadgeProps {
  interpretation: string;
  cptCodes: CPTCode[];
}

const POPOVER_WIDTH = 320;
const VIEWPORT_MARGIN = 8;

/**
 * "Interpreted: CPT …" pill with an explanation popover.
 *
 * The popover renders in a portal with fixed positioning: the results toolbar
 * scrolls horizontally (overflow-x-auto), which clipped an absolutely
 * positioned popover to the toolbar's height so it looked hidden behind the map.
 */
export function InterpretationBadge({
  interpretation,
  cptCodes,
}: InterpretationBadgeProps) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const place = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const maxLeft = window.innerWidth - POPOVER_WIDTH - VIEWPORT_MARGIN;
    setPos({
      top: rect.bottom + 6,
      left: Math.max(
        VIEWPORT_MARGIN,
        Math.min(rect.right - POPOVER_WIDTH, maxLeft)
      ),
    });
  }, []);

  const show = useCallback(() => {
    place();
    setOpen(true);
  }, [place]);

  const hide = useCallback(() => {
    setOpen(false);
    setPinned(false);
  }, []);

  // Close a click-opened popover on outside click, Escape, scroll or resize.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      ) {
        return;
      }
      hide();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", hide);
    window.addEventListener("scroll", hide, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", hide);
      window.removeEventListener("scroll", hide, true);
    };
  }, [open, hide]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        className="text-[11px] px-1.5 py-0.5 rounded cursor-help inline-flex items-center gap-1 shrink-0"
        style={{
          background: "var(--cc-primary-light)",
          color: "var(--cc-primary)",
          fontWeight: 500,
        }}
        onMouseEnter={show}
        onMouseLeave={() => {
          if (!pinned) setOpen(false);
        }}
        onFocus={show}
        onBlur={() => {
          if (!pinned) setOpen(false);
        }}
        onClick={() => {
          if (pinned) {
            hide();
          } else {
            show();
            setPinned(true);
          }
        }}
      >
        Interpreted:
        {cptCodes.length > 0 && (
          <span className="font-semibold">
            {cptCodes[0].codeType?.toUpperCase()} {cptCodes[0].code}
          </span>
        )}
        <svg
          className="w-3 h-3"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </button>
      {open &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label="How we interpreted your search"
            className="fixed z-[9999] p-3 rounded-lg border text-[12px]"
            style={{
              top: pos.top,
              left: pos.left,
              width: POPOVER_WIDTH,
              maxWidth: `calc(100vw - ${VIEWPORT_MARGIN * 2}px)`,
              background: "var(--cc-surface)",
              borderColor: "var(--cc-border)",
              color: "var(--cc-text-secondary)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            }}
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => {
              if (!pinned) setOpen(false);
            }}
          >
            <p
              className="font-semibold mb-1"
              style={{ color: "var(--cc-text)" }}
            >
              How we interpreted your search
            </p>
            <p>{interpretation}</p>
            {cptCodes.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {cptCodes.map((code) => (
                  <span
                    key={code.code}
                    className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                    style={{
                      background: "var(--cc-primary-light)",
                      color: "var(--cc-primary)",
                    }}
                  >
                    {(code.codeType || "CPT").toUpperCase()} {code.code}:{" "}
                    {code.description}
                  </span>
                ))}
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
