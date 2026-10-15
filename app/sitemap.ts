import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo/links";
import { SEO_PAGE_INDEX } from "@/lib/seo/page-index";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = SEO_PAGE_INDEX.generatedAt || undefined;
  const staticPaths = [
    "",
    "/prices",
    "/legal/terms",
    "/legal/privacy",
    "/legal/disclaimers",
  ].map((path) => ({ url: `${SITE_URL}${path}` }));
  const procedures = [...new Set(SEO_PAGE_INDEX.pages.map((p) => p.procedure))];
  const metros = [...new Set(SEO_PAGE_INDEX.pages.map((p) => p.metro))];

  return [
    ...staticPaths,
    ...procedures.map((p) => ({
      url: `${SITE_URL}/prices/${p}`,
      lastModified,
    })),
    ...metros.map((m) => ({ url: `${SITE_URL}/prices/in/${m}`, lastModified })),
    ...SEO_PAGE_INDEX.pages.map((p) => ({
      url: `${SITE_URL}/prices/${p.procedure}/${p.metro}`,
      lastModified,
    })),
  ];
}
