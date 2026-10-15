import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { findProcedure, SEO_PROCEDURES } from "@/lib/seo/procedures";
import { findMetro, metroLabel } from "@/lib/seo/metros";
import { pagesForProcedure, SEO_PAGE_INDEX } from "@/lib/seo/page-index";
import { cityPagePath, procedurePath, SITE_URL } from "@/lib/seo/links";
import { formatPrice } from "@/lib/format";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import { PriceLinkList } from "@/components/seo/PriceLinkList";
import { secondaryText, serifHeading } from "@/components/seo/styles";

export const dynamicParams = false;

export function generateStaticParams() {
  return SEO_PROCEDURES.filter((p) => pagesForProcedure(p.slug).length > 0).map(
    (p) => ({ procedure: p.slug })
  );
}

type Params = Promise<{ procedure: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const procedure = findProcedure((await params).procedure);
  if (!procedure) return {};
  const cities = pagesForProcedure(procedure.slug).length;
  const title = `${procedure.name} cost by city: compare hospital prices`;
  const description = `Compare ${procedure.name.toLowerCase()} prices from hospitals in ${cities} US cities, from the prices hospitals publish.`;
  return {
    title: `${title} | ClearCost`,
    description,
    alternates: { canonical: procedurePath(procedure) },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}${procedurePath(procedure)}`,
    },
  };
}

export default async function ProcedureHubPage({ params }: { params: Params }) {
  const procedure = findProcedure((await params).procedure);
  if (!procedure) notFound();
  const pages = pagesForProcedure(procedure.slug);
  if (pages.length === 0) notFound();
  const national = SEO_PAGE_INDEX.nationalMedians[procedure.slug];
  const items = pages
    .map((p) => ({ page: p, metro: findMetro(p.metro)! }))
    .sort((a, b) => metroLabel(a.metro).localeCompare(metroLabel(b.metro)))
    .map(({ page, metro }) => ({
      href: cityPagePath(procedure, metro),
      label: metroLabel(metro),
      median: page.median,
      hospitals: page.hospitals,
    }));

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
      <Breadcrumbs
        crumbs={[
          { name: "Prices", href: "/prices" },
          { name: procedure.name, href: procedurePath(procedure) },
        ]}
      />
      <h1
        className="text-[36px] sm:text-[44px] leading-tight"
        style={serifHeading}
      >
        {procedure.name} cost by city
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed" style={secondaryText}>
        {procedure.summary}
        {national != null &&
          ` Across the hospitals we track, the typical published price is ${formatPrice(national)}, but it varies a lot from one hospital to the next.`}{" "}
        Pick a city to compare hospitals there.
      </p>
      <PriceLinkList items={items} />
      <p className="mt-4 text-[13px]" style={secondaryText}>
        Typical means the middle price among hospitals within{" "}
        {SEO_PAGE_INDEX.radiusMiles} miles of each city, as of{" "}
        {SEO_PAGE_INDEX.generatedAt}.
      </p>
    </div>
  );
}
