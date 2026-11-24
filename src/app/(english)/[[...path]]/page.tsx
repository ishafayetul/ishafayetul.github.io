import { metadataFor, renderPage, staticPaths, type RouteProps } from "@/lib/pages";

export const dynamicParams = false;
export function generateStaticParams() { return staticPaths(); }
export function generateMetadata(props: RouteProps) { return metadataFor("en", props); }
export default function Page(props: RouteProps) { return renderPage("en", props); }
