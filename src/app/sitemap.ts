import type { MetadataRoute } from "next";
import { articles, pageNames, projects, route } from "@/lib/content";
import { siteUrl } from "@/lib/seo";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  if (!siteUrl) return [];
  const paths = [...pageNames.map(page => [page]), ...projects.map(project => ["projects", project.slug]), ...articles.map(article => ["blog", article.slug])];
  return paths.flatMap(path => {
    const languages = { en: siteUrl + route("en", ...path), ja: siteUrl + route("ja", ...path), "x-default": siteUrl + route("en", ...path) };
    return [languages.en, languages.ja].map(url => ({ url, alternates: { languages } }));
  });
}
