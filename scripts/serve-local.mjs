import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { realpath, rename, stat, writeFile } from "node:fs/promises";
import { extname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { portfolioGit } from "./admin-git.mjs";

const mode = process.argv[2];
if (!["admin", "site"].includes(mode)) throw new Error("Choose admin or site.");
const admin = mode === "admin";
const port = Number(process.argv[3] ?? (admin ? 4174 : 4173));
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid local port.");
const bind = "127.0.0.1";
const host = `${bind}:${port}`;
const repo = await realpath(fileURLToPath(new URL("../", import.meta.url)));
const basePath = !admin && process.env.SITE_URL ? new URL(process.env.SITE_URL).pathname.replace(/\/$/, "") : "";
const root = await realpath(join(repo, admin ? "admin" : "out"));
const adminPaths = new Set(["/index.html", "/editor.css", "/editor.mjs", "/storage.mjs", "/reorder.mjs"]);
const mime = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml",
  ".webp": "image/webp", ".png": "image/png", ".svg": "image/svg+xml", ".pdf": "application/pdf",
  ".woff2": "font/woff2", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
  ".avif": "image/avif", ".mp4": "video/mp4", ".webm": "video/webm", ".json": "application/json"
};
const git = admin ? portfolioGit(repo) : null;
let token, previewServer, operation;
const layouts = join(repo, "src", "lib", "section-layout.json");

async function serve(request, response, path, directory, prefix = "", only) {
  if (!["GET", "HEAD"].includes(request.method)) return response.writeHead(405, { Allow: "GET, HEAD" }).end();
  if (prefix && path !== prefix && !path.startsWith(prefix + "/")) return response.writeHead(404).end();
  const relative = path.slice(prefix.length) || "/";
  const target = relative.endsWith("/") ? relative + "index.html" : relative;
  if (relative.split("/").includes("..") || relative.includes("\\") || (only && !only.has(target))) return response.writeHead(404).end();
  let file = join(directory, target);
  if (!only && (await stat(file).catch(() => null))?.isDirectory()) {
    return response.writeHead(308, { Location: path + "/" }).end();
  }
  file = await realpath(file);
  if (!file.startsWith(directory + sep)) return response.writeHead(404).end();
  const info = await stat(file);
  if (!info.isFile()) return response.writeHead(404).end();
  const type = mime[extname(file)] ?? "application/octet-stream";
  const headers = { "Content-Type": type, "Content-Length": info.size };
  if (type.startsWith("video/")) {
    headers["Accept-Ranges"] = "bytes";
    const range = request.method === "GET" && /^bytes=(\d*)-(\d*)$/.exec(request.headers.range ?? "");
    if (range && (range[1] || range[2])) {
      const [, first, last] = range;
      const start = first ? Number(first) : Math.max(0, info.size - Number(last));
      const end = first && last ? Math.min(info.size - 1, Number(last)) : info.size - 1;
      if (start > end) return response.writeHead(416, { "Content-Range": `bytes */${info.size}` }).end();
      headers["Content-Range"] = `bytes ${start}-${end}/${info.size}`;
      headers["Content-Length"] = end - start + 1;
      response.writeHead(206, headers);
      return createReadStream(file, { start, end }).on("error", () => response.destroy()).pipe(response);
    }
  }
  response.writeHead(200, headers);
  if (request.method === "HEAD") return response.end();
  createReadStream(file).on("error", () => response.destroy()).pipe(response);
}

function reply(response, status, data) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" }).end(JSON.stringify(data));
}

async function previewUrl() {
  await git.preview();
  if (!previewServer) {
    const directory = await realpath(join(repo, ".portfolio-admin-preview"));
    previewServer = createServer(async (request, response) => {
      const localHost = `${bind}:${previewServer.address().port}`;
      if (request.headers.host !== localHost) return response.writeHead(403).end();
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("X-Content-Type-Options", "nosniff");
      try {
        const path = decodeURIComponent(new URL(request.url, `http://${localHost}`).pathname);
        await serve(request, response, path, directory);
      } catch { response.writeHead(404).end(); }
    });
    await new Promise((resolve, reject) => {
      previewServer.once("error", reject);
      previewServer.listen(0, bind, resolve);
    });
  }
  return `http://${bind}:${previewServer.address().port}/`;
}

async function action(request, response, path) {
  if (!token || request.headers["x-portfolio-workspace"] !== token ||
      request.headers.origin !== `http://${host}`) return reply(response, 403, { error: "Reconnect the portfolio folder." });
  if (request.method !== "POST" || request.headers["content-type"] !== "application/json") {
    return reply(response, 405, { error: "Use the local admin to perform this action." });
  }
  if (operation) return reply(response, 409, { error: "Wait for the current portfolio operation to finish." });
  operation = true;
  try {
    let body = "";
    for await (const chunk of request) {
      body += chunk.toString();
      if (body.length > 262_144) return reply(response, 413, { error: "The request is too large." });
    }
    const input = JSON.parse(body);
    let data;
    switch (path) {
      case "/api/state": data = await git.state(); break;
      case "/api/deploy-review": data = await git.deploymentReview(); break;
      case "/api/save": data = { version: await git.checkpoint(input.paths) }; break;
      case "/api/delete-record": data = await git.deleteRecord(input); break;
      case "/api/record-template": data = await git.recordTemplate(input.section); break;
      case "/api/restore": data = { version: await git.restore(input.id) }; break;
      case "/api/preview": data = { url: await previewUrl() }; break;
      case "/api/push": data = await git.push(input.proof); break;
      default: return reply(response, 404, { error: "Unknown admin action." });
    }
    return reply(response, 200, data);
  } catch (error) {
    return reply(response, 400, { error: error.message });
  } finally {
    operation = false;
  }
}

const server = createServer(async (request, response) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  if (request.headers.host !== host) return response.writeHead(403).end();
  if (admin) {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self'; img-src blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  }
  try {
    const path = decodeURIComponent(new URL(request.url, `http://${host}`).pathname);
    if (admin && path.startsWith("/api/")) return await action(request, response, path);
    if (admin && path === "/section-layout.json" && ["GET", "HEAD"].includes(request.method)) {
      if (request.method === "HEAD") return response.writeHead(200).end();
      response.writeHead(200, { "Content-Type": mime[".json"] });
      return createReadStream(layouts).on("error", () => response.destroy()).pipe(response);
    }
    await serve(request, response, path, root, basePath, admin ? adminPaths : undefined);
  } catch {
    response.writeHead(404).end();
  }
});

server.listen(port, bind, async () => {
  if (admin) {
    try {
      token = randomBytes(24).toString("hex");
      const marker = join(repo, ".portfolio-admin-session");
      const pending = `${marker}.${token}`;
      await writeFile(pending, token, { flag: "wx", mode: 0o600 });
      await rename(pending, marker);
    } catch {
      console.error("Could not write the local portfolio folder marker.");
      server.close();
      process.exitCode = 1;
      return;
    }
  }
  console.log(`${admin ? "Portfolio Admin" : "Static portfolio"}: http://${host}${basePath}/`);
});
