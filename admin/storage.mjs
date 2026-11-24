export const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const assetPath = /^\/images\/(?:[a-z0-9-]+\/)*[a-z0-9-]+\.(webp|png|jpe?g|gif|avif|svg)$/;

async function fileAt(root, path, create = false) {
  const parts = path.split("/");
  if (parts.some(part => !part || part === "." || part === ".." || !/^[a-zA-Z0-9_.-]+$/.test(part))) {
    throw new Error("Invalid workspace path.");
  }
  let directory = root;
  for (const name of parts.slice(0, -1)) directory = await directory.getDirectoryHandle(name);
  return directory.getFileHandle(parts.at(-1), { create });
}

export async function getFile(root, path) {
  try {
    return await (await fileAt(root, path)).getFile();
  } catch (error) {
    if (error.name !== "NotFoundError") throw error;
    return null;
  }
}

export async function readText(root, path) {
  return (await getFile(root, path))?.text() ?? null;
}

export async function openWorkspace(root) {
  const manifest = JSON.parse(await readText(root, "package.json") ?? "null");
  if (manifest?.name !== "shafayetul-islam-portfolio" ||
      !Array.isArray(JSON.parse(await readText(root, "content/data/projects.json") ?? "null"))) {
    throw new Error("Select the root folder of the robotics portfolio.");
  }
  await root.getDirectoryHandle("public");
  return root;
}

export async function localImage(root, path) {
  if (!assetPath.test(path ?? "")) return null;
  return getFile(root, "public" + path);
}

export function assetName(filename, slug = "media") {
  if (!slugPattern.test(slug)) throw new Error("Enter a valid slug before adding images.");
  const stem = filename.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 55).replace(/-$/, "");
  return `/images/projects/${slug}-${stem || "image"}-${crypto.randomUUID().slice(0, 8)}.webp`;
}

export async function optimizeImage(file) {
  if (!["image/png", "image/jpeg", "image/webp", "image/avif"].includes(file.type) || file.size > 20 * 1024 * 1024) {
    throw new Error("Choose a PNG, JPEG, WebP or AVIF image under 20 MB.");
  }
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/webp", .88));
    if (blob?.type !== "image/webp") throw new Error("This browser could not encode WebP.");
    return blob;
  } finally {
    bitmap.close();
  }
}

async function check(root, change) {
  const current = await getFile(root, change.path);
  const same = change.before === null ? !current : current && await current.text() === change.before;
  if (!same) throw new Error(`${change.path} changed on disk. Your edits are still in the editor. Copy them elsewhere before reopening the folder.`);
}

export async function saveChanges(root, changes) {
  for (const change of changes) await check(root, change);
  for (const change of changes) {
    await check(root, change);
    const handle = await fileAt(root, change.path, change.before === null);
    const stream = await handle.createWritable({ mode: "exclusive" });
    try {
      if (change.before !== null) await check(root, change);
      await stream.write(change.value);
      await stream.close();
    } catch (error) {
      await stream.abort().catch(() => {});
      throw error;
    }
    change.saved = true;
  }
}
