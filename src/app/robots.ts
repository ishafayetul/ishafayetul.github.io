import type { MetadataRoute } from "next";
import { sitePath } from "@/lib/site-path";
import { siteUrl } from "@/lib/seo";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return siteUrl ? { rules: { userAgent: "*", allow: "/" }, sitemap: `${siteUrl}${sitePath("/sitemap.xml")}` }
    : { rules: { userAgent: "*", disallow: "/" } };
}
