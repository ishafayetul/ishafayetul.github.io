import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { markdownSections, moveItem } from "../admin/reorder.mjs";
import { portfolioGit, repository } from "./admin-git.mjs";

test("ordering moves an item without changing the others and ignores headings in code", () => {
  const items = ["intro", "projects", "contact"];
  assert(moveItem(items, 2, 0));
  assert.deepEqual(items, ["contact", "intro", "projects"]);
  assert.equal(moveItem(items, -1, 0), false);
  const { prefix, blocks } = markdownSections("Lead\n\n## One\n```\n## code\n```\n\n## Two\nBody\n");
  assert.equal(prefix, "Lead\n\n");
  assert.deepEqual(blocks.map(block => block.title), ["One", "Two"]);
  assert.match(blocks[0].text, /## code/);
});

test("versions capture only selected files and a restore preserves the edits it replaces", async t => {
  const fixture = await mkdtemp(join(tmpdir(), "portfolio-versions-"));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd: fixture, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const path = "content/data/profile.json";
  const content = join(fixture, path);
  await mkdir(join(fixture, "content/data"), { recursive: true });
  await writeFile(content, '{"name":"Original"}\n');
  await writeFile(join(fixture, "notes.txt"), "Original notes");
  git("init", "--initial-branch=main");
  git("config", "user.name", "Portfolio Test");
  git("config", "user.email", "portfolio@example.test");
  git("add", "--", path, "notes.txt");
  git("commit", "-m", "Initial content");
  const first = git("rev-parse", "HEAD");

  const scanner = join(fixture, "scanner");
  await writeFile(scanner, "#!/bin/sh\nexit 0\n", { mode: 0o700 });
  const admin = portfolioGit(fixture, scanner);
  await writeFile(content, '{"name":"Saved"}\n');
  const video = "public/videos/test-clip.webm";
  await mkdir(join(fixture, "public/videos"), { recursive: true });
  await writeFile(join(fixture, video), "Test video");
  await writeFile(join(fixture, "notes.txt"), "User's unrelated work");
  assert.equal(await admin.checkpoint([path, video]), true);
  const saved = git("rev-parse", "HEAD");
  assert.equal(git("show", "HEAD:notes.txt"), "Original notes");
  assert.equal(git("show", `HEAD:${video}`), "Test video");

  git("init", "--bare", "test-origin.git");
  git("push", "test-origin.git", "main");
  await writeFile(content, '{"name":"Edited after push"}\n');
  assert.equal(await admin.restore(first), true);
  assert.equal((await readFile(content, "utf8")).trim(), '{"name":"Original"}');
  assert.equal(git("show", "HEAD~1:" + path), '{"name":"Edited after push"}');
  assert.equal(git("rev-parse", "HEAD~2"), saved);
  await assert.rejects(readFile(join(fixture, video)), { code: "ENOENT" });
  assert.equal(await readFile(join(fixture, "notes.txt"), "utf8"), "User's unrelated work");
  assert.equal(git("--git-dir=test-origin.git", "rev-parse", "main"), saved);
  await assert.rejects(admin.checkpoint(["../notes.txt"]), /Only workspace content/);
  await assert.rejects(admin.restore("HEAD~2"), /Invalid portfolio version/);
});

test("a failed scan leaves edits on disk and clears only the attempted checkpoint", async t => {
  const fixture = await mkdtemp(join(tmpdir(), "portfolio-scan-"));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd: fixture, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const path = "content/data/profile.json";
  await mkdir(join(fixture, "content/data"), { recursive: true });
  await writeFile(join(fixture, path), "{}\n");
  git("init", "--initial-branch=main");
  git("config", "user.name", "Portfolio Test");
  git("config", "user.email", "portfolio@example.test");
  git("add", "--", path);
  git("commit", "-m", "Initial content");
  const scanner = join(fixture, "scanner");
  await writeFile(scanner, "#!/bin/sh\nexit 1\n", { mode: 0o700 });
  await writeFile(join(fixture, path), '{"edit":true}\n');
  await assert.rejects(portfolioGit(fixture, scanner).checkpoint([path]), /Gitleaks/);
  assert.equal(git("diff", "--cached", "--name-only"), "");
  assert.equal(await readFile(join(fixture, path), "utf8"), '{"edit":true}\n');
});

test("deployment commits reviewed code and content before pushing and preserves the commit if checks fail", async t => {
  const fixture = await mkdtemp(join(tmpdir(), "portfolio-deploy-"));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  const root = join(fixture, "checkout");
  const remote = join(fixture, "origin.git");
  const bin = join(fixture, "bin");
  const trace = join(fixture, "calls");
  const stopScan = join(fixture, "stop-scan");
  const stopBuild = join(fixture, "stop-build");
  const realGit = execFileSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).trim();
  const git = (...args) => execFileSync(realGit, args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const save = (path, value) => writeFile(join(root, path), value + "\n");
  const route = "src/app/(english)/[[...path]]/page.tsx";
  const data = "content/data/profile.json";
  const note = "docs/RELEASE.md";
  await mkdir(join(root, "src/app/(english)/[[...path]]"), { recursive: true });
  await mkdir(join(root, "content/data"), { recursive: true });
  await mkdir(join(root, "docs"), { recursive: true });
  await mkdir(bin);
  await save(route, "export const fixture = 1;");
  await save(data, "{}");
  git("init", "--initial-branch=main");
  git("config", "user.name", "Portfolio Test");
  git("config", "user.email", "portfolio@example.test");
  git("--literal-pathspecs", "add", "--", route, data);
  git("commit", "-m", "Initial portfolio");
  const original = git("rev-parse", "HEAD");
  git("init", "--bare", remote);
  git("push", remote, "main");
  git("remote", "add", "origin", `https://github.com/${repository}.git`);
  git("update-ref", "refs/remotes/origin/main", original);

  const stub = (name, script) => writeFile(join(bin, name), `#!/usr/bin/env node\n${script}\n`, { mode: 0o700 });
  await stub("git", `
const { spawnSync } = require('node:child_process');
let args = process.argv.slice(2);
if (args[0] === '-c' && args.includes('fetch')) args = ['fetch', ${JSON.stringify(remote)}, 'refs/heads/main:refs/remotes/origin/main'];
else if (args[0] === '-c' && args.includes('push')) args = ['push', ${JSON.stringify(remote)}, args.at(-1)];
const child = spawnSync(${JSON.stringify(realGit)}, args, { stdio: 'inherit' });
process.exit(child.status ?? 1);
`);
  await stub("gh", `
if (process.argv[2] === 'repo') console.log(JSON.stringify({ nameWithOwner: ${JSON.stringify(repository)}, visibility: 'PUBLIC', defaultBranchRef: { name: 'main' }, viewerPermission: 'WRITE' }));
else if (process.argv[2] === 'workflow') require('node:fs').appendFileSync(${JSON.stringify(trace)}, 'workflow\\n');
else process.exit(1);
`);
  await stub("npm", `
const fs = require('node:fs');
fs.appendFileSync(${JSON.stringify(trace)}, process.argv[3] + '\\n');
if (process.argv[3] === 'build' && fs.existsSync(${JSON.stringify(stopBuild)})) process.exit(1);
`);
  await stub("scanner", `
const fs = require('node:fs');
fs.appendFileSync(${JSON.stringify(trace)}, process.argv.includes('--staged') ? 'staged scan\\n' : 'outgoing scan\\n');
if (fs.existsSync(${JSON.stringify(stopScan)})) process.exit(1);
`);
  const previousPath = process.env.PATH;
  process.env.PATH = `${bin}:${previousPath}`;
  t.after(() => { process.env.PATH = previousPath; });
  const admin = portfolioGit(root, join(bin, "scanner"));

  await save(route, "export const fixture = 2;");
  await save(data, '{"name":"Test"}');
  await save(note, "# Test release");
  assert.deepEqual((await admin.state()).paths, [data]);
  await assert.rejects(admin.checkpoint([route]), /Only workspace content/);
  const reviewed = await admin.deploymentReview();
  assert.deepEqual(reviewed.paths, [data, note, route]);
  await save(route, "export const fixture = 3;");
  await assert.rejects(admin.push(reviewed.proof), /changed/);
  assert.equal(git("rev-parse", "HEAD"), original);

  await save(".env.local", "EXAMPLE=fictional");
  await assert.rejects(admin.deploymentReview(), /outside the supported portfolio files/);
  await rm(join(root, ".env.local"));
  git("add", "--", data);
  await assert.rejects(admin.deploymentReview(), /already contains staged changes/);
  assert.equal(git("diff", "--cached", "--name-only"), data);
  git("restore", "--staged", "--", data);

  await writeFile(stopScan, "");
  await assert.rejects(admin.push((await admin.deploymentReview()).proof), /Gitleaks/);
  assert.equal(git("rev-parse", "HEAD"), original);
  assert.equal(git("diff", "--cached", "--name-only"), "");
  assert.deepEqual((await admin.deploymentReview()).paths, [data, note, route]);
  await rm(stopScan);

  await writeFile(stopBuild, "");
  await assert.rejects(admin.push((await admin.deploymentReview()).proof), /committed locally.*npm run build failed/);
  const release = git("rev-parse", "HEAD");
  assert.notEqual(release, original);
  assert.equal(git("--git-dir=" + remote, "rev-parse", "main"), original);
  assert.deepEqual(git("diff", "--name-only", original, release).split("\n"), [data, note, route]);
  await rm(stopBuild);

  assert.match((await admin.push((await admin.deploymentReview()).proof)).message, /Pages workflow has started/);
  assert.equal(git("rev-parse", "HEAD"), release);
  assert.equal(git("--git-dir=" + remote, "rev-parse", "main"), release);
  assert.deepEqual((await readFile(trace, "utf8")).trim().split("\n"), ["staged scan", "staged scan", "outgoing scan",
    "content:validate", "lint", "test", "build", "outgoing scan", "content:validate", "lint", "test", "build", "workflow"]);
});

test("deleting a project is versioned with its pages and references, and keeps media", async t => {
  const fixture = await mkdtemp(join(tmpdir(), "portfolio-delete-"));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  const paths = {
    "content/data/projects.json": '[{"slug":"removed"},{"slug":"kept","relatedProjects":["removed","other"]}]\n',
    "content/data/experience.json": '[{"id":"job","projects":["removed","kept"]}]\n',
    "content/data/publications.json": '[{"id":"paper","projects":["removed"]}]\n',
    "content/data/achievements.json": '[{"id":"award","project":"removed","title":{"en":"Award","ja":"賞"}}]\n',
    "content/data/articles.json": '[{"slug":"article","project":"removed"}]\n',
    "content/en/projects/removed.md": "# Removed\n",
    "content/ja/projects/removed.md": "# 削除\n",
    "public/images/projects/removed.webp": "retained"
  };
  for (const folder of ["content/data", "content/en/projects", "content/ja/projects", "public/images/projects"]) {
    await mkdir(join(fixture, folder), { recursive: true });
  }
  for (const [path, contents] of Object.entries(paths)) await writeFile(join(fixture, path), contents);
  const git = (...args) => execFileSync("git", args, { cwd: fixture, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "--initial-branch=main");
  git("config", "user.name", "Portfolio Test");
  git("config", "user.email", "portfolio@example.test");
  git("add", "--", ...Object.keys(paths));
  git("commit", "-m", "Initial records");
  const original = git("rev-parse", "HEAD");
  const scanner = join(fixture, "scanner");
  await writeFile(scanner, "#!/bin/sh\nexit 0\n", { mode: 0o700 });
  const admin = portfolioGit(fixture, scanner);
  const hash = value => createHash("sha256").update(value).digest("hex");
  const deletion = {
    section: "projects",
    index: 0,
    revision: hash(paths["content/data/projects.json"]),
    bodies: { en: hash(paths["content/en/projects/removed.md"]), ja: hash(paths["content/ja/projects/removed.md"]) }
  };
  const read = path => readFile(join(fixture, path), "utf8");
  await assert.rejects(admin.deleteRecord({ ...deletion, section: "profile" }), /deletable records/);
  await assert.rejects(admin.deleteRecord({ ...deletion, revision: "0".repeat(64) }), /changed on disk/);
  await assert.rejects(admin.deleteRecord({ ...deletion, bodies: { ...deletion.bodies, en: "0".repeat(64) } }), /Markdown changed/);
  assert.equal(git("rev-parse", "HEAD"), original);

  assert.deepEqual(await admin.deleteRecord(deletion), { index: 0 });
  assert.deepEqual(JSON.parse(await read("content/data/projects.json")), [{ slug: "kept", relatedProjects: ["other"] }]);
  assert.deepEqual(JSON.parse(await read("content/data/experience.json"))[0].projects, ["kept"]);
  assert.deepEqual(JSON.parse(await read("content/data/publications.json"))[0].projects, []);
  assert.equal(JSON.parse(await read("content/data/achievements.json"))[0].project, undefined);
  assert.equal(JSON.parse(await read("content/data/articles.json"))[0].project, undefined);
  await assert.rejects(read("content/en/projects/removed.md"), { code: "ENOENT" });
  await assert.rejects(read("content/ja/projects/removed.md"), { code: "ENOENT" });
  assert.equal(await read("public/images/projects/removed.webp"), "retained");

  const achievements = "content/data/achievements.json";
  const genericDeletion = { section: "achievements", index: 0, revision: hash(await read(achievements)) };
  await writeFile(scanner, "#!/bin/sh\nexit 1\n", { mode: 0o700 });
  await assert.rejects(admin.deleteRecord(genericDeletion), /Gitleaks/);
  assert.equal(JSON.parse(await read(achievements)).length, 1);
  assert.equal(git("diff", "--cached", "--name-only"), "");
  await writeFile(scanner, "#!/bin/sh\nexit 0\n", { mode: 0o700 });
  assert.deepEqual(await admin.deleteRecord(genericDeletion), { index: -1 });
  assert.equal((await admin.recordTemplate("achievements")).sample.title.en, "Award");

  assert.equal(await admin.restore(original), true);
  for (const [path, contents] of Object.entries(paths)) assert.equal(await read(path), contents);
});
