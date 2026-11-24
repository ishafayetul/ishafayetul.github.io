import { sitePath } from "@/lib/site-path";
import Image from "next/image";
import { CircuitBoard, Compass, Crosshair, FlaskConical, GitFork, Layers3, Plane, Play, ScanLine, Trophy } from "lucide-react";
import { messages, route, type Locale, type Project } from "@/lib/content";

const categoryIcons = { mobile: Compass, uav: Plane, manipulation: Crosshair, ai: ScanLine, simulation: Layers3, embedded: CircuitBoard, research: FlaskConical, competition: Trophy };

export function ProjectArt({ project, locale }: { project: Project; locale: Locale }) {
  const Icon = categoryIcons[project.category];
  return <div className={`project-art art-${project.category}`}>
    {project.thumbnail ? <Image fill src={sitePath(project.thumbnail.preview ?? project.thumbnail.src)} alt={project.thumbnail.alt[locale]} sizes="(max-width: 640px) 100vw, (max-width: 1000px) 50vw, 400px" style={{ objectPosition: project.thumbnail.position }} />
      : <div className="project-placeholder" aria-hidden="true"><span><Icon size={40} strokeWidth={1.35} /></span></div>}
  </div>;
}

export function Tags({ items }: { items: string[] }) {
  return items.length > 0 && <ul className="tags">{items.map(item => <li key={item}>{item}</li>)}</ul>;
}

export function ProjectCard({ project, locale }: { project: Project; locale: Locale }) {
  const t = messages[locale];
  return <article className="project-card">
    <a className="project-cover" href={route(locale, "projects", project.slug)} aria-label={project.title[locale]}>
      <ProjectArt project={project} locale={locale} />
    </a>
    <div className="project-card-body">
      <div className="project-meta"><span className="eyebrow">{t.categories[project.category]}</span>{project.status && <span className="status">{t.statuses[project.status]}</span>}</div>
      <h3>{project.title[locale]}</h3>
      <p>{project.summary[locale]}</p>
      <Tags items={project.technologies.slice(0, 4)} />
      <div className="card-links">
        <a className="text-link" href={route(locale, "projects", project.slug)} aria-label={`${t.viewCase} · ${project.title[locale]}`}>{t.viewCase}</a>
        {project.githubUrl && <a className="icon-button" href={project.githubUrl} aria-label={t.repository}><GitFork size={18} aria-hidden="true" /></a>}
        {project.demoUrl && <a className="icon-button" href={project.demoUrl} aria-label={t.video}><Play size={16} aria-hidden="true" /></a>}
      </div>
    </div>
  </article>;
}
