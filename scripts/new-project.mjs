import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";

const [slug, title = slug] = process.argv.slice(2);
if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
  console.error('Usage: npm run project:new -- project-slug "English title"');
  process.exit(1);
}

const registry = new URL("../content/data/projects.json", import.meta.url);
const projects = JSON.parse(readFileSync(registry, "utf8"));
const bodies = ["en", "ja"].map(locale => new URL(`../content/${locale}/projects/${slug}.md`, import.meta.url));
if (projects.some(project => project.slug === slug) || bodies.some(existsSync)) {
  console.error(`Project already exists: ${slug}`);
  process.exit(1);
}

projects.push({ id: slug, slug, title: { en: title, ja: "" }, summary: { en: "", ja: "" },
  category: "research", technologies: [], draft: true });

const created = [];
const replacement = new URL(`./.projects-${process.pid}.tmp`, registry);
try {
  const outlines = [
    "## Project overview\n\n## Engineering problem\n\n## My contributions\n\n## Technical implementation\n",
    "## 概要\n\n## 技術課題\n\n## 自分の担当\n\n## 技術構成\n"
  ];
  for (const [index, path] of bodies.entries()) {
    writeFileSync(path, outlines[index], { flag: "wx" });
    created.push(path);
  }
  writeFileSync(replacement, JSON.stringify(projects, null, 2) + "\n", { flag: "wx" });
  created.push(replacement);
  renameSync(replacement, registry);
} catch (error) {
  for (const path of created) if (existsSync(path)) unlinkSync(path);
  throw error;
}
console.log(`Created draft "${slug}" with English and Japanese Markdown. Complete the metadata and remove draft to publish it in the build.`);
