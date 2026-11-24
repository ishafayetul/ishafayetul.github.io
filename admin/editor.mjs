import { assetName, localImage, openWorkspace, optimizeImage, readText, saveChanges, slugPattern } from "./storage.mjs";

const jsonFile = name => `content/data/${name}.json`;
const sections = new Map([
  ["projects", "Projects"], ["articles", "Technical notes"], ["profile", "Profile"],
  ["experience", "Experience"], ["education", "Education"], ["skills", "Skills"],
  ["publications", "Publications"], ["achievements", "Achievements"], ["teaching", "Teaching"],
  ["certifications", "Language qualifications"], ["outreach", "Outreach"], ["activities", "Activities"],
  ["interface-en", "English interface"], ["interface-ja", "Japanese interface"], ["media", "Image library"]
]);
const languages = { en: "English", ja: "Japanese" };
const categories = { mobile: "Autonomous mobile robots", uav: "UAVs and drones", manipulation: "Robotic manipulation", ai: "Computer vision and AI", simulation: "Simulation", embedded: "Embedded systems", research: "Research", competition: "Competitive robotics" };
const statuses = { "": "Unspecified", completed: "Completed", development: "In development", research: "Research", prototype: "Prototype", simulation: "Simulation", archived: "Archived" };
const workspace = document.querySelector("#workspace");
const notice = document.querySelector("#status");
const saveButton = document.querySelector("#save");
const connect = document.querySelector("#connect");

let root;
let current;
let dirty = false;
let busy = false;
let objectUrls = [];
const bilingual = () => ({ en: "", ja: "" });
const emptyBodies = () => ({ en: { before: null, value: "" }, ja: { before: null, value: "" } });
const kind = () => current.section === "projects" ? "projects" : "blog";
const special = () => ["projects", "articles"].includes(current.section);
const sectionFile = section => section.startsWith("interface-") ? `messages/${section.slice(-2)}.json` : jsonFile(section);
const display = record => record?.title?.en || record?.title || record?.label?.en || record?.name || record?.id || record?.slug;
const textValue = value => typeof value === "string" ? value : "";
const json = value => JSON.stringify(value, null, 2) + "\n";

function el(tag, { text, className } = {}, ...children) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  node.append(...children);
  return node;
}

function button(text, action) {
  const node = el("button", { text });
  node.type = "button";
  node.addEventListener("click", action);
  return node;
}

function status(message = "", failed = false) {
  notice.textContent = message;
  notice.hidden = !message;
  notice.classList.toggle("error", failed);
}

function sync() {
  saveButton.hidden = !root;
  saveButton.disabled = !dirty || busy;
  connect.disabled = busy;
  workspace.inert = busy;
  document.querySelector("#sidebar").inert = busy;
}

function edited() {
  if (!dirty) status("Unsaved changes");
  dirty = true;
  sync();
}

function canLeave() {
  return !dirty || window.confirm("Discard unsaved changes in the editor?");
}

function input(label, value, change, { multiline = false, type = "text", className, disabled = false } = {}) {
  const field = el(multiline ? "textarea" : "input", { className });
  if (!multiline) field.type = type;
  field.disabled = disabled;
  if (type === "checkbox") {
    field.checked = Boolean(value);
  } else {
    field.value = value ?? "";
  }
  field.addEventListener("input", () => change(type === "checkbox" ? field.checked : type === "number" ? field.valueAsNumber : field.value));
  return el("label", { className: type === "checkbox" ? "check" : "" }, el("span", { text: label }), field);
}

function select(label, options, value, change) {
  const field = el("select");
  for (const [key, name] of Object.entries(options)) {
    const option = el("option", { text: name });
    option.value = key;
    field.append(option);
  }
  field.value = value;
  field.addEventListener("change", () => change(field.value));
  return el("label", {}, el("span", { text: label }), field);
}

function fieldset(label, ...children) {
  return el("fieldset", {}, el("legend", { text: label }), ...children);
}

function fieldName(key) {
  return languages[key] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, letter => letter.toUpperCase());
}

function reset(value) {
  if (typeof value === "boolean") return false;
  if (typeof value === "number") return 0;
  if (Array.isArray(value)) return [];
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, reset(item)]));
  return "";
}

async function selectRecord(index) {
  current.index = index;
  current.bodies = emptyBodies();
  if (!special() || index < 0) return;
  const slug = current.data[index].slug;
  if (!slugPattern.test(slug)) throw new Error("The selected record has an invalid slug.");
  for (const locale of Object.keys(languages)) {
    const path = `content/${locale}/${kind()}/${slug}.md`;
    const before = await readText(root, path);
    current.bodies[locale] = { path, before, value: before ?? "" };
  }
}

async function loadSection(section, index = 0) {
  const path = section === "media" ? null : sectionFile(section);
  const before = path && await readText(root, path);
  if (path && before === null) throw new Error(`Missing ${path}.`);
  const data = before ? JSON.parse(before) : null;
  current = { section, path, before, data, uploads: new Map(), library: [] };
  if (section === "media") {
    for (const folder of ["profile", "projects", "achievements", "teaching"]) {
      const images = await root.getDirectoryHandle("public").then(dir => dir.getDirectoryHandle("images"));
      let directory;
      try { directory = await images.getDirectoryHandle(folder); } catch (error) {
        if (error.name !== "NotFoundError") throw error;
        continue;
      }
      for await (const entry of directory.values()) {
        if (entry.kind === "file" && /\.(webp|png|jpe?g|gif|avif|svg)$/.test(entry.name)) current.library.push(`/images/${folder}/${entry.name}`);
      }
    }
    current.library.sort();
  }
  await selectRecord(Array.isArray(data) && data.length ? Math.min(index, data.length - 1) : -1);
  dirty = false;
  render();
}

async function run(action) {
  if (busy) return;
  busy = true;
  sync();
  try {
    await action();
  } catch (error) {
    if (error.name !== "AbortError") status(error.message, true);
  } finally {
    busy = false;
    sync();
  }
}

function sectionNavigation() {
  const nav = document.querySelector("#sections");
  nav.replaceChildren();
  for (const [id, label] of sections) {
    const item = button(label, () => {
      if (current.section !== id && canLeave()) run(async () => {
        await loadSection(id);
        status();
      });
    });
    if (current.section === id) item.setAttribute("aria-current", "page");
    nav.append(item);
  }
}

function update(record, key, value) {
  record[key] = value;
  edited();
}

function translated(label, value, change, multiline = false) {
  return fieldset(label, el("div", { className: "grid" }, ...Object.entries(languages).map(([locale, name]) =>
    input(`${label} · ${name}`, value?.[locale], text => change(locale, text), { multiline })
  )));
}

function pairField(label, record, key, multiline = false) {
  return translated(label, record[key], (locale, text) => {
    update(record, key, { ...(record[key] ?? bilingual()), [locale]: text });
  }, multiline);
}

function assetCard(path, details, onRemove) {
  const image = el("img");
  image.alt = details?.alt?.en || "";
  const card = el("div", { className: "image-card" }, image, el("code", { text: path }));
  Promise.resolve(current.uploads.get(path) ?? localImage(root, path)).then(blob => {
    if (!card.isConnected) return;
    if (blob) {
      image.src = URL.createObjectURL(blob);
      objectUrls.push(image.src);
    } else {
      image.hidden = true;
    }
  }).catch(() => { image.hidden = true; });
  if (details) {
    card.append(pairField("Alt text", details, "alt"), pairField("Caption (optional)", details, "caption"));
  } else {
    card.append(button("Copy image path", async () => {
      try {
        await navigator.clipboard.writeText(path);
        status(dirty ? "Image path copied. Save the pending upload before using it." : "Image path copied.");
      } catch { status("Select and copy the path shown on the card.", true); }
    }));
  }
  if (onRemove) card.append(button("Remove from project", onRemove));
  return card;
}

function uploadField(onUpload, multiple = true) {
  const field = el("input");
  field.type = "file";
  field.accept = "image/png,image/jpeg,image/webp,image/avif";
  field.multiple = multiple;
  field.addEventListener("change", () => {
    const files = Array.from(field.files);
    if (files.length) run(() => onUpload(files));
    field.value = "";
  });
  return el("label", {}, el("span", { text: multiple ? "Choose images" : "Choose image" }), field);
}

async function prepareUploads(files, slug) {
  return Promise.all(files.map(async file => [assetName(file.name, slug), await optimizeImage(file)]));
}

function images(record) {
  const groups = { thumbnail: "Thumbnail", gallery: "Gallery", architecture: "Architecture images" };
  const blocks = [];
  for (const [key, label] of Object.entries(groups)) {
    const items = key === "thumbnail" ? (record.thumbnail ? [record.thumbnail] : []) : record[key] ?? [];
    function remove(index) {
      if (key === "thumbnail") delete record.thumbnail;
      else record[key].splice(index, 1);
      edited();
      render();
    }
    blocks.push(fieldset(label,
      uploadField(async files => {
        const uploads = await prepareUploads(files, record.slug);
        const added = uploads.map(([src, blob]) => {
          current.uploads.set(src, blob);
          return { src, alt: bilingual() };
        });
        if (key === "thumbnail") record.thumbnail = added[0];
        else record[key] = [...items, ...added];
        edited();
        render();
      }, key !== "thumbnail"),
      el("div", { className: "images" }, ...items.map((asset, index) => assetCard(asset.src, asset, () => remove(index))))
    ));
  }
  return fieldset("Project media", el("p", { className: "hint", text: "Imported images are resized and saved as WebP. Add meaningful alt text in both languages." }), ...blocks);
}

function markdownFields() {
  return fieldset("Page content", el("div", { className: "grid" }, ...Object.entries(languages).map(([locale, title]) =>
    input(`${title} Markdown`, current.bodies[locale].value, value => {
      current.bodies[locale].value = value;
      edited();
    }, { multiline: true, className: "markdown" })
  )));
}

function advanced(record) {
  let raw = json(record);
  const details = el("details", { className: "panel" }, el("summary", { text: "Advanced fields (JSON)" }),
    el("p", { className: "details-note", text: "Use this for optional fields and exact values. Apply the JSON to the form before saving." }),
    input("Record JSON", raw, value => { raw = value; }, { multiline: true, className: "json" }),
    button("Apply JSON to form", () => {
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Enter a JSON object.");
        if (special() && parsed.slug !== record.slug) throw new Error("Use the slug field to set a new record's slug.");
        if (!current.isNew && record.id && parsed.id !== record.id) throw new Error("Keep the existing record ID.");
        if (current.index < 0) current.data = parsed;
        else current.data[current.index] = parsed;
        edited();
        render();
      } catch (error) { status(error.message, true); }
    }));
  return details;
}

function specialForm(record) {
  const project = current.section === "projects";
  const parts = [
    input("Slug", record.slug, value => update(record, "slug", value.trim()), { disabled: !current.isNew }),
    pairField("Title", record, "title"),
    pairField("Summary", record, "summary", true)
  ];
  const list = key => input(fieldName(key), (record[key] ?? []).join(", "), value => update(record, key, value.split(",").map(part => part.trim()).filter(Boolean)));
  if (project) {
    parts.push(
      fieldset("Project details", el("div", { className: "grid" },
        select("Category", categories, record.category, value => update(record, "category", value)),
        select("Status", statuses, record.status ?? "", value => update(record, "status", value)),
        input("Start (YYYY or YYYY-MM)", record.startDate, value => update(record, "startDate", value)),
        input("End (YYYY or YYYY-MM)", record.endDate, value => update(record, "endDate", value)),
        list("technologies"), list("relatedProjects")
      ), el("div", { className: "actions" }, ...["draft", "featured", "archive"].map(key =>
        input(fieldName(key), record[key], value => update(record, key, value), { type: "checkbox" })
      ))),
      pairField("Role (optional)", record, "role"), pairField("Organization (optional)", record, "organization"),
      fieldset("Links", el("div", { className: "grid" }, ...["githubUrl", "demoUrl", "publicationUrl", "youtubeId"].map(key =>
        input(fieldName(key), record[key], value => update(record, key, value.trim()))
      ))),
      images(record)
    );
  } else {
    parts.push(fieldset("Article details", el("div", { className: "grid" }, list("tags"),
      input("Related project slug", record.project, value => update(record, "project", value.trim()))
    )));
  }
  parts.push(markdownFields(), advanced(record));
  return parts;
}

function genericField(name, value, change) {
  if (Array.isArray(value)) {
    const items = value.map((item, index) => fieldset(`${display(item) || name} ${index + 1}`,
      genericField(typeof item === "object" ? "Details" : "Value", item, next => { value[index] = next; edited(); }),
      button("Remove item", () => { value.splice(index, 1); edited(); render(); })
    ));
    return fieldset(name, ...items, button("Add item", () => { value.push(reset(value[0])); edited(); render(); }));
  }
  if (value && typeof value === "object") {
    if (Object.keys(value).sort().join(",") === "en,ja") return translated(name, value, (locale, text) => update(value, locale, text));
    return fieldset(name, el("div", { className: "editor" }, ...Object.entries(value).map(([key, part]) =>
      genericField(fieldName(key), part, next => update(value, key, next))
    )));
  }
  return input(name, value, change, { type: typeof value === "boolean" ? "checkbox" : typeof value === "number" ? "number" : "text", multiline: textValue(value).length > 85 });
}

function newRecord() {
  if (!canLeave()) return;
  run(async () => {
    const { section } = current;
    await loadSection(section);
    const record = special() ? {
      slug: "", title: bilingual(), summary: bilingual(),
      ...(section === "projects" ? { category: "research", technologies: [], draft: true } : { tags: [] })
    } : reset(current.data[0]);
    if (record === "") throw new Error("Use the first existing record as a template or add the initial record in the repository.");
    current.data.push(record);
    current.index = current.data.length - 1;
    current.isNew = true;
    current.bodies = emptyBodies();
    edited();
    render();
  });
}

function render() {
  for (const url of objectUrls) URL.revokeObjectURL(url);
  objectUrls = [];
  sectionNavigation();
  document.querySelector("#sidebar").hidden = false;
  const { section, data, index } = current;
  workspace.replaceChildren(el("div", { className: "section-header" }, el("h1", { text: sections.get(section) })));
  if (section === "media") {
    workspace.append(el("p", { className: "hint", text: "Copy a local path for use in a profile field or Markdown image. Save uploads before using the paths." }),
      uploadField(async files => {
        for (const [path, blob] of await prepareUploads(files, "media")) current.uploads.set(path, blob);
        edited();
        render();
      }),
      el("div", { className: "images" }, ...[...current.uploads.keys(), ...current.library].map(path => assetCard(path)))
    );
    return;
  }

  const array = Array.isArray(data);
  const entry = array ? data[index] : data;
  if (array) {
    const options = Object.fromEntries(data.map((record, position) => [position, display(record) || (position === index && current.isNew ? "New record" : `Record ${position + 1}`)]));
    workspace.append(el("div", { className: "toolbar" },
      select("Choose record", options, String(index), value => {
        const { section, index } = current;
        if (canLeave()) run(async () => {
          await loadSection(section, Number(value));
          status();
        });
        else workspace.querySelector("select").value = String(index);
      }),
      button(section === "projects" ? "Add project" : section === "articles" ? "Add article" : "Add record", newRecord)));
  }
  if (!entry) return;
  const form = special() ? specialForm(entry) : [
    el("div", { className: "editor" }, ...Object.entries(entry).map(([key, value]) => genericField(fieldName(key), value, next => update(entry, key, next)))),
    advanced(entry)
  ];
  workspace.append(el("div", { className: "editor" }, ...form));
}

function requiredTranslations(value, field) {
  for (const [locale, name] of Object.entries(languages)) {
    if (!textValue(value?.[locale]).trim()) throw new Error(`${field} needs an ${name} value.`);
  }
}

async function saveRecord() {
  const { section, data, index, path, before, uploads, bodies } = current;
  const changes = [];
  const record = index < 0 ? data : data[index];
  if (special()) {
    if (!slugPattern.test(record.slug)) throw new Error("Use a slug with lowercase words separated by hyphens.");
    if (data.some((item, position) => position !== index && item.slug === record.slug)) throw new Error("This slug is already in use.");
    const published = section === "articles" || !record.draft;
    const bodiesRequired = published && (section === "articles" || record.featured || Object.values(bodies).some(body => body.before !== null || body.value.trim()));
    if (published) {
      requiredTranslations(record.title, "Title");
      requiredTranslations(record.summary, "Summary");
    }
    if (section === "projects") {
      record.id = record.slug;
      if (record.featured && (record.draft || record.archive)) throw new Error("Choose featured only for a published project outside the archive.");
      if (!Object.hasOwn(categories, record.category)) throw new Error("Choose a valid category.");
      if (record.status && !Object.hasOwn(statuses, record.status)) throw new Error("Choose a valid status.");
      for (const field of ["startDate", "endDate"]) {
        if (record[field] && !/^\d{4}(?:-(?:0[1-9]|1[0-2]))?$/.test(record[field])) throw new Error(`Enter a valid ${fieldName(field).toLowerCase()}.`);
      }
      for (const field of ["githubUrl", "demoUrl", "publicationUrl"]) {
        if (!record[field]) continue;
        const url = URL.parse(record[field]);
        if (url?.protocol !== "https:" || url.username || url.password) throw new Error(`${fieldName(field)} requires an HTTPS URL.`);
      }
      if (record.youtubeId && (!/^[\w-]{11}$/.test(record.youtubeId) || !record.demoUrl)) throw new Error("A YouTube embed needs a video ID and demonstration link.");
      for (const field of ["role", "organization"]) {
        if (record[field] && Object.values(record[field]).every(value => !textValue(value).trim())) delete record[field];
        if (published && record[field]) requiredTranslations(record[field], fieldName(field));
      }
      const media = [record.thumbnail, ...(record.gallery ?? []), ...(record.architecture ?? [])].filter(Boolean);
      for (const asset of media) {
        if (published) requiredTranslations(asset.alt, "Image alt text");
        if (asset.caption && Object.values(asset.caption).every(value => !textValue(value).trim())) delete asset.caption;
        if (published && asset.caption) requiredTranslations(asset.caption, "Image caption");
        if (!uploads.has(asset.src) && !await localImage(root, asset.src)) throw new Error(`Image file is missing: ${asset.src}`);
      }
      const referenced = new Set(media.map(asset => asset.src));
      for (const [asset, blob] of uploads) if (referenced.has(asset)) changes.push({ path: "public" + asset, before: null, value: blob });
    }
    for (const [locale, body] of Object.entries(bodies)) {
      if (bodiesRequired && !body.value.trim()) throw new Error(`Enter the ${languages[locale]} Markdown.`);
      if (body.value !== (body.before ?? "")) {
        changes.push({ path: body.path ?? `content/${locale}/${kind()}/${record.slug}.md`, before: body.before, value: body.value, locale });
      }
    }
  }
  if (section === "media") {
    for (const [asset, blob] of uploads) changes.push({ path: "public" + asset, before: null, value: blob });
  }
  const savedData = section === "experience"
    ? [...data].sort((a, b) => textValue(b.start).localeCompare(textValue(a.start)))
    : data;
  if (path) changes.push({ path, before, value: json(savedData) });
  try {
    await saveChanges(root, changes);
  } catch (error) {
    for (const change of changes.filter(item => item.saved)) {
      if (change.locale) {
        bodies[change.locale].path = change.path;
        bodies[change.locale].before = change.value;
      } else if (change.path.startsWith("public/")) {
        uploads.delete(change.path.slice("public".length));
      }
    }
    throw error;
  }
  await loadSection(section, Array.isArray(savedData) ? savedData.indexOf(record) : index);
  status("Saved to your portfolio checkout.");
}

connect.addEventListener("click", () => {
  if (!canLeave()) return;
  run(async () => {
    if (location.hostname !== "127.0.0.1" || !window.showDirectoryPicker) {
      throw new Error("Open this local address in desktop Chrome or Edge to use folder access.");
    }
    root = await openWorkspace(await window.showDirectoryPicker({ mode: "readwrite", id: "robotics-portfolio" }));
    await loadSection("projects");
    document.querySelector("#folder-status").textContent = root.name;
    connect.textContent = "Change folder";
    status();
  });
});
saveButton.addEventListener("click", () => run(saveRecord));
window.addEventListener("beforeunload", event => {
  if (dirty) event.preventDefault();
});
