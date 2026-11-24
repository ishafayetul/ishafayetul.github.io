import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { extname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const mode = process.argv[2];
if (!["admin", "site"].includes(mode)) throw new Error("Choose admin or site.");
const admin = mode === "admin";
const port = Number(process.argv[3] ?? (admin ? 4174 : 4173));
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid local port.");
const host = `127.0.0.1:${port}`;
const basePath = !admin && process.env.SITE_URL ? new URL(process.env.SITE_URL).pathname.replace(/\/$/, "") : "";
const root = await realpath(fileURLToPath(new URL(admin ? "../admin/" : "../out/", import.meta.url)));
const adminPaths = new Set(["/index.html", "/editor.css", "/editor.mjs", "/storage.mjs"]);
const mime = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml",
  ".webp": "image/webp", ".png": "image/png", ".svg": "image/svg+xml", ".pdf": "application/pdf",
  ".woff2": "font/woff2", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
  ".avif": "image/avif", ".mp4": "video/mp4", ".webm": "video/webm", ".json": "application/json"
};

createServer(async (request, response) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  if (request.headers.host !== host) return response.writeHead(403).end();
  if (!["GET", "HEAD"].includes(request.method)) return response.writeHead(405, { Allow: "GET, HEAD" }).end();
  if (admin) {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self'; img-src blob:; connect-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  }
  try {
    const path = decodeURIComponent(new URL(request.url, `http://${host}`).pathname);
    if (basePath && path !== basePath && !path.startsWith(basePath + "/")) return response.writeHead(404).end();
    const relative = path.slice(basePath.length) || "/";
    const target = relative.endsWith("/") ? relative + "index.html" : relative;
    if (relative.split("/").includes("..") || relative.includes("\\") || (admin && !adminPaths.has(target))) return response.writeHead(404).end();
    let file = join(root, target);
    if (!admin && (await stat(file).catch(() => null))?.isDirectory()) {
      return response.writeHead(308, { Location: path + "/" }).end();
    }
    file = await realpath(file);
    if (!file.startsWith(root + sep)) return response.writeHead(404).end();
    const info = await stat(file);
    if (!info.isFile()) return response.writeHead(404).end();
    response.writeHead(200, { "Content-Type": mime[extname(file)] ?? "application/octet-stream", "Content-Length": info.size });
    if (request.method === "HEAD") return response.end();
    createReadStream(file).on("error", () => response.destroy()).pipe(response);
  } catch {
    response.writeHead(404).end();
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`${admin ? "Portfolio Admin" : "Static portfolio"}: http://${host}${basePath}/`);
});
