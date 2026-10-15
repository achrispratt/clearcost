import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SEO_CATEGORIES, findProcedure } from "@/lib/seo/procedures";
import { findMetro, metroLabel, SEO_METROS } from "@/lib/seo/metros";
import { pagesForMetro, SEO_PAGE_INDEX } from "@/lib/seo/page-index";
import { cityPagePath, metroPath, SITE_URL } from "@/lib/seo/links";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import { PriceLinkList } from "@/components/seo/PriceLinkList";
import { secondaryText, serifHeading } from "@/components/seo/styles";

export const dynamicParams = false;

export function generateStaticParams() {
  return SEO_METROS.filter((m) => pagesForMetro(m.slug).length > 0).map(
    (m) => ({ city: m.slug })
  );
}

type Params = Promise<{ city: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const metro = findMetro((await params).city);
  if (!metro) return {};
  const place = metroLabel(metro);
  const title = `Hospital prices in ${place}: MRI, CT, lab tests and more`;
  const description = `Compare what hospitals near ${place} charge for ${pagesForMetro(metro.slug).length} common procedures, from the prices they publish.`;
  return {
    title: `${title} | ClearCost`,
    description,
    alternates: { canonical: metroPath(metro) },
    openGraph: { title, description, url: `${SITE_URL}${metroPath(metro)}` },
  };
}

export default async function MetroHubPage({ params }: { params: Params }) {
  const metro = findMetro((await params).city);
  if (!metro) notFound();
  const pages = pagesForMetro(metro.slug);
  if (pages.length === 0) notFound();
  const place = metroLabel(metro);
  const withProcedure = pages.map((p) => ({
    page: p,
    procedure: findProcedure(p.procedure)!,
  }));

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
      <Breadcrumbs
        crumbs={[
          { name: "Prices", href: "/prices" },
          { name: place, href: metroPath(metro) },
        ]}
      />
      <h1
        className="text-[36px] sm:text-[44px] leading-tight"
        style={serifHeading}
      >
        Hospital prices in {place}
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed" style={secondaryText}>
        What hospitals within {SEO_PAGE_INDEX.radiusMiles} miles of {metro.city}{" "}
        publish for common procedures. Pick one to compare hospitals.
      </p>
      {SEO_CATEGORIES.map((category) => {
        const items = withProcedure
          .filter((x) => x.procedure.category === category)
          .map(({ page, procedure }) => ({
            href: cityPagePath(procedure, metro),
            label: procedure.name,
            median: page.median,
            hospitals: page.hospitals,
          }));
        if (items.length === 0) return null;
        return (
          <section key={category} className="mt-8">
            <h2 className="text-[24px]" style={serifHeading}>
              {category}
            </h2>
            <PriceLinkList items={items} />
          </section>
        );
      })}
    </div>
  );
}
