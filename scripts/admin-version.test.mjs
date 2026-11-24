import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { markdownSections, moveItem } from "../admin/reorder.mjs";
import { portfolioGit } from "./admin-git.mjs";

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
  await writeFile(join(fixture, "notes.txt"), "User's unrelated work");
  assert.equal(await admin.checkpoint([path]), true);
  const saved = git("rev-parse", "HEAD");
  assert.equal(git("show", "HEAD:notes.txt"), "Original notes");

  git("init", "--bare", "test-origin.git");
  git("push", "test-origin.git", "main");
  await writeFile(content, '{"name":"Edited after push"}\n');
  assert.equal(await admin.restore(first), true);
  assert.equal((await readFile(content, "utf8")).trim(), '{"name":"Original"}');
  assert.equal(git("show", "HEAD~1:" + path), '{"name":"Edited after push"}');
  assert.equal(git("rev-parse", "HEAD~2"), saved);
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
