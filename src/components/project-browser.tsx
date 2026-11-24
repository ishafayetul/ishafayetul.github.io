"use client";

import { ChevronDown, Search } from "lucide-react";
import { useState } from "react";
import { messages, type Locale, type Project } from "@/lib/content";
import { filterProjects } from "@/lib/project-filter";
import { ProjectCard } from "./project-card";

export function ProjectBrowser({ projects, locale, groupOrder }: { projects: Project[]; locale: Locale; groupOrder: string[] }) {
  const t = messages[locale];
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [technology, setTechnology] = useState("");
  const [sort, setSort] = useState("relevance");
  const technologies = [...new Set(projects.flatMap(project => project.technologies))].sort((a, b) => a.localeCompare(b));
  const results = filterProjects(projects, locale, query, category, technology, sort);
  const filtering = Boolean(query || category || technology || sort !== "relevance");
  const catalog = {
    featured: { title: t.featured, list: results.filter(project => project.featured) },
    other: { title: t.otherProjects, list: results.filter(project => !project.featured && !project.archive) },
    archive: { title: t.projectArchive, list: results.filter(project => project.archive) }
  };
  const groups = filtering ? [{ title: t.allProjects, list: results }]
    : groupOrder.map(id => catalog[id as keyof typeof catalog]);

  return <>
    <div className="filter-panel">
      <label className="search-field"><span>{t.projectsSearch}</span><div><Search size={19} aria-hidden="true" /><input type="search" placeholder={t.searchPlaceholder} value={query} onChange={event => setQuery(event.target.value)} /></div></label>
      <label><span>{t.category}</span><div className="select-wrap"><select value={category} onChange={event => setCategory(event.target.value)}>
        <option value="">{t.allCategories}</option>
        {Object.entries(t.categories).map(([id, name]) => <option value={id} key={id}>{name}</option>)}
      </select><ChevronDown aria-hidden="true" size={17} /></div></label>
      <label><span>{t.technology}</span><div className="select-wrap"><select value={technology} onChange={event => setTechnology(event.target.value)}>
        <option value="">{t.allTechnologies}</option>{technologies.map(item => <option key={item}>{item}</option>)}
      </select><ChevronDown aria-hidden="true" size={17} /></div></label>
      <label><span>{t.sort}</span><div className="select-wrap"><select value={sort} onChange={event => setSort(event.target.value)}>
        <option value="relevance">{t.relevance}</option><option value="date">{t.newest}</option>
      </select><ChevronDown aria-hidden="true" size={17} /></div></label>
    </div>
    <div className="filter-summary">
      <p role="status">{locale === "ja" ? `${results.length}${t.projectCount}` : `${results.length} ${results.length === 1 ? "project" : t.projectCount}`}</p>
      {filtering && <button className="text-link" type="button" onClick={() => {
        setQuery(""); setCategory(""); setTechnology(""); setSort("relevance");
      }}>{t.clear}</button>}
    </div>
    {!results.length && <p className="empty-message">{t.noProjects}</p>}
    {groups.filter(group => group.list.length).map(group => <section key={group.title} className="catalog-section">
      <h2>{group.title}</h2>
      <div className="project-grid">{group.list.map(project => <ProjectCard key={project.id} project={project} locale={locale} />)}</div>
    </section>)}
  </>;
}
