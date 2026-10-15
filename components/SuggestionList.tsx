"use client";

interface SuggestionListProps {
  id: string;
  label: string;
  items: string[];
  activeIndex: number;
  onSelect: (index: number) => void;
  onHover: (index: number) => void;
}

/** Listbox shown under a combobox input (location and procedure typeahead). */
export function SuggestionList({
  id,
  label,
  items,
  activeIndex,
  onSelect,
  onHover,
}: SuggestionListProps) {
  if (items.length === 0) return null;
  return (
    <ul
      id={id}
      role="listbox"
      aria-label={label}
      className="absolute left-0 right-0 top-full mt-1 z-50 rounded-lg border py-1 shadow-lg"
      style={{
        background: "var(--cc-surface)",
        borderColor: "var(--cc-border)",
      }}
    >
      {items.map((item, i) => (
        <li
          key={item}
          id={`${id}-${i}`}
          role="option"
          aria-selected={i === activeIndex}
          onMouseDown={(e) => {
            e.preventDefault(); // keep focus so the input's blur doesn't fire first
            onSelect(i);
          }}
          onMouseEnter={() => onHover(i)}
          className="px-3 py-2.5 text-sm cursor-pointer"
          style={{
            color: "var(--cc-text)",
            background: i === activeIndex ? "var(--cc-surface-alt)" : undefined,
          }}
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

/** Arrow/Enter/Escape handling shared by the combobox inputs. Returns true when handled. */
export function handleSuggestionKey(
  e: React.KeyboardEvent,
  count: number,
  activeIndex: number,
  setActiveIndex: (fn: (i: number) => number) => void,
  onSelect: (index: number) => void,
  onClose: () => void
): boolean {
  if (count === 0) return false;
  if (e.key === "ArrowDown") {
    e.preventDefault();
    setActiveIndex((i) => (i + 1) % count);
    return true;
  }
  if (e.key === "ArrowUp") {
    e.preventDefault();
    setActiveIndex((i) => (i <= 0 ? count - 1 : i - 1));
    return true;
  }
  if (e.key === "Escape") {
    onClose();
    return true;
  }
  if (e.key === "Enter" && activeIndex >= 0) {
    e.preventDefault();
    onSelect(activeIndex);
    return true;
  }
  return false;
}
