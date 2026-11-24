import { assetName, getFile, imagePath, localImage, openWorkspace, optimizeImage, prepareVideo, readText, saveChanges, slugPattern, videoPath } from "./storage.mjs";

import { markdownSections, moveItem } from "./reorder.mjs";

const jsonFile = name => `content/data/${name}.json`;
const sectionGroups = {
  Portfolio: [
    ["projects", "Projects", "Case studies, categories, technical details, images and video links."],
    ["articles", "Technical Blogs", "Bilingual articles, tags, Markdown, images and video."],
    ["achievements", "Achievements", "Competition results, awards, grants, images and video."],
    ["outreach", "Outreach", "Workshops and events shown on the Teaching page, with images and video."],
    ["teaching", "Teaching", "Courses and teaching organizations."],
    ["publications", "Publications", "Papers, authors, citations and related projects."]
  ],
  Career: [
    ["profile", "Profile", "Name, location, contact links, portrait, highlights and résumé path."],
    ["experience", "Experience", "Roles, employers, dates and related work."],
    ["education", "Education", "Degrees, institutions and dates."],
    ["skills", "Skills", "Technical skill groups and technologies."],
    ["certifications", "Language qualifications", "Language certificates and proficiency."],
    ["activities", "Activities", "Clubs, leadership and other activities."]
  ],
  "Site settings": [
    ["layout", "Page layout", "Reorder sections and groups across both languages."],
    ["interface-en", "English interface", "English navigation labels, buttons and page descriptions."],
    ["interface-ja", "Japanese interface", "Japanese navigation labels, buttons and page descriptions."],
    ["media", "Image library", "Upload reusable images and copy their local paths."]
  ]
};
const sections = new Map(Object.values(sectionGroups).flat().map(([id, title, description]) => [id, { title, description }]));
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
const sectionSearch = document.querySelector("#find-section");
const sectionToggle = document.querySelector("#toggle-sections");
const workspaceActions = document.querySelector("#workspace-actions");
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
const hasRecordMedia = section => ["outreach", "achievements", "articles"].includes(section);
const mediaKeys = ["image", "videoSrc"];
const sectionFile = section => section.startsWith("interface-") ? `messages/${section.slice(-2)}.json` : jsonFile(section === "layout" ? "section-order" : section);
const display = record => [record?.title?.en, record?.title?.ja, record?.title, record?.label?.en, record?.label?.ja,
  record?.name, record?.id, record?.slug].find(value => typeof value === "string" && value.trim());
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
  workspaceActions.hidden = !root;
  saveButton.disabled = (!dirty && !pendingVersions.size && !current?.jsonDraft) || busy;
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
  return (!dirty && !current?.jsonDraft) || window.confirm("Discard unsaved changes in the editor?");
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
  const panel = current?.section === section ? current.panel : undefined;
  current = { section, path, before, data, panel, uploads: new Map(), library: [] };
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
  await selectRecord(Array.isArray(data) && data.length ? Math.max(0, Math.min(index, data.length - 1)) : -1);
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
  const matches = document.querySelector("#section-matches");
  const query = sectionSearch.value.trim().toLocaleLowerCase();
  let count = 0;
  nav.replaceChildren();
  for (const [group, entries] of Object.entries(sectionGroups)) {
    const items = [];
    for (const [id, title, description] of entries) {
      if (!`${group} ${title} ${description}`.toLocaleLowerCase().includes(query)) continue;
      const item = button(title, async () => {
        if (current.section !== id) {
          if (!canLeave()) return;
          await run(async () => {
            await loadSection(id);
            status();
          });
          if (current.section !== id) return;
        }
        sectionSearch.value = "";
        sectionToggle.setAttribute("aria-expanded", "false");
        sectionNavigation();
        workspace.querySelector("h1").focus();
      });
      if (current.section === id) item.setAttribute("aria-current", "page");
      items.push(item);
    }
    if (items.length) nav.append(el("div", { className: "nav-group" }, el("h2", { text: group }), ...items));
    count += items.length;
  }
  matches.hidden = !query;
  matches.textContent = count ? `${count} ${count === 1 ? "setting" : "settings"} found` : "No matching settings";
}

sectionSearch.addEventListener("input", sectionNavigation);
sectionSearch.addEventListener("keydown", event => {
  if (event.key === "Enter") document.querySelector("#sections button")?.click();
});
sectionToggle.addEventListener("click", () => {
  const open = sectionToggle.getAttribute("aria-expanded") === "true";
  sectionToggle.setAttribute("aria-expanded", String(!open));
  if (!open) sectionSearch.focus();
});

function update(record, key, value) {
  record[key] = value;
  edited();
}

function translated(label, value, change, multiline = false) {
  const group = fieldset(label, el("div", { className: "grid" }, ...Object.entries(languages).map(([locale, name]) => {
    const field = input(`${label} · ${name}`, value?.[locale], text => change(locale, text), { multiline });
    field.querySelector("input, textarea").setAttribute("aria-label", `${label} · ${name}`);
    field.querySelector("span").textContent = name;
    return field;
  })));
  group.className = "translation";
  return group;
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
  if (onRemove) card.append(button("Remove image", onRemove));
  return card;
}

function uploadField(onUpload, { multiple = true, video = false } = {}) {
  const field = el("input");
  field.type = "file";
  field.accept = video ? "video/mp4,video/webm" : "image/png,image/jpeg,image/webp,image/avif";
  field.multiple = multiple;
  field.addEventListener("change", () => {
    const files = Array.from(field.files);
    if (files.length) run(() => onUpload(files));
    field.value = "";
  });
  return el("label", {}, el("span", { text: video ? "Choose video" : multiple ? "Choose images" : "Choose image" }), field);
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
    const block = disclosure(`${label} (${items.length})`,
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
      }, { multiple: key !== "thumbnail" }),
      ...(order ? [order] : []), cards
    );
    block.open = current.mediaGroups?.[key] ?? key === "thumbnail";
    block.addEventListener("toggle", () => {
      if (block.isConnected) (current.mediaGroups ??= {})[key] = block.open;
    });
    blocks.push(block);
  }
  return el("div", { className: "panel editor" }, el("p", { className: "hint", text: "Imported images are resized and saved as WebP. Add meaningful alt text in both languages." }), ...blocks);
}

function recordMedia(record) {
  function remove(key) {
    delete record[key];
    edited();
    render();
  }
  const image = el("div", { className: "editor" }, uploadField(async files => {
    const [[src, blob]] = await prepareUploads(files, current.section);
    current.uploads.delete(record.image?.src);
    current.uploads.set(src, blob);
    update(record, "image", { src, alt: bilingual() });
    render();
  }, { multiple: false }));
  if (record.image) image.append(assetCard(record.image.src, record.image, () => {
    current.uploads.delete(record.image.src);
    remove("image");
  }));

  const video = el("div", { className: "editor" }, uploadField(async ([file]) => {
    const path = await prepareVideo(file);
    current.uploads.delete(record.videoSrc);
    current.uploads.set(path, file);
    update(record, "videoSrc", path);
    render();
  }, { multiple: false, video: true }));
  if (record.videoSrc) video.append(el("div", { className: "image-card" },
    el("code", { text: current.uploads.get(record.videoSrc)?.name ?? record.videoSrc }),
    button("Remove video", () => {
      current.uploads.delete(record.videoSrc);
      remove("videoSrc");
    })
  ));

  return fieldset("Media",
    el("p", { className: "hint", text: "Add a publication-approved image or MP4/WebM video up to 20 MB. Use a video with captions when it contains speech." }),
    el("div", { className: "grid" }, image, video)
  );
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
      order.append(disclosure("Reorder headings", ordering(blocks, block => block.title, () => {
        body.value = prefix + blocks.map(block => block.text.trimEnd()).join("\n\n") + "\n";
        label.querySelector("textarea").value = body.value;
        edited();
      })));
    }
    showOrder();
    return el("div", { className: "editor" }, label, order);
  });
  return el("div", { className: "panel markdown-grid" }, ...fields);
}

function advanced(record) {
  const before = json(record);
  const draft = current.jsonDraft ?? { before, value: before };
  return el("div", { className: "panel editor" },
    el("p", { className: "hint", text: "Edit optional fields or exact values. Apply the JSON to the form before saving." }),
    input("Record JSON", draft.value, value => {
      draft.value = value;
      current.jsonDraft = value === draft.before ? undefined : draft;
      sync();
    }, { multiline: true, className: "json" }),
    el("div", { className: "actions" }, button("Apply JSON to form", () => {
      try {
        if (before !== draft.before) throw new Error("The form changed after you started editing JSON. Copy your draft, then reload JSON from the form before applying it.");
        const parsed = JSON.parse(draft.value);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Enter a JSON object.");
        if (special() && parsed.slug !== record.slug) throw new Error("Use the slug field to set a new record's slug.");
        if (!current.isNew && record.id && parsed.id !== record.id) throw new Error("Keep the existing record ID.");
        if (current.index < 0) current.data = parsed;
        else current.data[current.index] = parsed;
        current.jsonDraft = undefined;
        edited();
        render();
        status("JSON applied. Save changes to write it to the checkout.");
      } catch (error) { status(error.message, true); }
    }), button("Reload JSON from form", () => {
      if (current.jsonDraft && !window.confirm("Discard changes to the JSON draft?")) return;
      current.jsonDraft = undefined;
      render();
      status(dirty ? "Unsaved changes" : "");
    }))
  );
}

function specialForm(record) {
  const project = current.section === "projects";
  const list = (key, label = fieldName(key)) => input(label, (record[key] ?? []).join(", "), value => update(record, key, value.split(",").map(part => part.trim()).filter(Boolean)));
  return {
    Overview: () => el("div", { className: "panel editor" },
      pairField("Title", record, "title"),
      pairField("Summary", record, "summary", true),
      input("URL slug", record.slug, value => update(record, "slug", value.trim()), { disabled: !current.isNew }),
      ...(project ? [fieldset("Visibility", el("div", { className: "actions" }, ...["draft", "featured", "archive"].map(key =>
        input(fieldName(key), record[key], value => update(record, key, value), { type: "checkbox" })
      )))] : [el("div", { className: "grid" }, list("tags", "Tags (comma-separated)"),
        input("Related project slug", record.project, value => update(record, "project", value.trim())))])),
    ...(project ? {
      "Project details": () => el("div", { className: "panel editor" }, el("div", { className: "grid" },
        select("Category", categories, record.category, value => update(record, "category", value)),
        select("Status", statuses, record.status ?? "", value => update(record, "status", value)),
        input("Start (YYYY or YYYY-MM)", record.startDate, value => update(record, "startDate", value)),
        input("End (YYYY or YYYY-MM)", record.endDate, value => update(record, "endDate", value)),
        list("technologies", "Technologies (comma-separated)"), list("relatedProjects", "Related project slugs (comma-separated)"),
        list("hardware", "Hardware (comma-separated)"), list("software", "Software (comma-separated)")
      ), disclosure("Additional categories", el("div", { className: "grid" }, ...Object.entries(categories).map(([key, name]) =>
        input(name, record.categories?.includes(key), checked => {
          const selected = new Set(record.categories ?? []);
          if (checked) selected.add(key);
          else selected.delete(key);
          update(record, "categories", [...selected]);
        }, { type: "checkbox" })
      ))), pairField("Role (optional)", record, "role"), pairField("Organization (optional)", record, "organization"),
      genericField("Evaluation metrics", record.metrics ?? [], value => update(record, "metrics", value), { label: bilingual(), value: "", conditions: bilingual() })),
      Links: () => el("div", { className: "panel grid" }, ...Object.entries({ githubUrl: "GitHub URL", demoUrl: "Demonstration URL", publicationUrl: "Publication URL", youtubeId: "YouTube video ID" }).map(([key, label]) =>
        input(label, record[key], value => update(record, key, value.trim()))
      ))
    } : {}),
    Media: () => project ? images(record) : recordMedia(record),
    "Page content": markdownFields,
    Advanced: () => advanced(record)
  };
}

function disclosure(label, ...children) {
  return el("details", { className: "disclosure" }, el("summary", { text: label }), el("div", { className: "editor" }, ...children));
}

function genericField(name, value, change, template) {
  if (Array.isArray(value)) {
    function rebuild(adding = false) {
      const next = genericField(name, value, change, template);
      group.replaceWith(next);
      next.open = true;
      const entry = adding ? next.querySelector(".array-items").lastElementChild : null;
      if (entry?.tagName === "DETAILS") entry.open = true;
      (entry?.querySelector("input, textarea, select") || next.querySelector(".add-item")).focus();
    }
    const entries = value.map((item, index) => ({ item, index }));
    const items = el("div", { className: "editor array-items" }, ...entries.map(entry => {
      const label = display(entry.item) || `Item ${entry.index + 1}`;
      const save = next => {
        entry.item = next;
        value[entries.indexOf(entry)] = next;
        change(value);
      };
      const remove = button("Remove", () => { value.splice(entries.indexOf(entry), 1); change(value); rebuild(); });
      remove.setAttribute("aria-label", `Remove ${label}`);
      const card = entry.item && typeof entry.item === "object"
        ? disclosure(label, ...Object.entries(entry.item).map(([key, part]) => genericField(fieldName(key), part, next => {
          entry.item[key] = next;
          change(value);
        })), remove)
        : el("div", { className: "array-row" }, genericField(label, entry.item, save), remove);
      entry.card = card;
      return card;
    }));
    const order = entries.length > 1 ? [disclosure("Reorder items", ordering(entries, entry => display(entry.item) || String(entry.item) || `Item ${entry.index + 1}`, () => {
      value.splice(0, value.length, ...entries.map(entry => entry.item));
      for (const entry of entries) items.append(entry.card);
      change(value);
    }))] : [];
    const add = button("Add item", () => {
      value.push(reset(value[0] ?? template));
      change(value);
      rebuild(true);
    });
    add.className = "add-item";
    const group = disclosure(`${name} (${entries.length})`, ...order, items, add);
    return group;
  }
  if (value && typeof value === "object") {
    if (Object.keys(value).sort().join(",") === "en,ja") return translated(name, value, (locale, text) => update(value, locale, text));
    return fieldset(name, el("div", { className: "editor" }, ...Object.entries(value).map(([key, part]) =>
      genericField(fieldName(key), part, next => update(value, key, next))
    )));
  }
  return input(name, value, change, { type: typeof value === "boolean" ? "checkbox" : typeof value === "number" ? "number" : "text", multiline: textValue(value).length > 85 });
}

async function newRecord() {
  if (!canLeave()) return;
  await run(async () => {
    const { section } = current;
    await loadSection(section);
    const record = special() ? {
      slug: "", title: bilingual(), summary: bilingual(),
      ...(section === "projects" ? { category: "research", technologies: [], draft: true } : { tags: [] })
    } : reset(current.data[0] ?? (await api("record-template", { section })).sample);
    if (hasRecordMedia(section)) for (const key of mediaKeys) delete record[key];
    current.data.push(record);
    current.index = current.data.length - 1;
    current.isNew = true;
    current.panel = undefined;
    current.bodies = emptyBodies();
    edited();
    render();
  });
  if (current.isNew) workspace.querySelector('[aria-pressed="true"]')?.focus();
}

async function fingerprint(value) {
  if (value === null) return null;
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
}

function confirmDelete(label) {
  if (dirty || pendingVersions.size || current.jsonDraft) {
    status("Save your pending changes before deleting a record.", true);
    return;
  }
  const { section, index, before, bodies } = current;
  const details = section === "projects"
    ? "Its English and Japanese pages and links from other records will also be removed. Image files will stay in the library."
    : section === "articles" ? "Its English and Japanese pages will also be removed." : "";
  const remove = button("Delete and save version", () => {
    dialog.close();
    run(async () => {
      const revisions = Object.fromEntries(await Promise.all(
        Object.entries(bodies).map(async ([locale, body]) => [locale, await fingerprint(body.before)])
      ));
      const result = await api("delete-record", { section, index, revision: await fingerprint(before), bodies: revisions });
      await loadSection(section, result.index);
      status("Record deleted locally. You can undo it in Version history.");
    });
  });
  remove.classList.add("danger");
  showReview("Delete record", el("p", { text: `Delete “${label}” from ${sections.get(section).title}?` }),
    ...(details ? [el("p", { text: details })] : []),
    el("p", { text: "The deletion is saved as a local Git version and can be undone in Version history." }), remove);
}

function releaseImages() {
  for (const url of objectUrls) URL.revokeObjectURL(url);
  objectUrls = [];
}

function editorPanels(panels) {
  const names = Object.keys(panels);
  const controls = el("div", { className: "editor-tabs" });
  controls.setAttribute("role", "group");
  controls.setAttribute("aria-label", "Editing panels");
  const panel = el("div", { className: "editor-content" });
  panel.id = "editor-content";
  const buttons = names.map(name => {
    const tab = button(name, () => {
      if (current.panel !== name) show(name);
    });
    tab.setAttribute("aria-controls", panel.id);
    controls.append(tab);
    return tab;
  });
  function show(name) {
    releaseImages();
    current.panel = name;
    for (const tab of buttons) tab.setAttribute("aria-pressed", String(tab.textContent === name));
    panel.replaceChildren(panels[name]());
  }
  show(Object.hasOwn(panels, current.panel) ? current.panel : names[0]);
  return el("div", { className: "editor-shell" }, controls, panel);
}

function recordFields(record, section) {
  const fields = Object.entries(record).filter(([key]) => !hasRecordMedia(section) || !mediaKeys.includes(key));
  const form = el("div", { className: "grid record-fields" }, ...fields.map(([key, value]) => genericField(fieldName(key), value, next => update(record, key, next))));
  if (!section.startsWith("interface-")) return el("div", { className: "panel editor" }, form);

  const statusLine = el("p", { className: "hint", text: "No matching labels or text." });
  statusLine.setAttribute("role", "status");
  statusLine.hidden = true;
  const search = input("Find interface text", "", value => {
    const query = value.trim().toLocaleLowerCase();
    for (const [index, [key]] of fields.entries()) {
      const text = `${form.children[index].textContent} ${JSON.stringify(record[key])}`;
      form.children[index].hidden = !text.toLocaleLowerCase().includes(query);
    }
    statusLine.hidden = Array.from(form.children).some(field => !field.hidden);
  }, { type: "search" });
  search.querySelector("input").placeholder = "Search labels or current text";
  return el("div", { className: "panel editor" }, search, statusLine, form);
}

function render() {
  releaseImages();
  sectionNavigation();
  document.querySelector("#sidebar").hidden = false;
  const { section, data, index } = current;
  const { title, description } = sections.get(section);
  const heading = el("h1", { text: title });
  heading.tabIndex = -1;
  workspace.replaceChildren(el("div", { className: "section-header" }, heading, el("p", { className: "hint", text: description })));
  if (section === "layout") {
    const { sections: labels } = layoutDefaults[layoutGroup];
    const ids = [...new Set([...(data[layoutGroup] ?? []), ...Object.keys(labels)])].filter(id => Object.hasOwn(labels, id));
    workspace.append(el("div", { className: "panel editor" },
      select("Page or section group", Object.fromEntries(Object.entries(layoutDefaults).map(([id, group]) => [id, group.label])), layoutGroup, id => {
        layoutGroup = id;
        render();
        workspace.querySelector("select").focus();
      }),
      el("p", { className: "hint", text: "Drag each section or use Up and Down." }),
      ordering(ids, id => labels[id], () => {
        data[layoutGroup] = ids;
        edited();
      })
    ));
    return;
  }
  if (section === "media") {
    const images = el("div", { className: "images" }, ...[...current.uploads.keys(), ...current.library].map(path => assetCard(path)));
    const noImages = el("p", { className: "hint", text: "No matching images." });
    noImages.setAttribute("role", "status");
    noImages.hidden = images.children.length > 0;
    const filter = input("Find an image", "", value => {
      const query = value.trim().toLocaleLowerCase();
      for (const card of images.children) card.hidden = !card.querySelector("code").textContent.toLocaleLowerCase().includes(query);
      noImages.hidden = Array.from(images.children).some(card => !card.hidden);
    }, { type: "search" });
    filter.querySelector("input").placeholder = "Search filenames or paths";
    workspace.append(el("div", { className: "panel editor" }, el("p", { className: "hint", text: "Save uploads before using their paths in a profile field or Markdown image." }),
      el("div", { className: "grid" }, filter, uploadField(async files => {
        for (const [path, blob] of await prepareUploads(files, "media")) current.uploads.set(path, blob);
        edited();
        render();
      })), noImages, images
    ));
    return;
  }

  const array = Array.isArray(data);
  const entry = array ? data[index] : data;
  if (array) {
    const name = (record, position) => display(record) || (record === entry && current.isNew ? "New record" : `Record ${position + 1}`);
    const recordSelect = select("Choose record", Object.fromEntries(data.map((record, position) => [position, name(record, position)])), String(index), async value => {
      const { section, index } = current;
      if (!canLeave()) {
        recordSelect.querySelector("select").value = String(index);
        return;
      }
      await run(async () => {
        await loadSection(section, Number(value));
        status();
      });
      workspace.querySelector(".record-tools select")?.focus();
    });
    const toolbar = el("div", { className: "toolbar" }, recordSelect,
      button(section === "projects" ? "Add project" : section === "articles" ? "Add article" : "Add record", newRecord));
    const recordTools = el("div", { className: "record-tools" }, toolbar);
    if (entry && !current.isNew) {
      const remove = button("Delete record…", () => confirmDelete(name(entry, current.index)));
      remove.classList.add("danger");
      toolbar.append(disclosure("Record actions", remove));
    }
    workspace.append(recordTools);
    if (data.length > 1) {
      recordTools.append(disclosure("Reorder records", ordering(data, name, () => {
        current.index = data.indexOf(entry);
        const field = recordSelect.querySelector("select");
        for (const [position, option] of Array.from(field.options).entries()) option.textContent = name(data[position], position);
        field.value = String(current.index);
        edited();
      })));
    }
  }
  if (!entry) {
    workspace.append(el("p", { className: "hint empty-state", text: "There are no records in this section. Add a record to get started." }));
    return;
  }
  const panels = special() ? specialForm(entry) : {
    [section.startsWith("interface-") ? "Labels and text" : "Details"]: () => recordFields(entry, section),
    ...(hasRecordMedia(section) ? { Media: () => recordMedia(entry) } : {}),
    Advanced: () => advanced(entry)
  };
  workspace.append(editorPanels(panels));
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
  if (hasRecordMedia(section) && record) {
    const { image, videoSrc } = record;
    if (image !== undefined) {
      if (typeof image?.src !== "string" || !imagePath.test(image.src)) throw new Error("Choose a local image file.");
      requiredTranslations(image.alt, "Image alt text");
      if (image.caption && Object.values(image.caption).every(value => !textValue(value).trim())) delete image.caption;
      if (image.caption) requiredTranslations(image.caption, "Image caption");
      if (!uploads.has(image.src) && !await localImage(root, image.src)) throw new Error(`Image file is missing: ${image.src}`);
    }
    if (videoSrc !== undefined && (typeof videoSrc !== "string" || !videoPath.test(videoSrc) ||
        (!uploads.has(videoSrc) && !await getFile(root, "public" + videoSrc)))) {
      throw new Error("Choose a local MP4 or WebM video file.");
    }
    for (const asset of [image?.src, videoSrc]) {
      if (uploads.has(asset)) changes.push({ path: "public" + asset, before: null, value: uploads.get(asset) });
    }
  }
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
      if (published) for (const metric of record.metrics ?? []) {
        requiredTranslations(metric.label, "Metric label");
        requiredTranslations(metric.conditions, "Metric conditions");
        if (!textValue(metric.value).trim()) throw new Error("Enter a value for every evaluation metric.");
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
    connect.classList.remove("primary");
    document.querySelector("#folder-action").append(connect);
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
  if (current?.jsonDraft) throw new Error("Apply or reload your draft in Advanced before saving.");
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
workspaceActions.addEventListener("click", event => {
  if (event.target.closest("button")) workspaceActions.open = false;
});

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
  const data = await api("deploy-review");
  const label = el("p", { text: "Review the changes for ishafayetul/ishafayetul.github.io on main. Confirmation runs the deploy checks and starts GitHub Pages." });
  const pending = data.paths.length ? [el("h3", { text: "Files to commit" }),
    el("ul", {}, ...data.paths.map(path => el("li", { text: path })))] : [];
  const commits = data.ahead.length ? [disclosure(`Local commits to push (${data.ahead.length})`,
    el("ul", {}, ...data.ahead.map(value => el("li", { text: value }))))] : [];
  const files = disclosure("All files in this push",
    el("ul", {}, ...[...new Set([...data.outgoing, ...data.paths])].map(path => el("li", { text: path }))));
  const visibility = el("p", { className: "muted", text: "Files pushed to this public repository are visible on GitHub, including draft content." });
  const confirm = data.paths.length ? "Confirm commit, push & deploy" : "Confirm push & deploy";
  showReview("Push & deploy", label, ...pending, ...commits, files, visibility, button(confirm, () => {
    dialog.close();
    run(async () => {
      status(data.paths.length ? "Committing reviewed files and checking the portfolio…" : "Checking the portfolio before pushing…");
      const result = await api("push", { proof: data.proof });
      status(result.message);
      if (result.url) notice.append(" ", link("Track deployment", result.url));
    });
  }));
}));
window.addEventListener("beforeunload", event => {
  if (dirty || current?.jsonDraft) event.preventDefault();
});
