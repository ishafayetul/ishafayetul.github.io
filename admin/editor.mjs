import { assetName, localImage, openWorkspace, optimizeImage, readText, saveChanges, slugPattern } from "./storage.mjs";

import { markdownSections, moveItem } from "./reorder.mjs";

const jsonFile = name => `content/data/${name}.json`;
const sections = new Map([
  ["layout", "Page layout"], ["projects", "Projects"], ["articles", "Technical notes"], ["profile", "Profile"],
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
const previewButton = document.querySelector("#preview");
const pushButton = document.querySelector("#push");
const versionsButton = document.querySelector("#versions");
const dialog = document.querySelector("#review");
const pendingVersions = new Set();

let root;
let token;
let layoutDefaults;
let layoutGroup = "home";
let current;
let dirty = false;
let busy = false;
let objectUrls = [];
const bilingual = () => ({ en: "", ja: "" });
const emptyBodies = () => ({ en: { before: null, value: "" }, ja: { before: null, value: "" } });
const kind = () => current.section === "projects" ? "projects" : "blog";
const special = () => ["projects", "articles"].includes(current.section);
const sectionFile = section => section.startsWith("interface-") ? `messages/${section.slice(-2)}.json` : jsonFile(section === "layout" ? "section-order" : section);
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
  saveButton.disabled = (!dirty && !pendingVersions.size) || busy;
  for (const button of [previewButton, pushButton, versionsButton]) {
    button.hidden = !root;
    button.disabled = busy;
  }
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
  if (path && before === null && section !== "layout") throw new Error(`Missing ${path}.`);
  const data = before ? JSON.parse(before) : section === "layout" ? {} : null;
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

function ordering(items, label, onMove) {
  const list = el("ol", { className: "reorder" });
  let source = -1;
  function refresh() {
    list.replaceChildren(...items.map((item, index) => {
      const name = label(item, index);
      const grip = el("span", { className: "grip", text: `↕  ${name}` });
      grip.draggable = true;
      grip.addEventListener("dragstart", event => {
        source = index;
        event.dataTransfer.setData("text/plain", name);
        event.dataTransfer.effectAllowed = "move";
      });
      grip.addEventListener("dragend", () => { source = -1; });
      const up = button("Up", () => move(index, index - 1, 0));
      const down = button("Down", () => move(index, index + 1, 1));
      up.setAttribute("aria-label", `Move ${name} up`);
      down.setAttribute("aria-label", `Move ${name} down`);
      up.disabled = index === 0;
      down.disabled = index === items.length - 1;
      const row = el("li", {}, grip, up, down);
      row.addEventListener("dragover", event => { if (source !== -1) event.preventDefault(); });
      row.addEventListener("drop", event => {
        if (source === -1) return;
        event.preventDefault();
        move(source, index);
        source = -1;
      });
      return row;
    }));
  }
  function move(from, to, focus) {
    if (!moveItem(items, from, to)) return;
    refresh();
    onMove();
    if (focus !== undefined) {
      const buttons = list.children[to]?.querySelectorAll("button");
      (buttons?.[focus]?.disabled ? buttons?.[1 - focus] : buttons?.[focus])?.focus();
    }
  }
  refresh();
  return list;
}

function imageOrder(items, rendered) {
  if (items.length < 2) return null;
  return ordering(items, item => item.alt?.en || item.src.split("/").at(-1), () => {
    for (const item of items) rendered.append(rendered.querySelector(`[data-path="${CSS.escape(item.src)}"]`));
    edited();
  });
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
    const cards = el("div", { className: "images" }, ...items.map(asset => {
      const card = assetCard(asset.src, asset, () => remove(items.indexOf(asset)));
      card.dataset.path = asset.src;
      return card;
    }));
    const order = key === "thumbnail" ? null : imageOrder(items, cards);
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
      ...(order ? [order] : []), cards
    ));
  }
  return fieldset("Project media", el("p", { className: "hint", text: "Imported images are resized and saved as WebP. Add meaningful alt text in both languages." }), ...blocks);
}

function markdownFields() {
  const fields = Object.entries(languages).map(([locale, title]) => {
    const body = current.bodies[locale];
    const order = el("div");
    const label = input(`${title} Markdown`, body.value, value => {
      body.value = value;
      showOrder();
      edited();
    }, { multiline: true, className: "markdown" });
    function showOrder() {
      const { prefix, blocks } = markdownSections(body.value);
      order.replaceChildren();
      if (blocks.length < 2) return;
      order.append(ordering(blocks, block => block.title, () => {
        body.value = prefix + blocks.map(block => block.text.trimEnd()).join("\n\n") + "\n";
        label.querySelector("textarea").value = body.value;
        edited();
      }));
    }
    showOrder();
    return el("div", {}, label, order);
  });
  return fieldset("Page content", el("div", { className: "grid" }, ...fields));
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
    const entries = value.map((item, index) => ({ item, index }));
    const items = el("div", { className: "editor" }, ...entries.map(entry => {
      const card = fieldset(`${display(entry.item) || name} ${entry.index + 1}`,
        genericField(typeof entry.item === "object" ? "Details" : "Value", entry.item, next => {
          entry.item = next;
          value[entries.indexOf(entry)] = next;
          edited();
        }),
        button("Remove item", () => { value.splice(entries.indexOf(entry), 1); edited(); render(); }));
      entry.card = card;
      return card;
    }));
    const order = entries.length > 1 ? [ordering(entries, entry => display(entry.item) || String(entry.item) || name, () => {
      value.splice(0, value.length, ...entries.map(entry => entry.item));
      for (const entry of entries) items.append(entry.card);
      edited();
    })] : [];
    return fieldset(name, ...order, items, button("Add item", () => { value.push(reset(value[0])); edited(); render(); }));
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
  if (section === "layout") {
    const { sections: labels } = layoutDefaults[layoutGroup];
    const ids = [...new Set([...(data[layoutGroup] ?? []), ...Object.keys(labels)])].filter(id => Object.hasOwn(labels, id));
    workspace.append(
      el("p", { className: "hint", text: "Drag a section or use Up and Down. The order applies to English and Japanese pages." }),
      select("Page or section group", Object.fromEntries(Object.entries(layoutDefaults).map(([id, group]) => [id, group.label])), layoutGroup, id => {
        layoutGroup = id;
        render();
      }),
      ordering(ids, id => labels[id], () => {
        data[layoutGroup] = ids;
        edited();
      })
    );
    return;
  }
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
    const name = (record, position) => display(record) || (record === entry && current.isNew ? "New record" : `Record ${position + 1}`);
    const recordSelect = select("Choose record", Object.fromEntries(data.map((record, position) => [position, name(record, position)])), String(index), value => {
        const { section, index } = current;
        if (canLeave()) run(async () => {
          await loadSection(section, Number(value));
          status();
        });
        else workspace.querySelector("select").value = String(index);
      });
    workspace.append(el("div", { className: "toolbar" }, recordSelect,
      button(section === "projects" ? "Add project" : section === "articles" ? "Add article" : "Add record", newRecord)));
    if (data.length > 1) {
      workspace.append(el("details", { className: "panel" }, el("summary", { text: "Reorder records" }), ordering(data, name, () => {
        current.index = data.indexOf(entry);
        const field = recordSelect.querySelector("select");
        for (const [position, option] of Array.from(field.options).entries()) option.textContent = name(data[position], position);
        field.value = String(current.index);
        edited();
      })));
    }
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
  if (path) changes.push({ path, before, value: json(data) });
  try {
    await saveChanges(root, changes);
  } catch (error) {
    for (const change of changes.filter(item => item.saved)) {
      pendingVersions.add(change.path);
      if (change.locale) {
        bodies[change.locale].path = change.path;
        bodies[change.locale].before = change.value;
      } else if (change.path.startsWith("public/")) {
        uploads.delete(change.path.slice("public".length));
      }
    }
    throw error;
  }
  for (const change of changes) pendingVersions.add(change.path);
  await loadSection(section, index);
  await saveVersion();
}

connect.addEventListener("click", () => {
  if (!canLeave()) return;
  run(async () => {
    if (location.hostname !== "127.0.0.1" || !window.showDirectoryPicker) {
      throw new Error("Open this local address in desktop Chrome or Edge to use folder access.");
    }
    const selected = await openWorkspace(await window.showDirectoryPicker({ mode: "readwrite", id: "robotics-portfolio" }));
    const marker = await readText(selected, ".portfolio-admin-session");
    if (!marker) throw new Error("Select the portfolio checkout where npm run admin is running.");
    await api("state", {}, marker);
    layoutDefaults = await fetch("/section-layout.json").then(response => response.json());
    root = selected;
    token = marker;
    await loadSection("projects");
    document.querySelector("#folder-status").textContent = root.name;
    connect.textContent = "Change folder";
    status();
  });
});
async function api(action, body = {}, key = token) {
  const response = await fetch(`/api/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Portfolio-Workspace": key },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data;
}

async function saveVersion() {
  try {
    const result = await api("save", { paths: [...pendingVersions] });
    pendingVersions.clear();
    status(result.version ? "Saved as a local Git version." : "Saved to your portfolio checkout.");
  } catch (error) {
    throw new Error(`Files saved locally. Git version pending. ${error.message}`);
  }
}

async function savePending() {
  if (dirty) await saveRecord();
  else if (pendingVersions.size) await saveVersion();
}

function showReview(title, ...body) {
  const heading = el("h2", { text: title });
  heading.id = "review-title";
  dialog.replaceChildren(el("div", { className: "toolbar" }, heading, button("Close", () => dialog.close())), ...body);
  if (!dialog.open) dialog.showModal();
}

function link(text, href) {
  const anchor = el("a", { text });
  anchor.href = href;
  anchor.target = "_blank";
  anchor.rel = "noopener";
  return anchor;
}

saveButton.addEventListener("click", () => run(savePending));

previewButton.addEventListener("click", () => {
  const tab = window.open("about:blank", "_blank");
  if (tab) tab.opener = null;
  run(async () => {
    try {
      await savePending();
      status("Building the local preview…");
      const { url } = await api("preview");
      if (tab) tab.location.href = url;
      status("Local preview is ready.");
      notice.append(" ", link("Open preview", url));
    } catch (error) {
      tab?.close();
      throw error;
    }
  });
});

versionsButton.addEventListener("click", () => run(async () => {
  const data = await api("state");
  const list = el("ol", {}, ...data.history.map(item => {
    const stamp = new Date(item.date).toLocaleString();
    const version = el("li", {}, el("strong", { text: item.message }), el("p", { className: "muted",
      text: `${item.id.slice(0, 7)} · ${stamp}${item.id === data.remoteHead ? " · On GitHub" : ""}` }));
    version.append(button("Restore this version", () => {
      showReview("Restore portfolio version", el("p", { text: `Restore content from ${item.id.slice(0, 7)}? Current edits are saved first. The restoration becomes a new local version you can preview or push.` }),
        button("Restore and save", () => {
          dialog.close();
          run(async () => {
            await savePending();
            const result = await api("restore", { id: item.id });
            await loadSection(current.section, current.index);
            status(result.version ? "Restored as a new local Git version." : "The portfolio already matches that version.");
          });
        }));
    }));
    return version;
  }));
  showReview("Portfolio versions", el("p", { text: "Saved versions stay available after you push." }), list);
}));

pushButton.addEventListener("click", () => run(async () => {
  await savePending();
  const data = await api("state");
  const label = el("p", { text: "Review the local versions and saved files below. Confirm to push main to ishafayetul/ishafayetul.github.io and start GitHub Pages." });
  const list = el("ul", {}, ...[...data.ahead, ...data.paths].map(value => el("li", { text: value })));
  const files = el("details", {}, el("summary", { text: "Files in this push" }),
    el("ul", {}, ...[...new Set([...data.outgoing, ...data.paths])].map(path => el("li", { text: path }))));
  const visibility = el("p", { className: "muted", text: "Files pushed to this public repository are visible on GitHub, including draft content." });
  showReview("Push & deploy", label, list, files, visibility, button("Confirm push & deploy", () => {
    dialog.close();
    run(async () => {
      status("Checking the portfolio before pushing…");
      const result = await api("push", { proof: data.proof });
      status(result.message);
      if (result.url) notice.append(" ", link("Track deployment", result.url));
    });
  }));
}));
window.addEventListener("beforeunload", event => {
  if (dirty) event.preventDefault();
});
