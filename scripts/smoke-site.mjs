import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const origin = new URL(process.argv[2] ?? "http://localhost:3000");
const mount = origin.pathname.replace(/\/$/, "");
const publicUrl = process.env.SITE_URL ? new URL(process.env.SITE_URL) : null;
const expectedBase = publicUrl?.pathname.replace(/\/$/, "") ?? mount;
const normalize = path => path.replace(/\/$/, "") || "/";
const read = name => JSON.parse(readFileSync(new URL(`../content/data/${name}.json`, import.meta.url), "utf8"));
const projects = read("projects").filter(project => !project.draft);
const articles = read("articles");
const paths = [
  "/", "/projects", "/experience", "/research", "/about", "/contact", "/achievements", "/teaching", "/blog", "/resume",
  ...projects.map(project => `/projects/${project.slug}`), ...articles.map(article => `/blog/${article.slug}`)
];
const assets = new Set();
const pageTitles = new Set();

function local(path) {
  return new URL(mount + path, origin);
}

for (const locale of ["en", "ja"]) {
  for (const path of paths) {
    const japanesePath = `/ja${path === "/" ? "" : path}`;
    const target = locale === "ja" ? japanesePath : path;
    const response = await fetch(local(target));
    assert.equal(response.status, 200, target);
    const html = await response.text();
    assert(html.includes(`<html lang="${locale}"`), `Missing correct document language: ${target}`);
    assert.equal(html.match(/<h1[\s>]/g)?.length, 1, `Expected one page heading: ${target}`);
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
    assert(title && !pageTitles.has(title), `Missing or duplicate title: ${target}`);
    pageTitles.add(title);
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
    assert.equal(normalize(new URL(canonical).pathname), normalize(expectedBase + target), `Invalid canonical: ${target}`);
    if (publicUrl) assert.equal(new URL(canonical).origin, publicUrl.origin, `Invalid production origin: ${target}`);
    const alternates = Object.fromEntries(Array.from(html.matchAll(/<link rel="alternate" hrefLang="([^"]+)" href="([^"]+)"/gi), match => [match[1], new URL(match[2]).href]));
    assert.equal(normalize(alternates.en), normalize(new URL(expectedBase + path, canonical).href), `Missing English hreflang: ${target}`);
    assert.equal(normalize(alternates.ja), normalize(new URL(expectedBase + japanesePath, canonical).href), `Missing Japanese hreflang: ${target}`);
    assert.equal(alternates["x-default"], alternates.en, `Missing default hreflang: ${target}`);
    for (const [, link] of html.matchAll(/(?:src|href)="(\/[^"]+)"/g)) {
      if (!/\/(?:images|documents)\//.test(link)) continue;
      assert(link.startsWith(mount + "/"), `Asset escaped the site prefix: ${link}`);
      assets.add(link.slice(mount.length));
    }
  }
}

for (const asset of assets) {
  const response = await fetch(local(asset), { method: "HEAD" });
  assert.equal(response.status, 200, asset);
  assert(/^(image\/|application\/pdf)/.test(response.headers.get("content-type") ?? ""), `Unexpected asset type: ${asset}`);
}

for (const path of ["/projects/missing-case", "/ja/blog/missing-note", "/unmapped/path"]) {
  assert.equal((await fetch(local(path))).status, 404, `Expected a 404: ${path}`);
}

assert.equal((await fetch(local("/admin/"))).status, 404, "Admin must stay outside the export");

const sitemap = await fetch(local("/sitemap.xml"));
assert(sitemap.ok, "Sitemap response failed");
const robots = await (await fetch(local("/robots.txt"))).text();
if (publicUrl) {
  assert.equal((await sitemap.text()).match(/<loc>/g)?.length, paths.length * 2, "Sitemap page count");
  assert(robots.includes(`Sitemap: ${publicUrl.origin}${expectedBase}/sitemap.xml`), "Missing sitemap in robots.txt");
} else {
  assert(robots.includes("Disallow: /"), "Preview indexing should be disabled");
}

console.log(`Checked ${paths.length * 2} localized pages, ${assets.size} local assets, missing routes, robots and sitemap.`);
