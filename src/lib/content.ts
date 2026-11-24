import { pagePath } from "./site-path";
import en from "../../messages/en.json";
import ja from "../../messages/ja.json";
import projectData from "../../content/data/projects.json";
import articleData from "../../content/data/articles.json";
import publicationData from "../../content/data/publications.json";

export { default as profile } from "../../content/data/profile.json";
export { default as experience } from "../../content/data/experience.json";
export { default as education } from "../../content/data/education.json";
export { default as certifications } from "../../content/data/certifications.json";
export { default as skills } from "../../content/data/skills.json";
export { default as achievements } from "../../content/data/achievements.json";
export { default as outreach } from "../../content/data/outreach.json";
export { default as teaching } from "../../content/data/teaching.json";
export { default as activities } from "../../content/data/activities.json";

export type Locale = "en" | "ja";
export type Localized = Record<Locale, string>;
export type Messages = typeof en;
export const messages: Record<Locale, Messages> = { en, ja };

export type ImageAsset = { src: string; alt: Localized; caption?: Localized; position?: string; preview?: string };
export type Project = {
  id: string;
  slug: string;
  title: Localized;
  summary: Localized;
  category: keyof Messages["categories"];
  categories?: (keyof Messages["categories"])[];
  technologies: string[];
  startDate?: string;
  endDate?: string;
  role?: Localized;
  organization?: Localized;
  status?: keyof Messages["statuses"];
  featured?: boolean;
  archive?: boolean;
  draft?: boolean;
  thumbnail?: ImageAsset;
  gallery?: ImageAsset[];
  architecture?: ImageAsset[];
  githubUrl?: string;
  demoUrl?: string;
  publicationUrl?: string;
  youtubeId?: string;
  videoSrc?: string;
  hardware?: string[];
  software?: string[];
  metrics?: { label: Localized; value: string; conditions: Localized }[];
  relatedProjects?: string[];
};
export type Article = { slug: string; title: Localized; summary: Localized; tags: string[]; project?: string };
export type Publication = {
  id: string;
  type: "journal" | "conference";
  title: string;
  authors: { given: string; family: string }[];
  venue: string;
  year: number;
  doi: string;
  volume?: string;
  pages: string;
  projects: string[];
};

export const projects = (projectData as Project[]).filter(project => !project.draft);
export const articles: Article[] = articleData;
export const publications = publicationData as Publication[];
export const primaryNav = ["home", "projects", "experience", "research", "about", "contact"] as const;
export const secondaryNav = ["achievements", "teaching", "blog", "resume"] as const;
export const pageNames = [...primaryNav, ...secondaryNav];
export type PageName = typeof pageNames[number];

export function route(locale: Locale, ...parts: string[]) {
  return pagePath("/" + [locale === "ja" ? "ja" : "", ...(parts[0] === "home" ? parts.slice(1) : parts)].filter(Boolean).join("/"));
}

export function period(locale: Locale, start?: string, end?: string, ongoing = false) {
  const date = (value: string) => {
    if (value.length === 4) return locale === "ja" ? `${value}年` : value;
    return new Intl.DateTimeFormat(locale === "ja" ? "ja-JP" : "en-GB", {
      month: "short", year: "numeric", timeZone: "UTC"
    }).format(new Date(`${value}-01T00:00:00Z`));
  };
  if (!start) return end ? date(end) : undefined;
  if (!end && !ongoing) return date(start);
  return `${date(start)} ${locale === "ja" ? "〜" : "–"} ${end ? date(end) : messages[locale].present}`;
}

export function projectPeriod(project: Project, locale: Locale) {
  return period(locale, project.startDate, project.endDate, project.status === "development");
}

export function authorNames(publication: Publication) {
  return publication.authors.map(({ given, family }) => `${given} ${family}`).join(", ");
}

export function citations(publication: Publication) {
  const { id, type, title, authors, venue, year, volume, pages, doi } = publication;
  const reference = `${authorNames(publication)}. ${title}. ${venue}${volume ? ` ${volume}` : ""} (${year}), ${pages}. https://doi.org/${doi}`;
  const bibtex = [
    `@${type === "journal" ? "article" : "inproceedings"}{${id}-${year},`,
    `  title = {${title}},`,
    `  author = {${authors.map(({ given, family }) => `${family}, ${given}`).join(" and ")}},`,
    `  ${type === "journal" ? "journal" : "booktitle"} = {${venue}},`,
    `  year = {${year}},`,
    ...(volume ? [`  volume = {${volume}},`] : []),
    `  pages = {${pages.replace("-", "--")}},`,
    `  doi = {${doi}}`,
    "}"
  ].join("\n");
  return { reference, bibtex };
}
