const basePath = process.env.NEXT_PUBLIC_SITE_BASE_PATH ?? "";

export function sitePath(path: string) {
  return basePath + path;
}

export function pagePath(path: string) {
  return sitePath(path.endsWith("/") ? path : path + "/");
}
