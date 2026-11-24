import type { ReactNode } from "react";
import { SiteShell } from "@/app/site-shell";
import "@/app/globals.css";

export default function Layout({ children }: { children: ReactNode }) {
  return <SiteShell locale="en">{children}</SiteShell>;
}
