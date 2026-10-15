import type { MetadataRoute } from "next";

const SITE_URL = "https://www.clearcost.live";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/legal/terms", "/legal/privacy", "/legal/disclaimers"].map(
    (path) => ({ url: `${SITE_URL}${path}` })
  );
}
