import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { join, sep } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
export const repository = "ishafayetul/ishafayetul.github.io";
const remote = `https://github.com/${repository}.git`;
const scopes = ["content/data", "content/en", "content/ja", "messages", "public/images", "public/documents"];
const editable = /^(?:content\/data\/[a-z-]+\.json|content\/(?:en|ja)\/(?:projects|blog)\/[a-z0-9-]+\.md|messages\/(?:en|ja)\.json|public\/(?:images|documents)\/(?:[a-z0-9-]+\/)*[a-z0-9-]+\.(?:webp|png|jpe?g|gif|avif|svg|pdf|mp4|webm))$/;
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

  async function checkFiles(paths) {
    const hashes = await Promise.all(paths.map(async path => {
      const file = join(cwd, path);
      const metadata = await lstat(file).catch(error => {
        if (error.code === "ENOENT") return null;
        throw error;
      });
      if (!metadata) return null;
      if (!metadata.isFile() || metadata.size > 20 * 1024 * 1024 || !(await realpath(file)).startsWith(rootPath + sep)) throw new Error(`Review the file type or size of ${path}.`);
      return createHash("sha256").update(await readFile(file)).digest("hex");
    }));
    return hashes;
  }

  async function outgoingFiles(from, to) {
    const files = split(await git(["log", "--format=", "--name-only", "--no-renames", "-z", `${from}..${to}`]));
    return [...new Set(files)].sort();
  }

  async function state() {
    const branch = (await git(["branch", "--show-current"])).trim();
    const head = (await git(["rev-parse", "HEAD"])).trim();
    const paths = await changed();
    const remoteHead = (await git(["for-each-ref", "--format=%(objectname)", "refs/remotes/origin/main"])).trim();
    const [history, ahead, outgoing] = await Promise.all([
      git(["log", "--format=%H%x09%aI%x09%s", "--", ...scopes]),
      remoteHead ? git(["log", "--format=%h %s", `${remoteHead}..${head}`]) : "",
      remoteHead ? outgoingFiles(remoteHead, head) : []
    ]);
    const proof = createHash("sha256").update(JSON.stringify([head, remoteHead, paths, await checkFiles(paths)])).digest("hex");
    return { head, remoteHead, branch, paths, outgoing, ahead: ahead.trim().split("\n").filter(Boolean), proof,
      history: history.trim().split("\n").filter(Boolean).map(line => {
        const [id, date, ...message] = line.split("\t");
        return { id, date, message: message.join("\t") };
      }) };
  }

  async function cleanIndex() {
    if ((await git(["diff", "--cached", "--name-only", "-z"])).length) {
      throw new Error("The Git index already contains staged changes. Finish that Git operation before using version history or Push.");
    }
    const conflicts = await git(["ls-files", "--unmerged"]);
    if (conflicts.trim()) throw new Error("Resolve the Git conflicts before continuing.");
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
    if (!selected.length) return false;
    await cleanIndex();
    await checkFiles(selected);
    await git(["add", "-A", "--", ...selected], "Could not stage the selected content files");
    let staged = [];
    try {
      staged = split(await git(["diff", "--cached", "--name-only", "--no-renames", "-z"]));
      if (staged.some(path => !selected.includes(path))) throw new Error("The staged files changed during the save. Review git status.");
      const index = await git(["ls-files", "--stage", "--", ...staged]);
      if (/^(?:120000|160000) /m.test(index)) throw new Error("Portfolio versions cannot contain symbolic links or submodules.");
      await git(["diff", "--cached", "--check"], "The staged content has whitespace errors");
      await scan(["--staged"]);
      const description = message ?? (staged.length === 1 ? `Save ${staged[0].split("/").at(-1)}` : `Save portfolio (${staged.length} files)`);
      await git(["commit", "-m", description], "Could not create a portfolio version. Check your Git identity and hooks");
      return true;
    } catch (error) {
      if (staged.length) await git(["restore", "--staged", "--", ...staged.filter(path => selected.includes(path))]).catch(() => {});
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

  async function requireCleanCode() {
    const all = split(await git(["status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=all"]));
    if (all.some(change => !editable.test(change.slice(3)))) {
      throw new Error("There are uncommitted changes outside the portfolio content. Commit those separately before using Push.");
    }
  }

  async function verifyRemote() {
    const [origin, push, branch] = await Promise.all([git(["remote", "get-url", "--all", "origin"]),
      git(["remote", "get-url", "--push", "--all", "origin"]), git(["branch", "--show-current"])]);
    if (origin.trim() !== remote || push.trim() !== remote || branch.trim() !== "main") {
      throw new Error(`Push is configured for ${repository} on main.`);
    }
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
    await cleanIndex();
    await requireCleanCode();
    await verifyRemote();
    const saved = await state();
    if (proof !== saved.proof) throw new Error("The content or remote branch changed. Review Push again.");
    await check("content:validate");
    await check("lint");
    await check("test");
    await check("build", { SITE_URL: "https://ishafayetul.github.io/", PORTFOLIO_PREVIEW: "" });
    if ((await state()).proof !== proof) throw new Error("The content changed during the checks. Review Push again.");
    await requireCleanCode();
    await checkpoint(saved.paths);
    const head = (await git(["rev-parse", "HEAD"])).trim();
    const files = await outgoingFiles("origin/main", head);
    if (files.some(path => /(?:^|\/)(?:assets\/originals|node_modules|\.next|out|\.portfolio-tools|\.portfolio-admin[^/]*)(?:\/|$)|(?:^|\/)\.env(?!\.example$)|\.(?:pem|key|p12|pfx)$/i.test(path))) {
      throw new Error("An outgoing commit contains a local-only or credential file path. Review the commits before pushing.");
    }
    await checkFiles(files);
    if (files.length) {
      await scan([`--log-opts=origin/main..${head}`]);
      await git([...credential, "push", "origin", `${head}:refs/heads/main`], "GitHub rejected the push. The local commits are still available");
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

  return { state, checkpoint, restore, push, preview };
}
