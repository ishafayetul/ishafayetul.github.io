import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { About, Achievements, ArticleDetail, Blog, Contact, Experience, Home, ProjectDetail, Projects, Research, Resume, Teaching } from "@/components/portfolio";
import { articles, messages, pageNames, projects, type Locale, type PageName } from "./content";
import { pageMetadata, structuredData } from "./seo";

const pages = { home: Home, projects: Projects, experience: Experience, research: Research, about: About, contact: Contact, achievements: Achievements, teaching: Teaching, blog: Blog, resume: Resume };
export type RouteProps = { params: Promise<{ path?: string[] }> };

export function staticPaths() {
  return [
    ...pageNames.map(page => ({ path: page === "home" ? [] : [page] })),
    ...projects.map(project => ({ path: ["projects", project.slug] })),
    ...articles.map(article => ({ path: ["blog", article.slug] }))
  ];
}

function resolve(path: string[]) {
  if (path.length === 0) return { page: "home" as const };
  if (path.length === 1 && path[0] !== "home" && Object.hasOwn(pages, path[0])) return { page: path[0] as PageName };
  if (path.length === 2 && path[0] === "projects") {
    const project = projects.find(project => project.slug === path[1]);
    if (project) return { project };
  }
  if (path.length === 2 && path[0] === "blog") {
    const article = articles.find(article => article.slug === path[1]);
    if (article) return { article };
  }
  notFound();
}

export async function metadataFor(locale: Locale, { params }: RouteProps): Promise<Metadata> {
  const { path = [] } = await params;
  const t = messages[locale];
  const match = resolve(path);
  const detail = match.project ?? match.article;
  return detail
    ? pageMetadata(locale, path, detail.title[locale], detail.summary[locale], "article")
    : pageMetadata(locale, path, t.nav[match.page!], t.descriptions[match.page!]);
}

export async function renderPage(locale: Locale, { params }: RouteProps) {
  const { path = [] } = await params;
  const match = resolve(path);
  const detail = match.project ?? match.article;
  const Page = match.page ? pages[match.page] : null;
  const json = path.length === 0 || detail ? structuredData(locale, path, detail && {
    title: detail.title[locale], description: detail.summary[locale],
    category: match.project && messages[locale].categories[match.project.category],
    image: match.project?.thumbnail?.src
  }) : null;
  return <>
    {json && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(json).replace(/</g, "\\u003c") }} />}
    {Page && <Page locale={locale} />}
    {match.project && <ProjectDetail locale={locale} project={match.project} />}
    {match.article && <ArticleDetail locale={locale} article={match.article} />}
  </>;
}
