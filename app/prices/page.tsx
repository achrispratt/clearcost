import type { Metadata } from "next";
import Link from "next/link";
import { SEO_CATEGORIES, SEO_PROCEDURES } from "@/lib/seo/procedures";
import { metroLabel, SEO_METROS } from "@/lib/seo/metros";
import { pagesForMetro, pagesForProcedure } from "@/lib/seo/page-index";
import { metroPath, procedurePath } from "@/lib/seo/links";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import {
  linkStyle,
  secondaryText,
  serifHeading,
} from "@/components/seo/styles";

export const metadata: Metadata = {
  title: "Hospital prices by procedure and city | ClearCost",
  description:
    "Compare what hospitals charge for MRIs, CT scans, lab tests, scopes and outpatient surgery in cities across the US, from the prices hospitals publish.",
  alternates: { canonical: "/prices" },
};

export default function PricesIndexPage() {
  const procedures = SEO_PROCEDURES.filter(
    (p) => pagesForProcedure(p.slug).length > 0
  );
  const metros = SEO_METROS.filter(
    (m) => pagesForMetro(m.slug).length > 0
  ).sort((a, b) => metroLabel(a).localeCompare(metroLabel(b)));

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
      <Breadcrumbs crumbs={[{ name: "Prices", href: "/prices" }]} />
      <h1
        className="text-[36px] sm:text-[44px] leading-tight"
        style={serifHeading}
      >
        Hospital prices by procedure
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed" style={secondaryText}>
        Compare the prices hospitals publish for common care. For anything not
        listed here, describe it in your own words on the{" "}
        <Link href="/" style={linkStyle}>
          search page
        </Link>
        .
      </p>

      {SEO_CATEGORIES.map((category) => {
        const items = procedures.filter((p) => p.category === category);
        if (items.length === 0) return null;
        return (
          <section key={category} className="mt-8">
            <h2 className="text-[24px]" style={serifHeading}>
              {category}
            </h2>
            <ul className="mt-2 grid gap-x-6 gap-y-1.5 sm:grid-cols-2 text-[15px]">
              {items.map((p) => (
                <li key={p.slug}>
                  <Link href={procedurePath(p)} style={linkStyle}>
                    {p.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <section className="mt-10">
        <h2 className="text-[24px]" style={serifHeading}>
          Prices by city
        </h2>
        <ul className="mt-2 grid gap-x-6 gap-y-1.5 grid-cols-2 sm:grid-cols-3 text-[15px]">
          {metros.map((m) => (
            <li key={m.slug}>
              <Link href={metroPath(m)} style={linkStyle}>
                {metroLabel(m)}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
