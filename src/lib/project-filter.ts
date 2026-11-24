import type { Locale, Project } from "./content";

export function filterProjects(projects: Project[], locale: Locale, query: string, category: string, technology: string, sort: string) {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  return projects
    .map((project, index) => {
      const title = normalize(`${project.title[locale]} ${project.title.en}`);
      const keywords = normalize(`${title} ${project.summary[locale]} ${project.technologies.join(" ")}`);
      return { project, index, keywords, relevance: terms.filter(term => title.includes(term)).length };
    })
    .filter(({ project, keywords }) =>
      (!category || project.category === category || project.categories?.includes(category as Project["category"])) &&
      (!technology || project.technologies.includes(technology)) &&
      terms.every(term => keywords.includes(term))
    )
    .sort((a, b) => {
      if (sort === "date") {
        const date = (project: Project) => project.endDate ?? project.startDate ?? "";
        return date(b.project).localeCompare(date(a.project)) || a.index - b.index;
      }
      return b.relevance - a.relevance || a.index - b.index;
    })
    .map(({ project }) => project);
}

function normalize(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/\bros\s*([12])\b/g, "ros$1");
}
