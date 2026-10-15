import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/public";
import { findProcedure, SEO_PROCEDURES } from "@/lib/seo/procedures";
import { findMetro, metroLabel } from "@/lib/seo/metros";
import {
  findPage,
  pagesForMetro,
  pagesForProcedure,
  SEO_PAGE_INDEX,
} from "@/lib/seo/page-index";
import {
  getCityResults,
  isPublishable,
  SEO_RADIUS_MILES,
  summarizeCity,
} from "@/lib/seo/prices";
import {
  cityPagePath,
  metroPath,
  procedurePath,
  resultsHref,
  SITE_URL,
} from "@/lib/seo/links";
import {
  priceTypeLabel,
  scopeLabel,
  type AnswerSummary,
} from "@/lib/results/summarize";
import { displayName, formatDistance, formatPrice } from "@/lib/format";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import { JsonLd } from "@/components/seo/JsonLd";
import {
  linkStyle,
  secondaryText,
  serifHeading,
} from "@/components/seo/styles";
import { ResultsFinePrint } from "@/components/results/ResultsFinePrint";

// Prices change only when new hospital files are imported, so each page is
// rendered on its first visit and refreshed daily.
export const revalidate = 86400;

// Pages are built on demand: the build has no database access, and only the
// pairs in the page index exist (anything else is a 404).
export function generateStaticParams() {
  return [];
}

const LIST_LIMIT = 10;

interface Params {
  procedure: string;
  city: string;
}

const loadPage = cache(async (procedureSlug: string, citySlug: string) => {
  const procedure = findProcedure(procedureSlug);
  const metro = findMetro(citySlug);
  const nationalMedian = SEO_PAGE_INDEX.nationalMedians[procedureSlug];
  if (
    !procedure ||
    !metro ||
    !nationalMedian ||
    !findPage(procedureSlug, citySlug)
  )
    return null;
  const results = await getCityResults(procedure, metro, createPublicClient());
  const summary = summarizeCity(procedure, results, nationalMedian);
  // Prices can drop below the bar after a re-import; don't publish a thin page.
  if (!isPublishable(summary)) return null;
  return { procedure, metro, summary };
});

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { procedure: p, city: c } = await params;
  const page = await loadPage(p, c);
  if (!page) return {};
  const { procedure, metro, summary } = page;
  const place = metroLabel(metro);
  const title = `${procedure.name} cost in ${place}: compare hospital prices`;
  const description = `${procedure.name} prices at ${summary.rangeCount} hospitals near ${place} run ${formatPrice(summary.low)} to ${formatPrice(summary.high)}, with a typical price of ${formatPrice(summary.median)}. From the prices hospitals publish.`;
  const path = cityPagePath(procedure, metro);
  return {
    title: `${title} | ClearCost`,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: `${SITE_URL}${path}` },
  };
}

function basisPhrase(summary: AnswerSummary): string {
  if (summary.basis === "cash") return "cash prices";
  if (summary.basis === "insured") return "average insured rates";
  return "cash prices and average insured rates";
}

function scopeNote(summary: AnswerSummary): string | null {
  if (summary.scope === "facility")
    return "Most of these are the hospital's fee only. Doctors' fees, like the radiologist or surgeon, are usually billed separately.";
  if (summary.scope === "professional")
    return "Most of these are the doctor's fee only. The hospital's fee is billed separately.";
  return null;
}

export default async function CityPricePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { procedure: p, city: c } = await params;
  const page = await loadPage(p, c);
  if (!page) notFound();
  const { procedure, metro, summary } = page;
  const place = metroLabel(metro);
  // Same rule as the range: doctor-only fees don't lead when hospitals list
  // a hospital-side or complete price (#174).
  const hospitalSide = summary.priced.filter((e) => e.scope !== "professional");
  const list = (hospitalSide.length > 0 ? hospitalSide : summary.priced).slice(
    0,
    LIST_LIMIT
  );
  const note = scopeNote(summary);

  const otherCities = pagesForProcedure(procedure.slug)
    .filter((x) => x.metro !== metro.slug)
    .map((x) => findMetro(x.metro)!)
    .sort(
      (a, b) =>
        Math.hypot(a.lat - metro.lat, a.lng - metro.lng) -
        Math.hypot(b.lat - metro.lat, b.lng - metro.lng)
    )
    .slice(0, 8);
  const otherProcedures = pagesForMetro(metro.slug)
    .filter((x) => x.procedure !== procedure.slug)
    .map((x) => SEO_PROCEDURES.find((sp) => sp.slug === x.procedure)!)
    .filter((sp) => sp.category === procedure.category)
    .slice(0, 8);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
      <Breadcrumbs
        crumbs={[
          { name: "Prices", href: "/prices" },
          { name: procedure.name, href: procedurePath(procedure) },
          { name: place, href: cityPagePath(procedure, metro) },
        ]}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "MedicalProcedure",
          name: procedure.name,
          description: procedure.summary,
          code: {
            "@type": "MedicalCode",
            codeValue: procedure.code,
            codingSystem: procedure.codeType === "cpt" ? "CPT" : "HCPCS",
          },
        }}
      />

      <h1
        className="text-[36px] sm:text-[44px] leading-tight"
        style={serifHeading}
      >
        {procedure.name} cost in {place}
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed" style={secondaryText}>
        {procedure.summary} Prices below are {basisPhrase(summary)} published by{" "}
        {summary.rangeCount} hospitals within {SEO_RADIUS_MILES} miles of{" "}
        {metro.city}.
      </p>

      <section className="slip mt-6" aria-label="Price range">
        <div className="slip-row">
          <span>Lowest published price</span>
          <span className="num">{formatPrice(summary.low)}</span>
        </div>
        <div className="slip-row">
          <span>Typical price (median)</span>
          <span className="num">{formatPrice(summary.median)}</span>
        </div>
        <div className="slip-row">
          <span>Highest published price</span>
          <span className="num">{formatPrice(summary.high)}</span>
        </div>
      </section>
      {note && (
        <p className="mt-3 text-[13px] leading-relaxed" style={secondaryText}>
          {note}
        </p>
      )}

      <Link
        href={resultsHref(procedure, metro)}
        className="mt-6 inline-flex w-full sm:w-auto justify-center text-sm font-semibold px-5 py-3 rounded-lg text-white"
        style={{ background: "var(--cc-primary)" }}
      >
        See every hospital, the map and your all-in estimate
      </Link>

      <section className="mt-10" aria-labelledby="lowest-heading">
        <h2
          id="lowest-heading"
          className="text-[24px] sm:text-[28px]"
          style={serifHeading}
        >
          Lowest prices near {metro.city}
        </h2>
        <ul className="mt-4 space-y-2">
          {list.map((entry) => {
            const r = entry.primary;
            const others = entry.locations.length - 1;
            const scope = scopeLabel(entry.scope);
            return (
              <li
                key={r.id}
                className="rounded-lg border px-4 py-3 flex items-start justify-between gap-4"
                style={{
                  background: "var(--cc-surface)",
                  borderColor: "var(--cc-border)",
                }}
              >
                <div className="min-w-0">
                  <p className="font-semibold text-[15px]">
                    {displayName(r.provider.name)}
                  </p>
                  <p className="text-[13px]" style={secondaryText}>
                    {[
                      r.provider.city && displayName(r.provider.city),
                      formatDistance(r.distanceMiles),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    {others > 0 &&
                      ` · Same price at ${others} other location${others === 1 ? "" : "s"}`}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="num font-bold text-[16px]">
                    {formatPrice(entry.price.amount)}
                  </p>
                  <p className="text-[12px]" style={secondaryText}>
                    {[priceTypeLabel(entry.price), scope]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-10 text-[15px] leading-relaxed space-y-3">
        <h2 className="text-[24px] sm:text-[28px]" style={serifHeading}>
          How to use these prices
        </h2>
        <p style={secondaryText}>
          A cash price is what the hospital says it charges patients who pay for
          themselves. An insured average is what insurance plans pay on average,
          which is a useful guide when a hospital doesn&rsquo;t list a cash
          price. Ask the hospital for its self-pay price before you book, and
          for a written Good Faith Estimate.
        </p>
        <p style={secondaryText}>
          For your doctor&rsquo;s office: these prices are for billing code{" "}
          <span className="code">
            {procedure.codeType.toUpperCase()} {procedure.code}
          </span>
          .
        </p>
      </section>

      {(otherProcedures.length > 0 || otherCities.length > 0) && (
        <section className="mt-10 grid gap-8 sm:grid-cols-2 text-[15px]">
          {otherProcedures.length > 0 && (
            <div>
              <h2 className="font-semibold">
                Other {procedure.category.toLowerCase()} in {metro.city}
              </h2>
              <ul className="mt-2 space-y-1.5">
                {otherProcedures.map((sp) => (
                  <li key={sp.slug}>
                    <Link href={cityPagePath(sp, metro)} style={linkStyle}>
                      {sp.name} cost in {metro.city}
                    </Link>
                  </li>
                ))}
              </ul>
              <Link
                href={metroPath(metro)}
                className="inline-block mt-3 text-[13px] font-medium"
                style={linkStyle}
              >
                All prices in {place}
              </Link>
            </div>
          )}
          {otherCities.length > 0 && (
            <div>
              <h2 className="font-semibold">
                {procedure.name} in other cities
              </h2>
              <ul className="mt-2 space-y-1.5">
                {otherCities.map((m) => (
                  <li key={m.slug}>
                    <Link href={cityPagePath(procedure, m)} style={linkStyle}>
                      {procedure.name} cost in {metroLabel(m)}
                    </Link>
                  </li>
                ))}
              </ul>
              <Link
                href={procedurePath(procedure)}
                className="inline-block mt-3 text-[13px] font-medium"
                style={linkStyle}
              >
                {procedure.name} prices in every city
              </Link>
            </div>
          )}
        </section>
      )}

      <div className="mt-10">
        <ResultsFinePrint
          results={summary.priced.map((e) => e.primary)}
          aiMatchedCodes={false}
        />
      </div>
    </div>
  );
}
