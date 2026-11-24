import type { Metadata } from "next";
import { messages, profile, route, type Locale } from "./content";

import { sitePath } from "./site-path";

export const siteUrl = process.env.SITE_URL ? new URL(process.env.SITE_URL).origin : null;
const metadataBase = new URL(siteUrl ?? "http://localhost:3000");

export function pageMetadata(locale: Locale, path: string[], title: string, description: string, type: "website" | "article" = "website"): Metadata {
  const url = route(locale, ...path);
  const english = route("en", ...path);
  const japanese = route("ja", ...path);
  const separator = locale === "ja" ? "｜" : " | ";
  const localizedTitle = path.length ? title + separator + profile.name : profile.name + separator + messages[locale].title;
  const socialImage = sitePath(locale === "ja" ? "/images/social-ja.png" : "/images/social-en.png");
  return {
    metadataBase,
    title: localizedTitle,
    description,
    alternates: { canonical: url, languages: { en: english, ja: japanese, "x-default": english } },
    robots: { index: Boolean(siteUrl), follow: Boolean(siteUrl) },
    icons: { icon: sitePath("/icon.svg") },
    openGraph: { type, title: localizedTitle, description, siteName: profile.name, locale: locale === "ja" ? "ja_JP" : "en_US", alternateLocale: [locale === "ja" ? "en_US" : "ja_JP"], url, images: [{ url: socialImage, width: 1200, height: 630, alt: profile.name }] },
    twitter: { card: "summary_large_image", title: localizedTitle, description, images: [socialImage] }
  };
}

export function structuredData(locale: Locale, path: string[], detail?: { title: string; description: string; category?: string; image?: string }) {
  const home = new URL(route(locale), metadataBase).href;
  const person = {
    "@type": "Person", "@id": `${metadataBase.origin}${route("en")}#shafayetul-islam`, name: profile.name,
    url: home, image: new URL(sitePath(profile.portrait.src), metadataBase).href,
    jobTitle: messages[locale].title, sameAs: [profile.github, profile.linkedin, profile.scholar, profile.youtube].filter(Boolean),
  };
  return {
    "@context": "https://schema.org",
    "@graph": [
      person,
      ...(detail ? [{
        "@type": path[0] === "blog" ? "TechArticle" : "CreativeWork",
        name: detail.title, description: detail.description, inLanguage: locale,
        url: new URL(route(locale, ...path), metadataBase).href,
        ...(path[0] === "projects" ? { contributor: { "@id": person["@id"] } } : {}),
        ...(detail.category ? { genre: detail.category } : {}),
        ...(detail.image ? { image: new URL(sitePath(detail.image), metadataBase).href } : {})
      }] : [])
    ]
  };
}
