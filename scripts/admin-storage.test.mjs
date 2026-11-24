import assert from "node:assert/strict";
import { test } from "node:test";
import { assetName, openWorkspace, prepareVideo, readText, saveChanges, videoPath } from "../admin/storage.mjs";

function workspace() {
  const files = new Map([
    ["package.json", '{"name":"shafayetul-islam-portfolio"}'],
    ["content/data/projects.json", "[]"]
  ]);
  let videosExist = false;
  function directory(prefix = "") {
    return {
      getDirectoryHandle: async (name, { create } = {}) => {
        const path = prefix + name + "/";
        if (path === "public/videos/") {
          videosExist ||= Boolean(create);
          if (!videosExist) throw new DOMException("Missing", "NotFoundError");
        }
        return directory(path);
      },
      getFileHandle: async (name, { create } = {}) => {
        const path = prefix + name;
        if (!create && !files.has(path)) throw new DOMException("Missing", "NotFoundError");
        return {
          getFile: async () => new Blob([files.get(path)]),
          createWritable: async () => {
            let pending;
            return {
              write: async value => { pending = value; },
              close: async () => { files.set(path, pending); },
              abort: async () => {}
            };
          }
        };
      }
    };
  }
  return { root: directory(), files };
}

test("workspace writes content and local images to the approved checkout", async () => {
  const { root, files } = workspace();
  assert.equal(await openWorkspace(root), root);
  const asset = assetName("../Project photo.png", "demo");
  assert.match(asset, /^\/images\/projects\/demo-project-photo-[a-f0-9]{8}\.webp$/);
  const image = new Blob(["image"], { type: "image/webp" });
  await saveChanges(root, [
    { path: "public" + asset, before: null, value: image },
    { path: "content/data/projects.json", before: "[]", value: '[{"slug":"demo"}]' }
  ]);
  assert.equal(files.get("public" + asset), image);
  assert.equal(await readText(root, "content/data/projects.json"), '[{"slug":"demo"}]');
});

test("conflicts are detected before creating any of the files and traversal is rejected", async () => {
  const { root, files } = workspace();
  await assert.rejects(saveChanges(root, [
    { path: "content/en/projects/demo.md", before: null, value: "New" },
    { path: "content/data/projects.json", before: "outdated", value: "[{}]" }
  ]), /changed on disk/);
  assert.equal(files.has("content/en/projects/demo.md"), false);
  assert.equal(files.get("content/data/projects.json"), "[]");
  await assert.rejects(readText(root, "content/../package.json"), /Invalid workspace path/);
  assert.throws(() => assetName("photo.png", "../bad"), /valid slug/);
});

test("video uploads create their directory and reject mismatched containers", async () => {
  const { root, files } = workspace();
  const video = new Blob([new Uint8Array([0, 0, 0, 24]), "ftyp"], { type: "video/mp4" });
  const src = await prepareVideo(video);
  assert.match(src, videoPath);
  await saveChanges(root, [{ path: "public" + src, before: null, value: video }]);
  assert.equal(files.get("public" + src), video);
  await assert.rejects(prepareVideo(new Blob(["invalid"], { type: "video/mp4" })), /valid MP4 or WebM/);
  await assert.rejects(prepareVideo(new Blob([video], { type: "video/webm" })), /valid MP4 or WebM/);
});
