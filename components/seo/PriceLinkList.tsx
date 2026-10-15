import Link from "next/link";
import { formatPrice } from "@/lib/format";
import { linkStyle, secondaryText } from "./styles";

export interface PriceLink {
  href: string;
  label: string;
  median: number;
  hospitals: number;
}

/** A list of page links, each with its typical price and hospital count. */
export function PriceLinkList({ items }: { items: PriceLink[] }) {
  return (
    <ul
      className="mt-3 divide-y rounded-lg border"
      style={{
        background: "var(--cc-surface)",
        borderColor: "var(--cc-border)",
      }}
    >
      {items.map((item) => (
        <li
          key={item.href}
          className="flex items-baseline justify-between gap-4 px-4 py-2.5"
          style={{ borderColor: "var(--cc-border)" }}
        >
          <Link href={item.href} className="font-medium" style={linkStyle}>
            {item.label}
          </Link>
          <span
            className="num text-[13px] text-right shrink-0"
            style={secondaryText}
          >
            typical {formatPrice(item.median)} · {item.hospitals} hospitals
          </span>
        </li>
      ))}
    </ul>
  );
}
