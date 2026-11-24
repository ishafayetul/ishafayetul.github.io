import type { NextConfig } from "next";

const url = process.env.SITE_URL ? new URL(process.env.SITE_URL) : null;
const basePath = url?.pathname.replace(/\/$/, "") ?? "";
if (url && (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
  !/^(?:\/[A-Za-z0-9_][A-Za-z0-9_.-]*)*$/.test(basePath))) {
  throw new Error("SITE_URL must be an HTTPS site URL, optionally including a GitHub Pages repository path.");
}

const config: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath,
  env: { NEXT_PUBLIC_SITE_BASE_PATH: basePath },
  agentRules: false,
  devIndicators: false,
  images: { unoptimized: true }
};
export default config;
