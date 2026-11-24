import { sitePath } from "@/lib/site-path";
import Image from "next/image";
import { BookOpen, CircuitBoard, Compass, Download, FileText, GitFork, Layers3, Mail, MapPin, Plane, Play, ScanLine, SquareArrowOutUpRight, Terminal } from "lucide-react";
import type { ReactNode } from "react";
import Markdown, { defaultUrlTransform } from "react-markdown";
import {
  achievements, activities, articles, authorNames, certifications, citations, education, experience, messages,
  outreach, period, profile, projectPeriod, projects, publications, route, skills, teaching,
  type Article, type Locale, type Project, type Publication
} from "@/lib/content";
import { orderedSections, sectionOrder } from "@/lib/section-order";
import { getMarkdown } from "@/lib/markdown";
import { CopyButton, FilterablePublications, MediaImage, VideoPlayer } from "./controls";
import { ProjectBrowser } from "./project-browser";
import { ProjectCard, Tags } from "./project-card";
import { SocialLinks } from "@/app/site-shell";

const skillIcons = { robotics: Compass, uav: Plane, perception: ScanLine, simulation: Layers3, software: Terminal, hardware: CircuitBoard };
function markdownUrl(url: string) {
  const safe = defaultUrlTransform(url);
  return safe.startsWith("/") && !safe.startsWith("//") ? sitePath(safe) : safe;
}

const featured = projects.filter(project => project.featured);

export function PageIntro({ title, description, label, children }: { title: string; description?: string; label?: string; children?: ReactNode }) {
  return <div className="page-intro">
    <div className="container">
      {label && <p className="eyebrow">{label}</p>}
      <h1>{title}</h1>
      {description && <p className="page-description">{description}</p>}
      {children}
    </div>
  </div>;
}

function SectionHeading({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return <div className="section-heading"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{children}</div>;
}

function Skills({ locale }: { locale: Locale }) {
  const t = messages[locale];
  return <section className="section container">
    <SectionHeading title={t.technicalExpertise} description={t.technicalSummary} />
    <div className="skills-grid">{skills.map(skill => {
      const Icon = skillIcons[skill.id as keyof typeof skillIcons];
      return <article className="skill-card" key={skill.id}><Icon size={23} aria-hidden="true" />
        <h3>{skill.label[locale]}</h3><Tags items={skill.technologies} />
      </article>;
    })}</div>
  </section>;
}

function Timeline({ locale, limit }: { locale: Locale; limit?: number }) {
  return <ol className="timeline">{experience.slice(0, limit).map(item => <li key={item.id}>
    <div className="timeline-date eyebrow">{period(locale, item.start, item.end, true)}</div>
    <div>
      <h3>{item.title[locale]}</h3><p className="timeline-org">{item.organization[locale]}{item.type && <> · {item.type[locale]}</>}</p>
      {item.description && <p>{item.description[locale]}</p>}
      {!limit && <><Tags items={item.technologies} />{item.projects.map(slug => {
        const project = projects.find(project => project.slug === slug);
        return project && <a key={slug} className="text-link" href={route(locale, "projects", slug)}>{project.title[locale]}</a>;
      })}</>}
    </div>
  </li>)}</ol>;
}

function PublicationCard({ publication, locale, compact = false }: { publication: Publication; locale: Locale; compact?: boolean }) {
  const t = messages[locale];
  const { reference, bibtex } = citations(publication);
  return <article className="publication-card">
    <p className="eyebrow">{publication.venue} · {publication.year}</p>
    <h3><a href={`https://doi.org/${publication.doi}`}>{publication.title}</a></h3>
    {!compact && <>
      <p>{authorNames(publication)}</p>
      <p className="publication-doi"><a href={`https://doi.org/${publication.doi}`}>{publication.doi}</a>{publication.volume && ` · Vol. ${publication.volume}`} · pp. {publication.pages}</p>
      <div className="action-row">
        <CopyButton value={reference} label={t.citation} locale={locale} />
        <CopyButton value={bibtex} label={t.bibtex} locale={locale} />
        {publication.projects.map(slug => {
          const project = projects.find(project => project.slug === slug);
          return project && <a className="text-link" href={route(locale, "projects", slug)} key={slug}>{project.title[locale]}</a>;
        })}
      </div>
    </>}
  </article>;
}

function ContactCallout({ locale }: { locale: Locale }) {
  const t = messages[locale];
  return <section className="section container">
    <div className="contact-callout">
      <div><h2>{t.contactTitle}</h2><p>{t.contactText}</p></div>
      <a className="button button-primary" href={`mailto:${profile.email}`}><Mail size={19} aria-hidden="true" />{t.emailMe}</a>
    </div>
  </section>;
}

export function Home({ locale }: { locale: Locale }) {
  const t = messages[locale];
  return orderedSections("home", {
    hero: <section className="hero">
      <div className="container hero-layout">
        <div className="hero-content">
          <p className="eyebrow hero-role"><span aria-hidden="true" />{t.title}</p>
          <h1>{profile.name}</h1>
          <p className="hero-tagline">{t.tagline}</p>
          <p className="hero-intro">{t.intro}</p>
          <div className="action-row">
            <a className="button button-primary" href={route(locale, "projects")}>{t.viewProjects}</a>
            <a className="button" href={sitePath(profile.resume)} download><Download size={17} aria-hidden="true" />{t.downloadResume}</a>
          </div>
          <SocialLinks locale={locale} />
        </div>
        <figure className="hero-figure">
          <div className="hero-image">
            <Image src={sitePath(profile.portrait.src)} alt={profile.portrait.alt[locale]} fill preload sizes="(max-width: 820px) 100vw, 550px" />
          </div>
          <figcaption><span><MapPin size={15} aria-hidden="true" />{profile.location[locale]}</span></figcaption>
        </figure>
      </div>
    </section>,
    highlights: <div className="container">
      <dl className="highlights" aria-label={t.profileHighlights}>{profile.highlights.map(({ value, label }) => <div key={value}><dt>{label[locale]}</dt><dd>{value}</dd></div>)}</dl>
    </div>,
    featured: <section className="section container">
      <SectionHeading title={t.selectedWork}><a className="button" href={route(locale, "projects")}>{t.allProjects}</a></SectionHeading>
      <div className="project-grid">{featured.map(project => <ProjectCard key={project.id} project={project} locale={locale} />)}</div>
    </section>,
    skills: <Skills locale={locale} />,
    experience: <section className="section container">
      <SectionHeading title={t.nav.experience}><a className="text-link" href={route(locale, "experience")}>{t.experienceCta}</a></SectionHeading>
      <Timeline locale={locale} limit={3} />
    </section>,
    evidence: <section className="section container home-research">
      {orderedSections("homeEvidence", {
        papers: <div>
        <SectionHeading title={t.selectedPublications} />
        {publications.filter(publication => publication.type === "journal").map(publication => <PublicationCard key={publication.id} publication={publication} locale={locale} compact />)}
        <a className="text-link" href={route(locale, "research")}>{t.publicationCta}</a>
      </div>,
        competition: <div>
        <SectionHeading title={t.competition} />
        <ul className="result-list">{achievements.filter(item => item.kind === "team").map(item => <li key={item.id}><span className="eyebrow">{item.year}</span><strong>{item.title[locale]}</strong><p>{item.result[locale]}</p></li>)}</ul>
        <a className="text-link" href={route(locale, "achievements")}>{t.nav.achievements}</a>
      </div>
      })}
    </section>,
    contact: <ContactCallout locale={locale} />
  });
}

export function Projects({ locale }: { locale: Locale }) {
  const t = messages[locale];
  return orderedSections("projects", {
    intro: <PageIntro title={t.nav.projects} description={t.descriptions.projects} />,
    catalog: <div className="container content-section"><ProjectBrowser projects={projects} locale={locale} groupOrder={sectionOrder("projectGroups")} /></div>
  });
}

export function ProjectDetail({ locale, project }: { locale: Locale; project: Project }) {
  const t = messages[locale];
  const body = getMarkdown(locale, "projects", project.slug);
  const periodLabel = projectPeriod(project, locale);
  const fields = [
    [t.role, project.role?.[locale]], [t.organization, project.organization?.[locale]], [t.period, periodLabel],
    [t.status, project.status && t.statuses[project.status]]
  ].filter(([, value]) => value);
  const photos = [...(project.thumbnail ? [project.thumbnail] : []), ...(project.gallery ?? [])];
  const related = (project.relatedProjects ?? []).map(slug => projects.find(other => other.slug === slug)).filter((other): other is Project => Boolean(other));
  const resources = [
    { href: project.githubUrl, label: t.repository, Icon: GitFork },
    { href: project.demoUrl, label: t.video, Icon: Play },
    { href: project.publicationUrl, label: t.paper, Icon: BookOpen }
  ];
  return orderedSections("projectDetail", {
    intro: <PageIntro title={project.title[locale]} description={project.summary[locale]} label={t.categories[project.category]} />,
    caseStudy: <div className="container content-section detail-layout">
      <article className="case-study">
      {orderedSections("caseStudy", {
        markdown: body && <div className="markdown"><Markdown urlTransform={markdownUrl}>{body}</Markdown></div>,
        architecture: (project.architecture?.length ?? 0) > 0 && <section><h2>{t.architecture}</h2><div className="gallery">{project.architecture?.map(image => <MediaImage key={image.src} image={image} locale={locale} />)}</div></section>,
        media: (photos.length > 0 || project.youtubeId || project.videoSrc) && <section>
          <h2>{t.media}</h2>
          {photos.length > 0 && <div className="gallery">{photos.map(image => <MediaImage key={image.src} image={image} locale={locale} />)}</div>}
          {project.youtubeId && <VideoPlayer id={project.youtubeId} title={project.title[locale]} locale={locale} />}
          {project.videoSrc && <video className="local-video" src={sitePath(project.videoSrc)} preload="none" controls aria-label={project.title[locale]} />}
        </section>,
        results: (project.metrics?.length ?? 0) > 0 && <section><h2>{t.evaluation}</h2>
          <dl className="metric-grid">{project.metrics?.map(metric => <div key={metric.label.en}><dt>{metric.label[locale]}</dt><dd><strong>{metric.value}</strong><p>{metric.conditions[locale]}</p></dd></div>)}</dl>
        </section>
      })}
      </article>
      {(fields.length > 0 || project.technologies.length > 0 || resources.some(resource => resource.href) || project.hardware || project.software) && <aside className="case-aside">
      {orderedSections("caseSidebar", {
        facts: fields.length > 0 && <dl>{fields.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl>,
        stack: project.technologies.length > 0 && <div><h2>{t.stack}</h2><Tags items={project.technologies} /></div>,
        hardware: project.hardware && <div><h2>{t.hardware}</h2><Tags items={project.hardware} /></div>,
        software: project.software && <div><h2>{t.software}</h2><Tags items={project.software} /></div>,
        resources: resources.some(resource => resource.href) && <div><h2>{t.resources}</h2><ul className="resource-list">
          {resources.filter(resource => resource.href).map(({ href, label, Icon }) => <li key={label}><a className="text-link" href={href}><Icon size={17} aria-hidden="true" />{label}</a></li>)}
        </ul></div>
      })}
      </aside>}
      <a className="text-link back-link" href={route(locale, "projects")}>{t.allProjects}</a>
    </div>,
    related: related.length > 0 && <section className="section container"><SectionHeading title={t.related} /><div className="project-grid">{related.map(item => <ProjectCard key={item.slug} project={item} locale={locale} />)}</div></section>
  });
}

export function Experience({ locale }: { locale: Locale }) {
  const t = messages[locale];
  return orderedSections("experience", {
    intro: <PageIntro title={t.nav.experience} description={t.descriptions.experience} />,
    timeline: <div className="container content-section"><Timeline locale={locale} /></div>
  });
}

export function About({ locale }: { locale: Locale }) {
  const t = messages[locale];
  return orderedSections("about", {
    intro: <PageIntro title={t.nav.about} description={t.descriptions.about} />,
    profile: <div className="container content-section about-intro">
      <div className="about-photo"><Image src={sitePath(profile.portrait.src)} alt={profile.portrait.alt[locale]} fill sizes="(max-width: 650px) 80vw, 245px" /></div>
      <div><h2>{profile.name}</h2><p className="eyebrow">{t.title}</p><p>{t.aboutText}</p><p className="timeline-org"><MapPin size={16} aria-hidden="true" />{profile.location[locale]}</p><SocialLinks locale={locale} /></div>
    </div>,
    credentials: <div className="section container split-grid">
      {orderedSections("credentials", {
        education: <section><SectionHeading title={t.education} /><div className="stack">{education.map(item => <article className="info-card" key={item.title.en}>
        <p className="eyebrow">{item.period[locale]}</p><h3>{item.title[locale]}</h3><p className="timeline-org">{item.organization[locale]}</p><p>{item.description[locale]}</p>
      </article>)}</div></section>,
        languages: <section><SectionHeading title={t.languages} /><dl className="info-card language-list">{certifications.map(item => <div key={item.title.en}><dt>{item.title[locale]}</dt><dd>{item.value[locale]}</dd></div>)}</dl></section>
      })}
    </div>,
    skills: <Skills locale={locale} />,
    activities: <section className="section container">
      <SectionHeading title={t.activities} />
      <div className="info-grid">{activities.map(item => <article className="info-card" key={item.title.en}><p className="eyebrow">{item.year}</p><h3>{item.title[locale]}</h3><p>{item.description[locale]}</p></article>)}</div>
    </section>
  });
}

export function Research({ locale }: { locale: Locale }) {
  const t = messages[locale];
  const landing = projects.find(project => project.slug === "uav-safe-landing");
  const thesis = education.find(item => item.title.en.startsWith("B.Sc."));
  return orderedSections("research", {
    intro: <PageIntro title={t.nav.research} description={t.descriptions.research} />,
    overview: <div className="container content-section split-grid research-overview">
      {orderedSections("researchOverview", {
        interests: <section className="info-card"><h2>{t.interests}</h2><p>{t.interestText}</p></section>,
        ongoing: landing && <section className="info-card"><h2>{t.ongoing}</h2><p>{landing.summary[locale]}</p><a className="text-link" href={route(locale, "projects", landing.slug)}>{landing.title[locale]}</a></section>,
        thesis: thesis && <section className="info-card"><h2>{t.undergraduateThesis}</h2><p>{thesis.description[locale]}</p></section>
      })}
    </div>,
    papers: <section className="section container">
      <SectionHeading title={t.published}><a className="button" href={profile.scholar}>Google Scholar</a></SectionHeading>
      <FilterablePublications label={t.publicationType} labels={{ all: t.allPublications, journal: t.journal, conference: t.conference }}
        entries={publications.map(publication => ({ type: publication.type, id: publication.id, content: <PublicationCard publication={publication} locale={locale} /> }))} />
    </section>
  });
}

export function Achievements({ locale }: { locale: Locale }) {
  const t = messages[locale];
  return orderedSections("achievements", {
    intro: <PageIntro title={t.nav.achievements} description={t.descriptions.achievements} />,
    recognition: <div className="container content-section stack">
      {sectionOrder("recognition").map(kind => <section className="catalog-section" key={kind}>
        <SectionHeading title={kind === "team" ? t.competition : t.grants} />
        <div className="info-grid">{achievements.filter(item => item.kind === kind).map(item => <article className="info-card achievement-card" key={item.id}>
          <p className="eyebrow">{item.year}</p><h3>{item.title[locale]}</h3><p className="timeline-org">{item.result[locale]}</p>
          {item.organization && <p>{item.organization[locale]}</p>}<p>{t.role} · {item.role[locale]}</p>
          <div className="action-row">{item.project && <a href={route(locale, "projects", item.project)} className="text-link">{t.viewCase}</a>}
          {item.url && <a href={item.url} className="text-link">{t.viewSource}</a>}</div>
        </article>)}</div>
      </section>)}
    </div>
  });
}

export function Teaching({ locale }: { locale: Locale }) {
  const t = messages[locale];
  return orderedSections("teaching", {
    intro: <PageIntro title={t.nav.teaching} description={t.descriptions.teaching} />,
    courses: <section className="container content-section">
      <SectionHeading title={t.courses} />
      <div className="info-grid">{teaching.map(item => <article className="info-card" key={item.title}>
        <h3>{item.title}</h3><ul className="course-list">{item.courses.map(course => <li key={course.en}>{course[locale]}</li>)}</ul>
        {item.url && <a className="text-link" href={item.url}>{t.courseList}</a>}
      </article>)}</div>
    </section>,
    workshops: <section className="section container">
      <SectionHeading title={t.workshops} />
      <div className="info-grid">{outreach.map(item => <article className="info-card" key={item.title.en}>
        <h3>{item.title[locale]}</h3><p>{item.organization[locale]}{item.year && ` · ${item.year}`}</p>
        {item.url && <a className="text-link" href={item.url}>{t.viewSource}</a>}
      </article>)}</div>
    </section>,
    leadership: <section className="section container">
      <SectionHeading title={t.clubLeadership} />
      <div className="info-grid">{activities.filter(item => item.club).map(item => <article className="info-card" key={item.title.en}>
        <p className="eyebrow">{item.year}</p><h3>{item.title[locale]}</h3><p>{item.description[locale]}</p>
      </article>)}</div>
    </section>
  });
}

export function Blog({ locale }: { locale: Locale }) {
  const t = messages[locale];
  return orderedSections("blog", {
    intro: <PageIntro title={t.nav.blog} description={t.descriptions.blog} />,
    posts: <section className="container content-section info-grid blog-grid" aria-label={t.nav.blog}>
      {articles.map(article => <article className="info-card" key={article.slug}>
        <BookOpen className="content-icon" aria-hidden="true" /><h2><a href={route(locale, "blog", article.slug)}>{article.title[locale]}</a></h2>
        <p>{article.summary[locale]}</p><Tags items={article.tags} />
      </article>)}
    </section>
  });
}

export function ArticleDetail({ locale, article }: { locale: Locale; article: Article }) {
  const t = messages[locale];
  const project = projects.find(project => project.slug === article.project);
  return orderedSections("articleDetail", {
    intro: <PageIntro title={article.title[locale]} description={article.summary[locale]} label={t.nav.blog}><Tags items={article.tags} /></PageIntro>,
    details: <div className="container content-section">
      {orderedSections("articleBody", {
        markdown: <article className="markdown"><Markdown urlTransform={markdownUrl}>{getMarkdown(locale, "blog", article.slug)}</Markdown></article>,
        related: project && <div className="article-related"><h2>{t.related}</h2><a className="text-link" href={route(locale, "projects", project.slug)}>{project.title[locale]}</a></div>
      })}
      <a className="text-link back-link" href={route(locale, "blog")}>{t.nav.blog}</a>
    </div>
  });
}

export function Contact({ locale }: { locale: Locale }) {
  const t = messages[locale];
  return orderedSections("contact", {
    intro: <PageIntro title={t.nav.contact} description={t.contactText} />,
    details: <div className="container content-section split-grid">
      {orderedSections("contactDetails", {
        email: <section className="info-card contact-card"><Mail className="content-icon" aria-hidden="true" /><h2>{t.emailMe}</h2>
        <a className="email-address" href={`mailto:${profile.email}`}>{profile.email}</a>
        <CopyButton value={profile.email} label={t.copyEmail} locale={locale} />
      </section>,
        links: <section className="info-card contact-card"><SquareArrowOutUpRight className="content-icon" aria-hidden="true" /><h2>{t.links}</h2>
        <SocialLinks locale={locale} full /><a className="text-link" href={route(locale, "resume")}>{t.nav.resume}</a>
      </section>
      })}
    </div>
  });
}

export function Resume({ locale }: { locale: Locale }) {
  const t = messages[locale];
  return orderedSections("resume", {
    intro: <PageIntro title={t.nav.resume} description={t.descriptions.resume}>
      <div className="action-row"><a className="button button-primary" href={sitePath(profile.resume)} download><Download size={18} aria-hidden="true" />{t.downloadResume}</a>
        <a className="button" href={sitePath(profile.resume)}><FileText size={18} aria-hidden="true" />{t.resumePdf}</a>
        <span className="muted">{t.resumePdfLanguage}</span>
      </div>
    </PageIntro>,
    document: <section className="container content-section">
      <h2>{t.resumePreview}</h2>
      <iframe className="resume-frame" loading="lazy" title={t.resumePreview} src={sitePath(profile.resume)} />
    </section>
  });
}
