import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { imagePath, videoPath } from "../admin/storage.mjs";

const read = name => JSON.parse(readFileSync(new URL(name, import.meta.url), "utf8"));
const content = name => read(`../content/data/${name}.json`);
const locales = ["en", "ja"];
const projects = content("projects");
const articles = content("articles");
const publications = content("publications");
const profile = content("profile");
const experience = content("experience");
const en = read("../messages/en.json");
const ja = read("../messages/ja.json");
const published = new Set(projects.filter(project => !project.draft).map(project => project.slug));
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const datePattern = /^\d{4}(?:-(?:0[1-9]|1[0-2]))?$/;

function text(value, label) {
  assert(typeof value === "string" && value.trim(), `${label} must contain text`);
}

function translated(value, label) {
  for (const locale of locales) text(value?.[locale], `${label} (${locale})`);
}

function list(values, label) {
  assert(Array.isArray(values), `${label} must be a list`);
  values.forEach(value => text(value, label));
  assert(new Set(values).size === values.length, `${label} contains duplicates`);
}

function url(value, label) {
  const parsed = URL.parse(value);
  assert(parsed?.protocol === "https:" && !parsed.username && !parsed.password, `${label} must use HTTPS`);
}

function localFile(path, label, pattern = /^\/(?:images|documents)\/(?:[a-z0-9-]+\/)*[a-z0-9-]+\.[a-z0-9]+$/) {
  assert(typeof path === "string" && pattern.test(path), `${label} must refer to a safe local public file`);
  assert(existsSync(new URL(`../public${path}`, import.meta.url)), `${label} file missing: ${path}`);
}

function image(asset, label) {
  localFile(asset?.src, label);
  translated(asset?.alt, `${label} alt`);
  if (asset.preview) localFile(asset.preview, `${label} preview`);
  if (asset.caption) translated(asset.caption, `${label} caption`);
}

function recordMedia(record, label) {
  if (record.image !== undefined) {
    assert(typeof record.image?.src === "string" && imagePath.test(record.image.src), `${label} needs a local image`);
    image(record.image, `${label} image`);
  }
  if (record.videoSrc !== undefined) localFile(record.videoSrc, `${label} video`, videoPath);
}

function unique(records, key) {
  assert(new Set(records.map(record => record[key])).size === records.length, `Duplicate ${key}`);
}

function references(slugs, label) {
  list(slugs, label);
  for (const slug of slugs) assert(published.has(slug), `${label} points to unpublished or unknown project ${slug}`);
}

function markdowns(group, slug, required) {
  const paths = locales.map(locale => new URL(`../content/${locale}/${group}/${slug}.md`, import.meta.url));
  if (required || paths.some(existsSync)) for (const path of paths) {
    assert(existsSync(path), `Missing Markdown: ${path.pathname}`);
    text(readFileSync(path, "utf8"), path.pathname);
  }
}

function messageParity(left, right) {
  assert.deepEqual(Object.keys(left).sort(), Object.keys(right).sort(), "English and Japanese message keys differ");
  for (const key of Object.keys(left)) {
    if (typeof left[key] === "object") messageParity(left[key], right[key]);
    else text(right[key], `messages.ja.${key}`);
  }
}

const orderPath = new URL("../content/data/section-order.json", import.meta.url);
if (existsSync(orderPath)) {
  const defaults = read("../src/lib/section-layout.json");
  const order = content("section-order");
  assert(order && typeof order === "object" && !Array.isArray(order), "Page layout must be an object");
  for (const [group, ids] of Object.entries(order)) {
    const layout = Object.hasOwn(defaults, group) && defaults[group];
    assert(layout, `Unknown layout group: ${group}`);
    list(ids, `Layout ${group}`);
    assert(ids.every(id => Object.hasOwn(layout.sections, id)), `Unknown section in layout ${group}`);
  }
}

messageParity(en, ja);
translated(profile.location, "profile.location");
assert(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email), "Invalid public email address");
for (const key of ["github", "linkedin", "scholar"]) url(profile[key], `profile.${key}`);
if (profile.youtube) url(profile.youtube, "profile.youtube");
localFile(profile.resume, "résumé");
assert.equal(readFileSync(new URL(`../public${profile.resume}`, import.meta.url)).subarray(0, 5).toString(), "%PDF-", "Résumé is not a PDF");
image(profile.portrait, "portrait");
for (const highlight of profile.highlights) {
  text(highlight.value, "highlight value");
  translated(highlight.label, "highlight");
}
for (const locale of locales) localFile(`/images/social-${locale}.png`, "social image");

unique(projects, "slug");
unique(projects, "id");
for (const project of projects) {
  const label = project.slug;
  assert(slugPattern.test(label), `Invalid project slug: ${label}`);
  assert.equal(project.id, label, `Project id must match slug: ${label}`);
  if (project.draft) {
    assert(!project.featured, `Draft cannot be featured: ${label}`);
    continue;
  }
  assert(!project.featured || !project.archive, `Featured project cannot be archived: ${label}`);
  translated(project.title, `${label} title`);
  translated(project.summary, `${label} summary`);
  for (const category of [project.category, ...(project.categories ?? [])]) assert(Object.hasOwn(en.categories, category), `Unknown category: ${category}`);
  if (project.status) assert(Object.hasOwn(en.statuses, project.status), `Unknown status: ${project.status}`);
  for (const key of ["startDate", "endDate"]) if (project[key]) assert(datePattern.test(project[key]), `Invalid ${label} ${key}`);
  if (project.startDate && project.endDate) assert(project.startDate.slice(0, 4) <= project.endDate.slice(0, 4) && !(project.startDate.length === project.endDate.length && project.startDate > project.endDate), `Reversed dates: ${label}`);
  for (const field of ["role", "organization"]) if (project[field]) translated(project[field], `${label} ${field}`);
  list(project.technologies, `${label} technologies`);
  for (const field of ["hardware", "software"]) if (project[field]) list(project[field], `${label} ${field}`);
  for (const key of ["githubUrl", "demoUrl", "publicationUrl"]) if (project[key]) url(project[key], `${label} ${key}`);
  if (project.youtubeId) {
    assert(/^[A-Za-z0-9_-]{11}$/.test(project.youtubeId), `Invalid YouTube id: ${label}`);
    assert(project.demoUrl, `A video needs a fallback link: ${label}`);
  }
  if (project.videoSrc) localFile(project.videoSrc, `${label} video`);
  for (const asset of [project.thumbnail, ...(project.gallery ?? []), ...(project.architecture ?? [])].filter(Boolean)) image(asset, label);
  for (const metric of project.metrics ?? []) {
    translated(metric.label, `${label} metric label`);
    translated(metric.conditions, `${label} metric conditions`);
    text(metric.value, `${label} metric value`);
  }
  references(project.relatedProjects ?? [], label);
  assert(!project.relatedProjects?.includes(label), `A project cannot link to itself: ${label}`);
  markdowns("projects", label, project.featured);
}

unique(articles, "slug");
for (const article of articles) {
  assert(slugPattern.test(article.slug), `Invalid article slug: ${article.slug}`);
  translated(article.title, `${article.slug} title`);
  translated(article.summary, `${article.slug} summary`);
  list(article.tags, `${article.slug} tags`);
  if (article.project) references([article.project], article.slug);
  recordMedia(article, article.slug);
  markdowns("blog", article.slug, true);
}

unique(publications, "doi");
for (const item of publications) {
  assert(/^10\.\d{4,9}\/\S+$/.test(item.doi), `Invalid DOI: ${item.id}`);
  assert(["journal", "conference"].includes(item.type), `Unknown publication type: ${item.id}`);
  assert(Number.isInteger(item.year) && item.authors.length > 0, `Missing bibliographic data: ${item.id}`);
  for (const author of item.authors) {
    text(author.given, `${item.id} given name`);
    text(author.family, `${item.id} family name`);
  }
  for (const key of ["title", "venue", "pages"]) text(item[key], `${item.id} ${key}`);
  references(item.projects, item.id);
}

for (const role of experience) {
  translated(role.title, `${role.id} title`);
  translated(role.organization, `${role.id} organization`);
  for (const key of ["description", "type"]) if (role[key]) translated(role[key], `${role.id} ${key}`);
  assert(/^\d{4}-\d{2}$/.test(role.start) && datePattern.test(role.start), `Invalid employment start: ${role.id}`);
  if (role.end) assert(/^\d{4}-\d{2}$/.test(role.end) && datePattern.test(role.end) && role.end >= role.start, `Invalid employment end: ${role.id}`);
  references(role.projects, role.id);
  list(role.technologies, `${role.id} technologies`);
}
for (const item of content("achievements")) {
  for (const key of ["title", "result", "role"]) translated(item[key], `${item.id} ${key}`);
  if (item.url) url(item.url, item.id);
  if (item.project) references([item.project], item.id);
  recordMedia(item, item.id);
}
for (const item of content("teaching")) {
  text(item.title, "teaching organization");
  for (const course of item.courses) translated(course, item.title);
  if (item.url) url(item.url, item.title);
}
for (const event of content("outreach")) {
  if (event.url) url(event.url, "outreach event");
  recordMedia(event, "outreach event");
}
for (const [name, fields] of [["education", ["title", "organization", "period", "description"]], ["activities", ["title", "description"]], ["outreach", ["title", "organization"]], ["certifications", ["title", "value"]], ["skills", ["label"]]]) {
  for (const item of content(name)) for (const key of fields) translated(item[key], `${name} ${key}`);
}

console.log(`Validated ${published.size} published projects, ${articles.length} articles and ${publications.length} publications in English and Japanese.`);
