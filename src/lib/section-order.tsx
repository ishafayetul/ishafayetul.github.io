import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Fragment, type ReactNode } from "react";
import defaults from "./section-layout.json";

type Layout = keyof typeof defaults;
function savedOrder(): Partial<Record<Layout, string[]>> {
  try {
    return JSON.parse(readFileSync(join(process.cwd(), "content/data/section-order.json"), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

const saved = savedOrder();

export function sectionOrder(layout: Layout) {
  const original = Object.keys(defaults[layout].sections);
  return [...new Set([...(saved[layout] ?? []), ...original])].filter(id => original.includes(id));
}

export function orderedSections(layout: Layout, blocks: Record<string, ReactNode>) {
  return sectionOrder(layout).map(id => <Fragment key={id}>{blocks[id]}</Fragment>);
}
