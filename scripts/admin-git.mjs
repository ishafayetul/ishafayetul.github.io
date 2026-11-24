import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { lstat, readFile, realpath, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
export const repository = "ishafayetul/ishafayetul.github.io";
const remote = `https://github.com/${repository}.git`;
const scopes = ["content/data", "content/en", "content/ja", "messages", "public/images", "public/documents", "public/videos"];
const editable = /^(?:content\/data\/[a-z-]+\.json|content\/(?:en|ja)\/(?:projects|blog)\/[a-z0-9-]+\.md|messages\/(?:en|ja)\.json|public\/(?:images|documents)\/(?:[a-z0-9-]+\/)*[a-z0-9-]+\.(?:webp|png|jpe?g|gif|avif|svg|pdf|mp4|webm)|public\/videos\/[a-z0-9-]+\.(?:mp4|webm))$/;
const projectFiles = new Set([".env.example", ".gitattributes", ".gitignore", ".nvmrc", "AGENTS.md", "README.md",
  "eslint.config.mjs", "next.config.ts", "package-lock.json", "package.json", "postcss.config.mjs", "tsconfig.json", "vercel.json", "public/icon.svg"]);
const sourceFile = /^(?:admin|scripts|src|docs)\/(?:[\w.()[\]-]+\/)*[\w.-]+\.(?:css|html|js|json|md|mjs|py|ts|tsx)$/;
const workflowFile = /^\.github\/workflows\/[\w.-]+\.ya?ml$/;
const localOnly = /(?:^|\/)(?:assets\/originals|node_modules|\.next|out|\.vercel|coverage|\.portfolio-tools|\.portfolio-admin[^/]*)(?:\/|$)|(?:^|\/)\.env(?!\.example$)|\.(?:pem|key|p12|pfx|tsbuildinfo)$/i;
const recordLists = new Set(["projects", "articles", "experience", "education", "skills", "publications",
  "achievements", "teaching", "certifications", "outreach", "activities"]);
const sha = /^[a-f0-9]{40}$/;
const split = value => value.split("\0").filter(Boolean);
const credential = ["-c", "credential.https://github.com.helper=", "-c", "credential.https://github.com.helper=!gh auth git-credential"];

export function portfolioGit(cwd, scanner = process.env.PORTFOLIO_GITLEAKS || "gitleaks") {
  async function command(bin, args, label, env = {}) {
    try {
      return (await exec(bin, args, { cwd, timeout: 180_000, maxBuffer: 4 * 1024 * 1024,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GH_PROMPT_DISABLED: "1", ...env } })).stdout;
    } catch (error) {
      const reason = error.code === "ENOENT" ? ` ${bin === scanner ? "Gitleaks" : bin} is missing.` : "";
      throw new Error(`${label}.${reason}`, { cause: error });
    }
  }
  const rootPath = cwd.replace(/\/$/, "");
  const git = (args, label = "Git operation failed") => command("git", args, label);
  const check = (name, env) => command("npm", ["run", name], `npm run ${name} failed. Run it in the portfolio folder to see the details`, env);

  async function changed() {
    const changes = split(await git(["status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=all", "--", ...scopes]));
    const paths = changes.map(change => change.slice(3));
    if (paths.some(path => !editable.test(path))) throw new Error("There are unsupported filenames in the portfolio content. Review git status before continuing.");
    return paths;
  }

  async function deploymentChanges() {
    const paths = split(await git(["status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=all"])).map(change => change.slice(3)).sort();
    if (paths.some(path => localOnly.test(path) || !(editable.test(path) || projectFiles.has(path) || sourceFile.test(path) || workflowFile.test(path)))) {
      throw new Error("This checkout contains changes outside the supported portfolio files. Review git status and handle those files separately before deploying.");
    }
    return paths;
  }

  async function checkFiles(paths, includeMode = false) {
    const hashes = await Promise.all(paths.map(async path => {
      const file = join(cwd, path);
      const metadata = await lstat(file).catch(error => {
        if (error.code === "ENOENT") return null;
        throw error;
      });
      if (!metadata) return null;
      if (!metadata.isFile() || metadata.size > 20 * 1024 * 1024 || !(await realpath(file)).startsWith(rootPath + sep)) throw new Error(`Review the file type or size of ${path}.`);
      const hash = createHash("sha256").update(await readFile(file)).digest("hex");
      return includeMode ? [metadata.mode, hash] : hash;
    }));
    return hashes;
  }

  async function outgoingFiles(from, to) {
    const files = split(await git(["log", "--format=", "--name-only", "--no-renames", "-z", `${from}..${to}`]));
    return [...new Set(files)].sort();
  }

  async function state(deployment = false) {
    const branch = (await git(["branch", "--show-current"])).trim();
    const head = (await git(["rev-parse", "HEAD"])).trim();
    const paths = deployment ? await deploymentChanges() : await changed();
    const remoteHead = (await git(["for-each-ref", "--format=%(objectname)", "refs/remotes/origin/main"])).trim();
    const [history, ahead, outgoing] = await Promise.all([
      git(["log", "--format=%H%x09%aI%x09%s", "--", ...scopes]),
      remoteHead ? git(["log", "--format=%h %s", `${remoteHead}..${head}`]) : "",
      remoteHead ? outgoingFiles(remoteHead, head) : []
    ]);
    const proof = createHash("sha256").update(JSON.stringify([deployment, branch, head, remoteHead, paths, await checkFiles(paths, deployment)])).digest("hex");
    return { head, remoteHead, branch, paths, outgoing, ahead: ahead.trim().split("\n").filter(Boolean), proof,
      history: history.trim().split("\n").filter(Boolean).map(line => {
        const [id, date, ...message] = line.split("\t");
        return { id, date, message: message.join("\t") };
      }) };
  }

  async function cleanIndex() {
    const conflicts = await git(["ls-files", "--unmerged"]);
    if (conflicts.trim()) throw new Error("Resolve the Git conflicts before continuing.");
    if ((await git(["diff", "--cached", "--name-only", "-z"])).length) {
      throw new Error("The Git index already contains staged changes. Finish that Git operation before using version history or Push.");
    }
  }

  async function scan(args) {
    const local = join(cwd, ".portfolio-tools", "gitleaks");
    const cached = scanner === "gitleaks" && (await lstat(local).catch(() => null))?.isFile();
    const verified = cached && createHash("sha256").update(await readFile(local)).digest("hex") ===
      "88f91962aa2f93ac6ab281d553b9e125f5197bbbce38f9f2437f7299c32e5509";
    await command(verified ? local : scanner, ["git", "--redact=100", "--no-banner", ...args, "."],
      "Gitleaks could not complete a clean scan. Review the staged files and scanner setup in the local terminal");
  }

  async function checkpoint(paths, message) {
    if (!Array.isArray(paths) || paths.some(path => typeof path !== "string" || !editable.test(path))) {
      throw new Error("Only workspace content and media can be saved as a portfolio version.");
    }
    const allowed = new Set(await changed());
    const selected = [...new Set(paths)].filter(path => allowed.has(path));
    return commitFiles(selected, message);
  }

  async function commitFiles(selected, message, reviewedProof) {
    if (!selected.length) return false;
    await cleanIndex();
    await checkFiles(selected);
    let staged = [];
    try {
      await git(["--literal-pathspecs", "add", "-A", "--", ...selected], "Could not stage the reviewed portfolio files");
      staged = split(await git(["diff", "--cached", "--name-only", "--no-renames", "-z"]));
      if (staged.some(path => !selected.includes(path)) || (reviewedProof && staged.length !== selected.length)) {
        throw new Error("The staged files changed during the save. Review git status.");
      }
      const index = await git(["--literal-pathspecs", "ls-files", "--stage", "--", ...staged]);
      if (/^(?:120000|160000) /m.test(index)) throw new Error("Portfolio versions cannot contain symbolic links or submodules.");
      await git(["diff", "--cached", "--check"], "The staged files have whitespace errors");
      const tree = await git(["write-tree"]);
      await scan(["--staged"]);
      if (reviewedProof) {
        if ((await state(true)).proof !== reviewedProof) throw new Error("The portfolio changed after review. Open Push & deploy again.");
        await git(["diff", "--quiet", "--no-ext-diff"], "The files on disk differ from the reviewed staging area. Review git status");
      }
      if (tree !== await git(["write-tree"])) throw new Error("The staged files changed during the scan. Review git status.");
      const description = message ?? (staged.length === 1 ? `Save ${staged[0].split("/").at(-1)}` : `Save portfolio (${staged.length} files)`);
      await git(["commit", "-m", description], "Could not create a portfolio version. Check your Git identity and hooks");
      if (reviewedProof && tree !== await git(["rev-parse", "HEAD^{tree}"])) {
        throw new Error("A Git hook changed the committed files. Review the local commit before pushing.");
      }
      return true;
    } catch (error) {
      if (!staged.length) staged = split(await git(["diff", "--cached", "--name-only", "--no-renames", "-z"]).catch(() => ""));
      const attempted = staged.filter(path => selected.includes(path));
      if (attempted.length) await git(["--literal-pathspecs", "restore", "--staged", "--", ...attempted]).catch(() => {});
      throw error;
    }
  }

  function registry(section) {
    if (!recordLists.has(section)) throw new Error("Choose a section with deletable records.");
    return `content/data/${section}.json`;
  }

  async function recordTemplate(section) {
    const path = registry(section);
    const commits = (await git(["log", "--format=%H", "--", path])).trim().split("\n").filter(Boolean);
    for (const commit of commits) {
      const text = await git(["show", `${commit}:${path}`]).catch(() => "");
      if (!text) continue;
      const sample = JSON.parse(text)[0];
      if (sample && typeof sample === "object") return { sample };
    }
    return { sample: {} };
  }

  async function deleteRecord({ section, index, revision, bodies }) {
    const path = registry(section);
    if (!Number.isInteger(index) || index < 0 || typeof revision !== "string" || !/^[a-f0-9]{64}$/.test(revision)) {
      throw new Error("Choose a saved record to delete.");
    }
    await cleanIndex();
    const [hash] = await checkFiles([path]);
    if (hash !== revision) throw new Error("This section changed on disk. Reopen the section before deleting a record.");
    const changes = new Map();

    async function currentFile(relative) {
      const [fingerprint] = await checkFiles([relative]);
      if (fingerprint === null) return null;
      const content = await readFile(join(cwd, relative));
      if (createHash("sha256").update(content).digest("hex") !== fingerprint) {
        throw new Error(`${relative} changed on disk. Reopen the section before deleting a record.`);
      }
      return content.toString("utf8");
    }

    function updateList(relative, before, items) {
      const after = JSON.stringify(items, null, 2) + "\n";
      if (before !== after) changes.set(relative, { before, after });
    }

    async function replaceFile(relative, contents) {
      const file = join(cwd, relative);
      if (!(await realpath(dirname(file))).startsWith(rootPath + sep)) throw new Error("The content directory moved outside the checkout.");
      if (contents === null) return unlink(file);
      const pending = `${file}.${randomUUID()}.tmp`;
      await writeFile(pending, contents, { flag: "wx" });
      try {
        await rename(pending, file);
      } catch (error) {
        await unlink(pending).catch(() => {});
        throw error;
      }
    }

    const before = await currentFile(path);
    if (before === null || createHash("sha256").update(before).digest("hex") !== revision) {
      throw new Error("This section changed on disk. Reopen the section before deleting a record.");
    }
    const items = JSON.parse(before);
    if (!Array.isArray(items) || !items[index]) throw new Error("That record is no longer available.");
    const [record] = items.splice(index, 1);
    if (section === "projects" || section === "articles") {
      const slug = record.slug;
      if (typeof slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("The record has an invalid slug.");
      for (const locale of ["en", "ja"]) {
        const markdown = `content/${locale}/${section === "projects" ? "projects" : "blog"}/${slug}.md`;
        const content = await currentFile(markdown);
        const fingerprint = content === null ? null : createHash("sha256").update(content).digest("hex");
        if (fingerprint !== bodies?.[locale]) throw new Error("The record's Markdown changed on disk. Reopen the record before deleting it.");
        if (content !== null) changes.set(markdown, { before: content, after: null });
      }
      if (section === "projects") {
        for (const project of items) {
          if (project.relatedProjects?.includes(slug)) {
            project.relatedProjects = project.relatedProjects.filter(value => value !== slug);
          }
        }
        for (const category of ["experience", "publications", "articles", "achievements"]) {
          const linkedPath = registry(category);
          const original = await currentFile(linkedPath);
          const linked = JSON.parse(original);
          let changedLinks = false;
          for (const item of linked) {
            if (item.project === slug) {
              delete item.project;
              changedLinks = true;
            }
            if (item.projects?.includes(slug)) {
              item.projects = item.projects.filter(value => value !== slug);
              changedLinks = true;
            }
          }
          if (changedLinks) updateList(linkedPath, original, linked);
        }
      }
    }
    updateList(path, before, items);

    const paths = [...changes.keys()];
    await checkpoint(paths, "Checkpoint before deleting portfolio record");
    const applied = [];
    try {
      for (const [relative, { before: original, after }] of changes) {
        if (await currentFile(relative) !== original) throw new Error(`${relative} changed during deletion. Reopen the section and try again.`);
        await replaceFile(relative, after);
        applied.push(relative);
      }
      const version = await checkpoint(paths, `Delete record from ${section}`);
      if (!version) throw new Error("Could not record the deletion in Git.");
      return { index: Math.min(index, items.length - 1) };
    } catch (error) {
      const rollback = await Promise.allSettled(applied.map(async relative => {
        const change = changes.get(relative);
        if (await currentFile(relative) !== change.after) throw new Error("The file was edited during deletion.");
        await replaceFile(relative, change.before);
      }));
      if (rollback.some(result => result.status === "rejected")) {
        throw new Error("Deletion was interrupted and some files changed during recovery. Your previous version is available in Versions.");
      }
      throw error;
    }
  }

  async function restore(id) {
    if (typeof id !== "string" || !sha.test(id)) throw new Error("Invalid portfolio version.");
    const saved = await state();
    if (!saved.history.some(item => item.id === id)) throw new Error("Choose a version listed in portfolio history.");
    await cleanIndex();
    await checkpoint(saved.paths, "Checkpoint before restoring portfolio");
    const paths = split(await git(["diff", "--name-only", "--no-renames", "-z", id, "HEAD", "--", ...scopes]));
    if (!paths.length) return false;
    if (paths.some(path => !editable.test(path))) throw new Error("This version contains unsupported portfolio filenames.");
    await git(["restore", `--source=${id}`, "--worktree", "--", ...paths], "Could not restore the selected portfolio files");
    return checkpoint(paths, `Restore portfolio version ${id.slice(0, 7)}`);
  }

  async function deploymentReview() {
    await cleanIndex();
    const markers = (await git(["rev-parse", "--git-path", "MERGE_HEAD", "--git-path", "sequencer",
      "--git-path", "CHERRY_PICK_HEAD", "--git-path", "REVERT_HEAD", "--git-path", "rebase-merge", "--git-path", "rebase-apply"])).trimEnd().split("\n");
    const pending = await Promise.all(markers.map(path => lstat(resolve(cwd, path)).catch(error => {
      if (error.code !== "ENOENT") throw error;
    })));
    if (pending.some(Boolean)) throw new Error("Finish the Git operation in this checkout before deploying.");
    return state(true);
  }

  async function verifyDestination() {
    const [origin, push, branch] = await Promise.all([git(["remote", "get-url", "--all", "origin"]),
      git(["remote", "get-url", "--push", "--all", "origin"]), git(["branch", "--show-current"])]);
    if (origin.trim() !== remote || push.trim() !== remote || branch.trim() !== "main") {
      throw new Error(`Push is configured for ${repository} on main.`);
    }
  }

  async function verifyRemote() {
    await verifyDestination();
    const repo = JSON.parse(await command("gh", ["repo", "view", repository, "--json", "nameWithOwner,visibility,defaultBranchRef,viewerPermission"],
      "Could not verify the GitHub repository. Check your GitHub CLI login"));
    if (repo.nameWithOwner !== repository || repo.visibility !== "PUBLIC" || repo.defaultBranchRef?.name !== "main" ||
        !["ADMIN", "MAINTAIN", "WRITE"].includes(repo.viewerPermission)) {
      throw new Error("GitHub repository ownership, visibility or write access could not be confirmed.");
    }
    await git([...credential, "fetch", "origin", "main"], "Could not refresh origin/main");
    await git(["merge-base", "--is-ancestor", "origin/main", "HEAD"], "origin/main has changes this checkout does not contain. Sync it before pushing");
  }

  async function push(proof) {
    const reviewed = await deploymentReview();
    if (proof !== reviewed.proof) throw new Error("The portfolio or remote branch changed. Open Push & deploy again.");
    await verifyRemote();
    if ((await deploymentReview()).proof !== proof) throw new Error("The portfolio or remote branch changed. Open Push & deploy again.");
    if (reviewed.outgoing.some(path => localOnly.test(path))) {
      throw new Error("An outgoing commit contains a local-only or credential file path. Review the commits before pushing.");
    }
    const committed = await commitFiles(reviewed.paths, "Save portfolio for deployment", proof);
    try {
      const saved = await deploymentReview();
      const previousHead = committed ? (await git(["log", "-1", "--format=%P", saved.head])).trim() : saved.head;
      if (saved.paths.length || previousHead !== reviewed.head || saved.remoteHead !== reviewed.remoteHead || saved.branch !== reviewed.branch) {
        throw new Error("The checkout changed while preparing the deployment. Open Push & deploy again.");
      }
      if (saved.outgoing.some(path => localOnly.test(path))) {
        throw new Error("An outgoing commit contains a local-only or credential file path. Review the commits before pushing.");
      }
      await checkFiles(saved.outgoing);
      if (saved.outgoing.length) await scan([`--log-opts=${saved.remoteHead}..${saved.head}`]);
      await check("content:validate");
      await check("lint");
      await check("test");
      await check("build", { SITE_URL: "https://ishafayetul.github.io/", PORTFOLIO_PREVIEW: "" });
      if ((await deploymentReview()).proof !== saved.proof) throw new Error("The portfolio changed during the checks. Open Push & deploy again.");
      if (saved.head !== saved.remoteHead) {
        await verifyDestination();
        await git([...credential, "push", "origin", `${saved.head}:refs/heads/main`], "GitHub rejected the push. The local commits are still available");
      }
    } catch (error) {
      if (committed) throw new Error(`The reviewed changes were committed locally. ${error.message}`, { cause: error });
      throw error;
    }
    try {
      await command("gh", ["workflow", "run", "pages.yml", "--repo", repository, "--ref", "main"], "GitHub Pages dispatch failed");
    } catch {
      return { message: "The source is on GitHub. The Pages workflow did not start. Use Push again to retry deployment." };
    }
    return { message: "Pushed to GitHub. The GitHub Pages workflow has started.",
      url: `https://github.com/${repository}/actions/workflows/pages.yml` };
  }

  async function preview() {
    await check("content:validate");
    await check("build", { SITE_URL: "", PORTFOLIO_PREVIEW: "1" });
  }

  return { state, deploymentReview, checkpoint, recordTemplate, deleteRecord, restore, push, preview };
}
