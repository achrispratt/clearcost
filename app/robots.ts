import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo/links";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/auth/", "/saved"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
