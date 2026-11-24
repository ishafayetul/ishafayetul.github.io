import "server-only";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Locale } from "./content";

export function getMarkdown(locale: Locale, group: "projects" | "blog", slug: string) {
  const path = join(process.cwd(), "content", locale, group, `${slug}.md`);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}
