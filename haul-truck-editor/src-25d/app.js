import "./styles.css";
import blueprint from "../data/vehicle-25d.json";
import referenceImageUrl from "../assets/reference/truck-original.png?url";

const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";
const STORAGE_KEY = "haul-truck-editor:25d:main:v1";
const MAX_HISTORY = 40;

const $ = (selector) => document.querySelector(selector);
const clone = (value) => JSON.parse(JSON.stringify(value));
const categoryMap = new Map(blueprint.categories.map((item) => [item.id, item]));
const initialParts = clone(blueprint.parts).map(normalizePart);

const dom = {
  svg: $("#editorSvg"),
  stageWrap: $("#stageWrap"),
  stageCanvas: $("#stageCanvas"),
  stageEmpty: $("#stageEmpty"),
  layerTree: $("#layerTree"),
  layerCount: $("#layerCount"),
  searchInput: $("#searchInput"),
  projectState: $("#projectState"),
  selectionStatus: $("#selectionStatus"),
  editHint: $("#editHint"),
  inspectorEmpty: $("#inspectorEmpty"),
  inspector: $("#inspector"),
  partNumber: $("#partNumber"),
  selectedCategory: $("#selectedCategory"),
  selectedName: $("#selectedName"),
  selectedId: $("#selectedId"),
  selectedIcon: $("#selectedIcon"),
  separationNote: $("#separationNote"),
  visibilityButton: $("#visibilityButton"),
  lockButton: $("#lockButton"),
  duplicateButton: $("#duplicateButton"),
  deleteButton: $("#deleteButton"),
  resetButton: $("#resetButton"),
  posX: $("#posX"),
  posY: $("#posY"),
  partWidth: $("#partWidth"),
  partHeight: $("#partHeight"),
  rotation: $("#rotation"),
  rotationOutput: $("#rotationOutput"),
  zOutput: $("#zOutput"),
  sendBackButton: $("#sendBackButton"),
  stepBackButton: $("#stepBackButton"),
  stepFrontButton: $("#stepFrontButton"),
  bringFrontButton: $("#bringFrontButton"),
  replaceButton: $("#replaceButton"),
  clearReplacementButton: $("#clearReplacementButton"),
  replaceInput: $("#replaceInput"),
  surfaceSelect: $("#surfaceSelect"),
  snapButton: $("#snapButton"),
  addButton: $("#addButton"),
  addPopover: $("#addPopover"),
  addonList: $("#addonList"),
  uploadAddonButton: $("#uploadAddonButton"),
  addonInput: $("#addonInput"),
  exportButton: $("#exportButton"),
  exportPopover: $("#exportPopover"),
  exportPngButton: $("#exportPngButton"),
  exportJsonButton: $("#exportJsonButton"),
  importJsonButton: $("#importJsonButton"),
  resetProjectButton: $("#resetProjectButton"),
  projectInput: $("#projectInput"),
  undoButton: $("#undoButton"),
  redoButton: $("#redoButton"),
  saveButton: $("#saveButton"),
  referenceButton: $("#referenceButton"),
  referencePeek: $("#referencePeek"),
  referencePeekImage: $("#referencePeekImage"),
  surfaceButton: $("#surfaceButton"),
  fitButton: $("#fitButton"),
  zoomOut: $("#zoomOut"),
  zoomIn: $("#zoomIn"),
  zoomLabel: $("#zoomLabel"),
  toastRegion: $("#toastRegion")
};

const state = {
  parts: clone(initialParts),
  selectedId: null,
  tool: "select",
  collapsed: new Set(blueprint.categories.filter((item) => !item.open).map((item) => item.id)),
  search: "",
  surfacesVisible: false,
  zoom: 1,
  history: [],
  future: [],
  drag: null,
  dirty: false,
  scene: null
};

init();

function init() {
  dom.referencePeekImage.src = referenceImageUrl;
  populateSurfaceSelect();
  populateAddons();
  bindEvents();
  const restored = restoreLocalProject();
  buildScene();
  renderAll();
  dom.projectState.textContent = restored ? "已恢复本机 2.5D 工程" : "主视角 2.5D 分层工程已载入";
}

function normalizePart(part) {
  const normalized = {
    ...part,
    original: part.original || {
      x: part.x,
      y: part.y,
      width: part.width,
      height: part.height,
      rotation: part.rotation || 0,
      scaleX: part.scaleX || 1,
      scaleY: part.scaleY || 1,
      zIndex: part.zIndex,
      visible: part.visible,
      locked: part.locked
    },
    deleted: Boolean(part.deleted),
    asset: part.asset || null
  };
  normalized.width = Math.max(1, Number(normalized.width) || 1);
  normalized.height = Math.max(1, Number(normalized.height) || 1);
  normalized.rotation = Number(normalized.rotation) || 0;
  normalized.scaleX = normalized.width / Math.max(1, normalized.original.width);
  normalized.scaleY = normalized.height / Math.max(1, normalized.original.height);
  return normalized;
}

function svgElement(tag, attributes = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value === undefined || value === null) continue;
    if (name === "href") {
      node.setAttributeNS(XLINK_NS, "href", value);
      node.setAttribute("href", value);
    } else {
      node.setAttribute(name, String(value));
    }
  }
  return node;
}

function buildScene() {
  dom.svg.replaceChildren();
  const defs = svgElement("defs");
  defs.append(
    buildColorDefinitions(),
    buildTextureFilter(),
    buildBaseMask(),
    buildBaseClip()
  );

  for (const part of state.parts.filter((item) => item.kind === "photo" && item.status === "layered")) {
    const clip = svgElement("clipPath", { id: clipId(part.id), clipPathUnits: "userSpaceOnUse" });
    clip.append(buildShape(part, { fill: "white" }));
    defs.append(clip);
  }

  const revealLayer = svgElement("g", { id: "revealLayer", "aria-label": "拆除部件后显示的补全结构" });
  for (const part of state.parts.filter((item) => item.kind === "photo" && item.status === "layered")) {
    revealLayer.append(buildRevealPatch(part));
  }

  const baseImage = svgElement("image", {
    id: "baseImage",
    href: referenceImageUrl,
    x: 0,
    y: 0,
    width: blueprint.canvas.width,
    height: blueprint.canvas.height,
    preserveAspectRatio: "none",
    "clip-path": "url(#vehicleBaseClip)"
  });

  const baseGroup = svgElement("g", { id: "baseGroup" });
  // Reveal patches permanently cover the detachable pixels in the base photo.
  // The independent photo layers are then composited back above them.
  baseGroup.append(baseImage, revealLayer);
  const partsGroup = svgElement("g", { id: "partsGroup" });
  const surfacesGroup = svgElement("g", { id: "surfacesGroup" });
  const selectionHud = svgElement("g", { id: "selectionHud" });
  dom.svg.append(defs, baseGroup, partsGroup, surfacesGroup, selectionHud);

  state.scene = { defs, baseGroup, partsGroup, surfacesGroup, selectionHud };
  for (const part of state.parts) createPartElement(part);
  buildSurfaceGuides();
  renderPartOrder();
}

function buildColorDefinitions() {
  const group = svgElement("g");
  const gradients = [
    ["groundGradient", "#615b52", "#272925"],
    ["chassisGradient", "#383832", "#111613"],
    ["deckGradient", "#6f634f", "#302f29"],
    ["factoryGradient", "#404742", "#171c1a"]
  ];
  for (const [id, start, end] of gradients) {
    const gradient = svgElement("linearGradient", { id, x1: "0%", y1: "0%", x2: "100%", y2: "100%" });
    gradient.append(svgElement("stop", { offset: "0%", "stop-color": start }), svgElement("stop", { offset: "100%", "stop-color": end }));
    group.append(gradient);
  }
  return group;
}

function buildTextureFilter() {
  const filter = svgElement("filter", { id: "patchTexture", x: "-10%", y: "-10%", width: "120%", height: "120%" });
  filter.append(
    svgElement("feTurbulence", { type: "fractalNoise", baseFrequency: ".035", numOctaves: 2, seed: 8, result: "noise" }),
    svgElement("feColorMatrix", { in: "noise", values: "0 0 0 0 0.14 0 0 0 0 0.13 0 0 0 0 0.11 0 0 0 .34 0", result: "coloredNoise" }),
    svgElement("feBlend", { in: "SourceGraphic", in2: "coloredNoise", mode: "soft-light" })
  );
  return filter;
}

function buildBaseMask() {
  const mask = svgElement("mask", {
    id: "vehicleBaseMask",
    maskUnits: "userSpaceOnUse",
    maskContentUnits: "userSpaceOnUse",
    x: 0,
    y: 0,
    width: blueprint.canvas.width,
    height: blueprint.canvas.height,
    "mask-type": "luminance",
    style: "mask-type:luminance"
  });
  mask.append(svgElement("rect", { x: 0, y: 0, width: blueprint.canvas.width, height: blueprint.canvas.height, fill: "white" }));
  for (const part of state.parts.filter((item) => item.kind === "photo" && item.status === "layered" && !item.dynamic)) {
    mask.append(buildShape(part, { fill: "black" }));
  }
  return mask;
}

function buildBaseClip() {
  const clip = svgElement("clipPath", { id: "vehicleBaseClip", clipPathUnits: "userSpaceOnUse" });
  const cutouts = state.parts
    .filter((item) => item.kind === "photo" && item.status === "layered" && !item.dynamic)
    .map(shapePathData)
    .join(" ");
  clip.append(svgElement("path", {
    d: `M0 0 H${blueprint.canvas.width} V${blueprint.canvas.height} H0 Z ${cutouts}`,
    "fill-rule": "evenodd",
    "clip-rule": "evenodd"
  }));
  return clip;
}

function shapePathData(part) {
  if (part.shape === "ellipse") {
    const cx = part.bounds.x + part.bounds.width / 2;
    const cy = part.bounds.y + part.bounds.height / 2;
    const rx = part.bounds.width / 2;
    const ry = part.bounds.height / 2;
    return `M${cx - rx} ${cy} A${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`;
  }
  if (part.path) return part.path;
  const { x, y, width, height } = part.bounds;
  return `M${x} ${y} H${x + width} V${y + height} H${x} Z`;
}

function buildShape(part, attributes = {}) {
  if (part.shape === "ellipse") {
    return svgElement("ellipse", {
      cx: part.bounds.x + part.bounds.width / 2,
      cy: part.bounds.y + part.bounds.height / 2,
      rx: part.bounds.width / 2,
      ry: part.bounds.height / 2,
      ...attributes
    });
  }
  if (part.path) return svgElement("path", { d: part.path, ...attributes });
  return svgElement("rect", { x: part.bounds.x, y: part.bounds.y, width: part.bounds.width, height: part.bounds.height, rx: 3, ...attributes });
}

function buildRevealPatch(part) {
  const group = svgElement("g", { id: `reveal-${safeId(part.id)}`, class: "reveal-patch", "data-reveal-for": part.id });
  const fillMap = {
    ground: "url(#groundGradient)",
    chassis: "url(#chassisGradient)",
    deck: "url(#deckGradient)",
    factory: "url(#factoryGradient)",
    wheel: "url(#groundGradient)",
    none: "transparent"
  };
  group.append(buildShape(part, { fill: fillMap[part.reveal] || "url(#chassisGradient)", filter: "url(#patchTexture)" }));

  if (part.reveal === "wheel") {
    const cx = part.bounds.x + part.bounds.width / 2;
    const cy = part.bounds.y + part.bounds.height / 2;
    group.append(
      svgElement("line", { x1: cx - part.bounds.width * .48, y1: cy - 5, x2: cx + part.bounds.width * .48, y2: cy - 5, stroke: "#181b18", "stroke-width": 12, "stroke-linecap": "round" }),
      svgElement("circle", { cx, cy: cy - 5, r: Math.max(7, part.bounds.width * .12), fill: "#2f312d", stroke: "#080a09", "stroke-width": 4 }),
      svgElement("ellipse", { cx, cy: part.bounds.y + part.bounds.height * .82, rx: part.bounds.width * .38, ry: part.bounds.height * .1, fill: "#111713", opacity: .62 })
    );
  }
  if (part.reveal === "deck" || part.reveal === "chassis") {
    const y = part.bounds.y + part.bounds.height * .55;
    group.append(
      svgElement("line", { x1: part.bounds.x + 5, y1: y, x2: part.bounds.x + part.bounds.width - 5, y2: y + 12, stroke: "#111612", "stroke-width": 10, opacity: .82 }),
      svgElement("line", { x1: part.bounds.x + 12, y1: y - 18, x2: part.bounds.x + part.bounds.width - 12, y2: y - 7, stroke: "#84765e", "stroke-width": 3, opacity: .58 })
    );
  }
  if (part.reveal === "factory") {
    const step = Math.max(28, part.bounds.width / 7);
    for (let x = part.bounds.x; x < part.bounds.x + part.bounds.width; x += step) {
      group.append(svgElement("line", { x1: x, y1: part.bounds.y, x2: x - 30, y2: part.bounds.y + part.bounds.height, stroke: "#67706a", "stroke-width": 2, opacity: .32 }));
    }
  }
  return group;
}

function createPartElement(part) {
  if (part.kind === "occluded") return;
  const group = svgElement("g", {
    id: partElementId(part.id),
    class: "photo-part",
    "data-part-id": part.id,
    tabindex: 0,
    role: "button",
    "aria-label": part.name
  });

  if (part.kind === "photo") {
    if (part.status === "layered") {
      const image = svgElement("image", {
        class: "part-asset",
        href: part.asset || referenceImageUrl,
        x: part.asset ? part.bounds.x : 0,
        y: part.asset ? part.bounds.y : 0,
        width: part.asset ? part.bounds.width : blueprint.canvas.width,
        height: part.asset ? part.bounds.height : blueprint.canvas.height,
        preserveAspectRatio: part.asset ? "xMidYMid meet" : "none",
        "clip-path": `url(#${clipId(part.id)})`
      });
      group.append(image);
    } else {
      group.append(buildShape(part, { fill: "transparent", stroke: "transparent" }));
    }
  } else if (part.kind === "asset") {
    group.append(svgElement("image", {
      class: "part-asset",
      href: part.asset,
      x: part.bounds.x,
      y: part.bounds.y,
      width: part.bounds.width,
      height: part.bounds.height,
      preserveAspectRatio: "xMidYMid meet"
    }));
  } else if (part.kind === "vector") {
    group.append(buildVectorAddon(part));
  }

  group.addEventListener("pointerdown", onPartPointerDown);
  group.addEventListener("click", (event) => {
    event.stopPropagation();
    selectPart(part.id);
  });
  group.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectPart(part.id);
    }
  });
  state.scene.partsGroup.append(group);
  updatePartElement(part);
}

function buildVectorAddon(part) {
  const { x, y, width: w, height: h } = part.bounds;
  const group = svgElement("g", { class: `vector-addon vector-${part.vectorType}` });
  if (part.vectorType === "tent") {
    group.append(
      svgElement("polygon", { points: `${x},${y + h} ${x + w / 2},${y} ${x + w},${y + h}`, fill: "#817252", stroke: "#2d2d27", "stroke-width": 3 }),
      svgElement("polygon", { points: `${x + w / 2},${y} ${x + w},${y + h} ${x + w * .7},${y + h}`, fill: "#5c513c", opacity: .9 }),
      svgElement("line", { x1: x + w / 2, y1: y + 2, x2: x + w / 2, y2: y + h, stroke: "#d9c9a3", "stroke-width": 2 }),
      svgElement("rect", { x: x + w * .39, y: y + h * .54, width: w * .22, height: h * .46, fill: "#282d29" })
    );
  } else if (part.vectorType === "campfire") {
    group.append(
      svgElement("ellipse", { cx: x + w / 2, cy: y + h * .83, rx: w * .42, ry: h * .12, fill: "#1d211e", opacity: .55 }),
      svgElement("line", { x1: x + w * .18, y1: y + h * .78, x2: x + w * .82, y2: y + h * .92, stroke: "#5a3927", "stroke-width": 8, "stroke-linecap": "round" }),
      svgElement("line", { x1: x + w * .82, y1: y + h * .78, x2: x + w * .18, y2: y + h * .92, stroke: "#463021", "stroke-width": 8, "stroke-linecap": "round" }),
      svgElement("path", { d: `M${x + w * .5} ${y + h * .77} C${x + w * .1} ${y + h * .52},${x + w * .52} ${y + h * .38},${x + w * .48} ${y} C${x + w * .91} ${y + h * .32},${x + w * .78} ${y + h * .67},${x + w * .5} ${y + h * .77}Z`, fill: "#e87b2d", stroke: "#f3bd50", "stroke-width": 2 })
    );
  } else if (part.vectorType === "crate") {
    group.append(
      svgElement("rect", { x, y: y + h * .12, width: w, height: h * .88, rx: 3, fill: "#596159", stroke: "#252b27", "stroke-width": 3 }),
      svgElement("path", { d: `M${x + 5} ${y + h * .18}L${x + w - 5} ${y + h * .94}M${x + w - 5} ${y + h * .18}L${x + 5} ${y + h * .94}`, stroke: "#899087", "stroke-width": 3 }),
      svgElement("rect", { x: x + w * .37, y, width: w * .26, height: h * .18, rx: 3, fill: "#272d29" })
    );
  } else {
    group.append(
      svgElement("rect", { x: x + 5, y: y + h * .22, width: w - 10, height: h * .78, fill: "#4b5551", opacity: .86 }),
      svgElement("polygon", { points: `${x},${y + h * .25} ${x + w * .18},${y} ${x + w},${y} ${x + w * .83},${y + h * .25}`, fill: "#7b6248", stroke: "#2e312d", "stroke-width": 3 }),
      ...[.12, .88].map((ratio) => svgElement("line", { x1: x + w * ratio, y1: y + h * .18, x2: x + w * ratio, y2: y + h, stroke: "#242b27", "stroke-width": 4 }))
    );
  }
  return group;
}

function updatePartElement(part) {
  const element = document.getElementById(partElementId(part.id));
  if (!element) return;
  element.setAttribute("transform", transformFor(part));
  element.classList.toggle("deleted", part.deleted);
  element.classList.toggle("invisible", !part.visible);
  element.classList.toggle("locked", part.locked || !isEditable(part));
  element.setAttribute("aria-pressed", state.selectedId === part.id ? "true" : "false");
  const image = element.querySelector(".part-asset");
  if (image && part.asset) {
    image.setAttributeNS(XLINK_NS, "href", part.asset);
    image.setAttribute("href", part.asset);
  } else if (image && part.kind === "photo") {
    image.setAttributeNS(XLINK_NS, "href", referenceImageUrl);
    image.setAttribute("href", referenceImageUrl);
  }
}

function transformFor(part) {
  const original = part.original;
  const cx = part.bounds.x + part.bounds.width / 2;
  const cy = part.bounds.y + part.bounds.height / 2;
  const dx = part.x - original.x;
  const dy = part.y - original.y;
  const sx = part.width / Math.max(1, original.width);
  const sy = part.height / Math.max(1, original.height);
  return `translate(${round(dx)} ${round(dy)}) rotate(${round(part.rotation)} ${round(cx)} ${round(cy)}) translate(${round(cx)} ${round(cy)}) scale(${round(sx)} ${round(sy)}) translate(${-round(cx)} ${-round(cy)})`;
}

function buildSurfaceGuides() {
  state.scene.surfacesGroup.replaceChildren();
  for (const surface of blueprint.mountSurfaces) {
    const group = svgElement("g", { transform: `rotate(${surface.rotation} ${surface.x} ${surface.y})` });
    group.append(
      svgElement("rect", { class: "mount-surface", x: surface.x - surface.width / 2, y: surface.y - surface.height / 2, width: surface.width, height: surface.height, rx: 7 }),
      svgElement("text", { class: "mount-label", x: surface.x, y: surface.y + 3 })
    );
    group.querySelector("text").textContent = surface.name;
    state.scene.surfacesGroup.append(group);
  }
  state.scene.surfacesGroup.style.display = state.surfacesVisible ? "block" : "none";
}

function renderPartOrder() {
  const rendered = state.parts
    .filter((part) => part.kind !== "occluded")
    .sort((a, b) => a.zIndex - b.zIndex);
  for (const part of rendered) {
    const element = document.getElementById(partElementId(part.id));
    if (element) state.scene.partsGroup.append(element);
  }
  state.scene.partsGroup.append(state.scene.selectionHud);
}

function renderAll() {
  for (const part of state.parts) updatePartElement(part);
  renderPartOrder();
  renderTree();
  renderInspector();
  renderSelectionHud();
  updateHistoryButtons();
  dom.layerCount.textContent = String(state.parts.length);
}

function renderTree() {
  dom.layerTree.replaceChildren();
  const query = state.search.trim().toLowerCase();
  for (const category of blueprint.categories) {
    const parts = state.parts.filter((part) => part.category === category.id && (!query || `${part.name} ${part.id}`.toLowerCase().includes(query)));
    if (!parts.length && query) continue;
    const section = document.createElement("section");
    section.className = `category${state.collapsed.has(category.id) ? " collapsed" : ""}`;
    const head = document.createElement("button");
    head.type = "button";
    head.className = "category-head";
    head.innerHTML = `<span class="chevron">⌄</span><span>${escapeHtml(category.name)}</span><b>${parts.length}</b>`;
    head.addEventListener("click", () => {
      if (state.collapsed.has(category.id)) state.collapsed.delete(category.id); else state.collapsed.add(category.id);
      renderTree();
    });
    const items = document.createElement("div");
    items.className = "category-items";
    for (const part of parts.sort((a, b) => b.zIndex - a.zIndex)) items.append(buildLayerRow(part));
    section.append(head, items);
    dom.layerTree.append(section);
  }
}

function buildLayerRow(part) {
  const row = document.createElement("div");
  row.className = `layer-row ${part.status}${part.id === state.selectedId ? " selected" : ""}${part.deleted ? " deleted" : ""}`;
  row.setAttribute("role", "treeitem");
  row.innerHTML = `
    <i class="layer-status-icon ${part.status}"></i>
    <div class="layer-copy"><div class="layer-name">${escapeHtml(part.name)}</div><code class="layer-id">${escapeHtml(part.id)}</code></div>
    <button class="layer-icon visibility" type="button" title="${part.visible ? "隐藏" : "显示"}">${part.visible && !part.deleted ? "◉" : "○"}</button>
    <button class="layer-icon lock" type="button" title="${part.locked ? "解锁" : "锁定"}">${part.locked ? "◆" : "◇"}</button>`;
  if (part.kind === "occluded") {
    row.querySelectorAll("button").forEach((button) => { button.disabled = true; });
    row.title = "这个部件在原图中被完全遮挡，需要其他视角素材";
  } else {
    row.addEventListener("click", () => selectPart(part.id));
    row.querySelector(".visibility").addEventListener("click", (event) => {
      event.stopPropagation();
      if (!isEditable(part)) return showStatusLimit(part);
      recordHistory();
      part.visible = !part.visible;
      part.deleted = false;
      markDirty();
      renderAll();
    });
    row.querySelector(".lock").addEventListener("click", (event) => {
      event.stopPropagation();
      if (!isEditable(part)) return showStatusLimit(part);
      recordHistory();
      part.locked = !part.locked;
      markDirty();
      renderAll();
    });
  }
  return row;
}

function selectPart(id) {
  const part = getPart(id);
  if (!part) return;
  state.selectedId = id;
  dom.stageEmpty.classList.add("hidden");
  renderAll();
}

function renderInspector() {
  const part = selectedPart();
  if (!part) {
    dom.inspectorEmpty.classList.remove("hidden");
    dom.inspector.classList.add("hidden");
    dom.partNumber.textContent = "—";
    dom.selectionStatus.textContent = "未选择部件";
    return;
  }
  dom.inspectorEmpty.classList.add("hidden");
  dom.inspector.classList.remove("hidden");
  dom.partNumber.textContent = String(state.parts.indexOf(part) + 1).padStart(2, "0");
  dom.selectedCategory.textContent = categoryMap.get(part.category)?.name || "附加设施";
  dom.selectedName.textContent = part.name;
  dom.selectedId.textContent = part.id;
  dom.selectedIcon.textContent = part.kind === "vector" ? "＋" : part.kind === "occluded" ? "⊘" : part.shape === "ellipse" ? "◉" : "▧";
  dom.selectionStatus.textContent = `已选择：${part.name}`;
  dom.posX.value = Math.round(part.x);
  dom.posY.value = Math.round(part.y);
  dom.partWidth.value = Math.round(part.width);
  dom.partHeight.value = Math.round(part.height);
  dom.rotation.value = part.rotation;
  dom.rotationOutput.value = `${Math.round(part.rotation)}°`;
  dom.zOutput.value = part.zIndex;
  dom.visibilityButton.textContent = part.visible && !part.deleted ? "◉ 隐藏" : "○ 显示";
  dom.lockButton.textContent = part.locked ? "◆ 解锁" : "◇ 锁定";
  dom.clearReplacementButton.classList.toggle("hidden", !part.asset || part.kind === "asset");

  const editable = isEditable(part);
  const controls = [dom.visibilityButton, dom.lockButton, dom.duplicateButton, dom.deleteButton, dom.resetButton, dom.posX, dom.posY, dom.partWidth, dom.partHeight, dom.rotation, dom.sendBackButton, dom.stepBackButton, dom.stepFrontButton, dom.bringFrontButton, dom.replaceButton, dom.snapButton];
  controls.forEach((control) => { control.disabled = !editable; });
  if (part.status === "layered" || part.kind === "vector" || part.kind === "asset") {
    dom.separationNote.className = "separation-note";
    dom.separationNote.innerHTML = `<b>真正的独立视觉层</b><p>隐藏或移动以后，原位置会露出补全层；这不是透明热区。</p>`;
  } else if (part.status === "grouped") {
    dom.separationNote.className = "separation-note warn";
    dom.separationNote.innerHTML = `<b>组合定位层 · 暂不允许拆除</b><p>细栏杆仍包含在平台照片层中，需制作更精细蒙版后才能真正独立。</p>`;
  } else {
    dom.separationNote.className = "separation-note muted";
    dom.separationNote.innerHTML = `<b>原图中完全被遮挡</b><p>当前视角没有这些像素。保留逻辑 ID，等待其他视角素材后接入。</p>`;
  }
}

function renderSelectionHud() {
  const hud = state.scene?.selectionHud;
  if (!hud) return;
  hud.replaceChildren();
  const part = selectedPart();
  if (!part || part.deleted || !part.visible || !isEditable(part)) return;
  const points = transformedCorners(part);
  const polygon = svgElement("polygon", { class: "selection-line", points: points.map((point) => `${round(point.x)},${round(point.y)}`).join(" ") });
  const topMid = midpoint(points[0], points[1]);
  const center = transformedCenter(part);
  const outward = normalizeVector({ x: topMid.x - center.x, y: topMid.y - center.y });
  const rotationPoint = { x: topMid.x + outward.x * 24, y: topMid.y + outward.y * 24 };
  const scalePoint = points[2];
  const stem = svgElement("line", { class: "rotation-stem", x1: topMid.x, y1: topMid.y, x2: rotationPoint.x, y2: rotationPoint.y });
  const scaleHandle = svgElement("circle", { class: "selection-handle", cx: scalePoint.x, cy: scalePoint.y, r: 6, "data-handle": "scale" });
  const rotationHandle = svgElement("circle", { class: "rotation-handle", cx: rotationPoint.x, cy: rotationPoint.y, r: 6, "data-handle": "rotate" });
  scaleHandle.addEventListener("pointerdown", (event) => beginHandleDrag(event, "scale"));
  rotationHandle.addEventListener("pointerdown", (event) => beginHandleDrag(event, "rotate"));
  hud.append(polygon, stem, scaleHandle, rotationHandle);
}

function transformedCorners(part) {
  const b = part.bounds;
  return [
    transformPoint(part, b.x, b.y),
    transformPoint(part, b.x + b.width, b.y),
    transformPoint(part, b.x + b.width, b.y + b.height),
    transformPoint(part, b.x, b.y + b.height)
  ];
}

function transformPoint(part, x, y) {
  const cx = part.bounds.x + part.bounds.width / 2;
  const cy = part.bounds.y + part.bounds.height / 2;
  const sx = part.width / Math.max(1, part.original.width);
  const sy = part.height / Math.max(1, part.original.height);
  const scaledX = cx + (x - cx) * sx;
  const scaledY = cy + (y - cy) * sy;
  const radians = part.rotation * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: cx + (scaledX - cx) * cos - (scaledY - cy) * sin + (part.x - part.original.x),
    y: cy + (scaledX - cx) * sin + (scaledY - cy) * cos + (part.y - part.original.y)
  };
}

function transformedCenter(part) {
  return {
    x: part.bounds.x + part.bounds.width / 2 + (part.x - part.original.x),
    y: part.bounds.y + part.bounds.height / 2 + (part.y - part.original.y)
  };
}

function onPartPointerDown(event) {
  const id = event.currentTarget.dataset.partId;
  const part = getPart(id);
  if (!part) return;
  selectPart(id);
  if (!isEditable(part) || part.locked || part.deleted || !part.visible) return showStatusLimit(part);
  const gesture = state.tool === "rotate" ? "rotate" : state.tool === "scale" ? "scale" : "move";
  beginDrag(event, gesture);
}

function beginHandleDrag(event, type) {
  event.stopPropagation();
  const part = selectedPart();
  if (!part || part.locked || !isEditable(part)) return;
  beginDrag(event, type);
}

function beginDrag(event, type) {
  const part = selectedPart();
  if (!part) return;
  event.preventDefault();
  const point = pointerToSvg(event);
  const center = transformedCenter(part);
  state.drag = {
    pointerId: event.pointerId,
    type,
    partId: part.id,
    startPoint: point,
    center,
    before: projectSnapshot(),
    start: { x: part.x, y: part.y, width: part.width, height: part.height, rotation: part.rotation },
    startDistance: Math.max(1, distance(point, center)),
    startAngle: Math.atan2(point.y - center.y, point.x - center.x)
  };
  dom.svg.setPointerCapture?.(event.pointerId);
}

function onPointerMove(event) {
  if (!state.drag || event.pointerId !== state.drag.pointerId) return;
  const part = getPart(state.drag.partId);
  if (!part) return;
  const point = pointerToSvg(event);
  if (state.drag.type === "move") {
    part.x = Math.round(state.drag.start.x + point.x - state.drag.startPoint.x);
    part.y = Math.round(state.drag.start.y + point.y - state.drag.startPoint.y);
  } else if (state.drag.type === "scale") {
    const ratio = Math.max(.05, distance(point, state.drag.center) / state.drag.startDistance);
    part.width = Math.max(4, Math.round(state.drag.start.width * ratio));
    part.height = Math.max(4, Math.round(state.drag.start.height * ratio));
  } else if (state.drag.type === "rotate") {
    const angle = Math.atan2(point.y - state.drag.center.y, point.x - state.drag.center.x);
    part.rotation = normalizeAngle(state.drag.start.rotation + (angle - state.drag.startAngle) * 180 / Math.PI);
  }
  updatePartElement(part);
  renderSelectionHud();
  renderInspector();
  state.dirty = true;
}

function endPointerDrag(event) {
  if (!state.drag || event.pointerId !== state.drag.pointerId) return;
  const changed = JSON.stringify(state.drag.before.parts) !== JSON.stringify(projectSnapshot().parts);
  if (changed) {
    state.history.push(state.drag.before);
    if (state.history.length > MAX_HISTORY) state.history.shift();
    state.future = [];
    markDirty();
  }
  state.drag = null;
  updateHistoryButtons();
  renderTree();
}

function bindEvents() {
  dom.svg.addEventListener("pointermove", onPointerMove);
  dom.svg.addEventListener("pointerup", endPointerDrag);
  dom.svg.addEventListener("pointercancel", endPointerDrag);
  dom.svg.addEventListener("click", (event) => {
    if (event.target === dom.svg || event.target.id === "baseImage") {
      state.selectedId = null;
      dom.stageEmpty.classList.remove("hidden");
      renderAll();
    }
  });
  document.querySelectorAll("[data-tool]").forEach((button) => button.addEventListener("click", () => {
    state.tool = button.dataset.tool;
    document.querySelectorAll("[data-tool]").forEach((item) => item.classList.toggle("active", item === button));
    dom.editHint.textContent = state.tool === "move" ? "拖动车辆部件进行移动" : state.tool === "scale" ? "拖动部件或右下圆点进行等比缩放" : state.tool === "rotate" ? "拖动部件或上方圆点进行旋转" : "点击选择；直接拖动可移动";
  }));
  dom.searchInput.addEventListener("input", () => { state.search = dom.searchInput.value; renderTree(); });
  dom.visibilityButton.addEventListener("click", toggleSelectedVisibility);
  dom.lockButton.addEventListener("click", () => mutateSelected((part) => { part.locked = !part.locked; }));
  dom.duplicateButton.addEventListener("click", duplicateSelected);
  dom.deleteButton.addEventListener("click", deleteSelected);
  dom.resetButton.addEventListener("click", restoreSelected);
  dom.sendBackButton.addEventListener("click", () => changeSelectedZ("back"));
  dom.stepBackButton.addEventListener("click", () => changeSelectedZ(-1));
  dom.stepFrontButton.addEventListener("click", () => changeSelectedZ(1));
  dom.bringFrontButton.addEventListener("click", () => changeSelectedZ("front"));
  bindNumberField(dom.posX, "x");
  bindNumberField(dom.posY, "y");
  bindNumberField(dom.partWidth, "width", 1);
  bindNumberField(dom.partHeight, "height", 1);
  dom.rotation.addEventListener("pointerdown", () => { dom.rotation.dataset.before = JSON.stringify(projectSnapshot()); });
  dom.rotation.addEventListener("input", () => {
    const part = selectedPart();
    if (!part || !isEditable(part)) return;
    part.rotation = Number(dom.rotation.value);
    updatePartElement(part);
    renderSelectionHud();
    dom.rotationOutput.value = `${Math.round(part.rotation)}°`;
  });
  dom.rotation.addEventListener("change", () => {
    const before = dom.rotation.dataset.before ? JSON.parse(dom.rotation.dataset.before) : null;
    if (before) pushHistorySnapshot(before);
    markDirty();
    renderAll();
  });
  dom.replaceButton.addEventListener("click", () => dom.replaceInput.click());
  dom.replaceInput.addEventListener("change", () => replaceSelectedAsset(dom.replaceInput.files?.[0]));
  dom.clearReplacementButton.addEventListener("click", clearReplacement);
  dom.snapButton.addEventListener("click", snapSelectedToSurface);
  dom.addButton.addEventListener("click", () => togglePopover(dom.addPopover, dom.exportPopover));
  dom.exportButton.addEventListener("click", () => togglePopover(dom.exportPopover, dom.addPopover));
  document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => document.getElementById(button.dataset.close).classList.add("hidden")));
  dom.uploadAddonButton.addEventListener("click", () => dom.addonInput.click());
  dom.addonInput.addEventListener("change", () => importAddonAsset(dom.addonInput.files?.[0]));
  dom.saveButton.addEventListener("click", saveLocalProject);
  dom.undoButton.addEventListener("click", undo);
  dom.redoButton.addEventListener("click", redo);
  dom.exportPngButton.addEventListener("click", exportPng);
  dom.exportJsonButton.addEventListener("click", exportProjectJson);
  dom.importJsonButton.addEventListener("click", () => dom.projectInput.click());
  dom.projectInput.addEventListener("change", () => importProjectJson(dom.projectInput.files?.[0]));
  dom.resetProjectButton.addEventListener("click", resetProject);
  dom.referenceButton.addEventListener("click", () => {
    dom.referencePeek.classList.toggle("hidden");
    dom.referenceButton.classList.toggle("active", !dom.referencePeek.classList.contains("hidden"));
  });
  dom.surfaceButton.addEventListener("click", () => {
    state.surfacesVisible = !state.surfacesVisible;
    state.scene.surfacesGroup.style.display = state.surfacesVisible ? "block" : "none";
    dom.surfaceButton.classList.toggle("active", state.surfacesVisible);
  });
  dom.zoomOut.addEventListener("click", () => setZoom(state.zoom - .1));
  dom.zoomIn.addEventListener("click", () => setZoom(state.zoom + .1));
  dom.fitButton.addEventListener("click", () => setZoom(1));
  document.addEventListener("keydown", handleKeyboard);
}

function bindNumberField(input, field, minimum = -Infinity) {
  const commitInput = () => {
    const before = input.dataset.before ? JSON.parse(input.dataset.before) : null;
    if (!before) return;
    if (JSON.stringify(before.parts) !== JSON.stringify(projectSnapshot().parts)) pushHistorySnapshot(before);
    delete input.dataset.before;
    markDirty();
    renderAll();
  };
  input.addEventListener("focus", () => {
    input.dataset.before = JSON.stringify(projectSnapshot());
  });
  input.addEventListener("input", () => {
    const part = selectedPart();
    const value = Number(input.value);
    if (!part || !isEditable(part) || !Number.isFinite(value)) return;
    if (!input.dataset.before) input.dataset.before = JSON.stringify(projectSnapshot());
    part[field] = Math.max(minimum, value);
    updatePartElement(part);
    renderSelectionHud();
    state.dirty = true;
  });
  input.addEventListener("change", commitInput);
  input.addEventListener("blur", commitInput);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") input.blur();
  });
}

function toggleSelectedVisibility() {
  mutateSelected((part) => {
    if (part.deleted) part.deleted = false;
    part.visible = !part.visible;
  });
}

function mutateSelected(mutator) {
  const part = selectedPart();
  if (!part || !isEditable(part)) return part && showStatusLimit(part);
  recordHistory();
  mutator(part);
  markDirty();
  renderAll();
}

function duplicateSelected() {
  const part = selectedPart();
  if (!part || !isEditable(part)) return part && showStatusLimit(part);
  recordHistory();
  const copyPart = normalizePart(clone(part));
  copyPart.id = uniqueId(`${part.id}_copy`);
  copyPart.name = `${part.name} 副本`;
  copyPart.x += 18;
  copyPart.y += 18;
  copyPart.zIndex = maxZ() + 1;
  copyPart.dynamic = true;
  copyPart.deleted = false;
  copyPart.visible = true;
  copyPart.locked = false;
  copyPart.original = { ...copyPart.original };
  state.parts.push(copyPart);
  createPartElement(copyPart);
  state.selectedId = copyPart.id;
  markDirty();
  renderAll();
  toast("已复制为独立部件");
}

function deleteSelected() {
  const part = selectedPart();
  if (!part || !isEditable(part)) return part && showStatusLimit(part);
  recordHistory();
  part.deleted = true;
  part.visible = false;
  markDirty();
  renderAll();
  toast(`${part.name} 已删除，可用“恢复原状”找回`);
}

function restoreSelected() {
  const part = selectedPart();
  if (!part || !isEditable(part)) return part && showStatusLimit(part);
  recordHistory();
  Object.assign(part, clone(part.original), { deleted: false, asset: part.kind === "photo" ? null : part.asset });
  part.width = part.original.width;
  part.height = part.original.height;
  markDirty();
  renderAll();
  toast("部件已恢复初始状态");
}

function changeSelectedZ(direction) {
  mutateSelected((part) => {
    if (direction === "back") part.zIndex = minZ() - 1;
    else if (direction === "front") part.zIndex = maxZ() + 1;
    else part.zIndex += direction;
  });
}

async function replaceSelectedAsset(file) {
  const part = selectedPart();
  if (!file || !part || !isEditable(part)) return;
  if (!file.type.startsWith("image/")) return toast("请选择 PNG、WebP 或 SVG 图片", "error");
  const asset = await readFile(file);
  recordHistory();
  part.asset = asset;
  markDirty();
  buildScene();
  renderAll();
  dom.replaceInput.value = "";
  toast("透明素材已替换，位置和变换保持不变");
}

function clearReplacement() {
  mutateSelected((part) => { part.asset = null; });
  buildScene();
  renderAll();
}

function snapSelectedToSurface() {
  const part = selectedPart();
  const surface = blueprint.mountSurfaces.find((item) => item.id === dom.surfaceSelect.value);
  if (!part || !surface || !isEditable(part)) return;
  mutateSelected((target) => {
    target.x = Math.round(surface.x - target.width / 2);
    target.y = Math.round(surface.y - target.height);
    target.rotation = surface.rotation;
    target.zIndex = maxZ() + 1;
  });
  toast(`已吸附到：${surface.name}`);
}

function populateSurfaceSelect() {
  dom.surfaceSelect.replaceChildren(...blueprint.mountSurfaces.map((surface) => {
    const option = document.createElement("option");
    option.value = surface.id;
    option.textContent = surface.name;
    return option;
  }));
}

function populateAddons() {
  const icons = { tent: "△", campfire: "✦", crate: "▣", shelter: "⌂" };
  dom.addonList.replaceChildren(...blueprint.addonTemplates.map((template) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "addon-option";
    button.innerHTML = `<span>${icons[template.id] || "+"}</span><b>${escapeHtml(template.name)}</b><small>作为独立 SVG 组件添加</small>`;
    button.addEventListener("click", () => addVectorAddon(template));
    return button;
  }));
}

function addVectorAddon(template) {
  const surface = blueprint.mountSurfaces.find((item) => item.id === template.defaultSurface) || blueprint.mountSurfaces[0];
  recordHistory();
  const x = Math.round(surface.x - template.width / 2);
  const y = Math.round(surface.y - template.height);
  const part = normalizePart({
    id: uniqueId(`addon_${template.id}`),
    name: template.name,
    category: "addons",
    kind: "vector",
    vectorType: template.id,
    status: "layered",
    bounds: { x, y, width: template.width, height: template.height },
    x, y, width: template.width, height: template.height,
    rotation: surface.rotation,
    scaleX: 1,
    scaleY: 1,
    zIndex: maxZ() + 1,
    visible: true,
    locked: false,
    dynamic: true
  });
  state.parts.push(part);
  createPartElement(part);
  state.selectedId = part.id;
  dom.addPopover.classList.add("hidden");
  markDirty();
  renderAll();
  toast(`${template.name} 已添加，可直接拖动和缩放`);
}

async function importAddonAsset(file) {
  if (!file || !file.type.startsWith("image/")) return;
  const asset = await readFile(file);
  recordHistory();
  const x = 540;
  const y = 75;
  const part = normalizePart({
    id: uniqueId("addon_asset"),
    name: file.name.replace(/\.[^.]+$/, "") || "导入设施",
    category: "addons",
    kind: "asset",
    status: "layered",
    asset,
    bounds: { x, y, width: 120, height: 90 },
    x, y, width: 120, height: 90,
    rotation: 0,
    zIndex: maxZ() + 1,
    visible: true,
    locked: false,
    dynamic: true
  });
  state.parts.push(part);
  createPartElement(part);
  state.selectedId = part.id;
  dom.addonInput.value = "";
  dom.addPopover.classList.add("hidden");
  markDirty();
  renderAll();
  toast("图片已作为新的独立部件加入");
}

function saveLocalProject() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projectSnapshot()));
    state.dirty = false;
    dom.projectState.textContent = "工程已保存到本机";
    toast("工程已保存");
  } catch (error) {
    toast("保存失败：替换素材可能过大，请导出 JSON 保存", "error");
  }
}

function restoreLocalProject() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved?.parts?.length || saved.viewId !== blueprint.viewId) return false;
    state.parts = saved.parts.map(normalizePart);
    return true;
  } catch {
    return false;
  }
}

function projectSnapshot() {
  return { version: 1, viewId: blueprint.viewId, savedAt: new Date().toISOString(), parts: clone(state.parts) };
}

function recordHistory() {
  pushHistorySnapshot(projectSnapshot());
}

function pushHistorySnapshot(snapshot) {
  state.history.push(snapshot);
  if (state.history.length > MAX_HISTORY) state.history.shift();
  state.future = [];
  updateHistoryButtons();
}

function undo() {
  if (!state.history.length) return;
  state.future.push(projectSnapshot());
  restoreSnapshot(state.history.pop());
}

function redo() {
  if (!state.future.length) return;
  state.history.push(projectSnapshot());
  restoreSnapshot(state.future.pop());
}

function restoreSnapshot(snapshot) {
  state.parts = clone(snapshot.parts).map(normalizePart);
  if (!getPart(state.selectedId)) state.selectedId = null;
  state.dirty = true;
  buildScene();
  renderAll();
}

function updateHistoryButtons() {
  dom.undoButton.disabled = !state.history.length;
  dom.redoButton.disabled = !state.future.length;
}

async function exportPng() {
  toast("正在生成 PNG……");
  const cloneSvg = dom.svg.cloneNode(true);
  cloneSvg.querySelector("#selectionHud")?.remove();
  cloneSvg.querySelector("#surfacesGroup")?.remove();
  cloneSvg.setAttribute("width", blueprint.canvas.width);
  cloneSvg.setAttribute("height", blueprint.canvas.height);
  cloneSvg.setAttribute("xmlns", SVG_NS);
  for (const image of cloneSvg.querySelectorAll("image")) {
    const href = image.getAttribute("href");
    if (href && !href.startsWith("data:")) image.setAttribute("href", new URL(href, location.href).href);
  }
  const blob = new Blob([new XMLSerializer().serializeToString(cloneSvg)], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const image = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = blueprint.canvas.width * 2;
    canvas.height = blueprint.canvas.height * 2;
    const context = canvas.getContext("2d");
    context.scale(2, 2);
    context.drawImage(image, 0, 0, blueprint.canvas.width, blueprint.canvas.height);
    canvas.toBlob((png) => {
      if (!png) return toast("PNG 生成失败", "error");
      downloadBlob(png, "haul-truck-25d.png");
      toast("PNG 已导出");
    }, "image/png");
  } catch (error) {
    toast("PNG 导出失败，请使用工程 JSON 保存", "error");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function exportProjectJson() {
  const blob = new Blob([JSON.stringify(projectSnapshot(), null, 2)], { type: "application/json" });
  downloadBlob(blob, "haul-truck-25d-project.json");
  toast("工程 JSON 已导出");
}

async function importProjectJson(file) {
  if (!file) return;
  try {
    const project = JSON.parse(await file.text());
    if (!Array.isArray(project.parts) || project.viewId !== blueprint.viewId) throw new Error("不是当前主视角工程");
    recordHistory();
    state.parts = project.parts.map(normalizePart);
    state.selectedId = null;
    buildScene();
    markDirty();
    renderAll();
    toast("工程已导入");
  } catch (error) {
    toast(`导入失败：${error.message}`, "error");
  } finally {
    dom.projectInput.value = "";
  }
}

function resetProject() {
  if (!window.confirm("确定重置整个 2.5D 工程吗？本机未导出的改动会被覆盖。")) return;
  recordHistory();
  state.parts = clone(initialParts).map(normalizePart);
  state.selectedId = null;
  localStorage.removeItem(STORAGE_KEY);
  buildScene();
  markDirty();
  renderAll();
  toast("工程已恢复初始分层状态");
}

function handleKeyboard(event) {
  if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) return;
  const part = selectedPart();
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    event.shiftKey ? redo() : undo();
    return;
  }
  if ((event.key === "Delete" || event.key === "Backspace") && part) {
    event.preventDefault();
    deleteSelected();
  }
  if (event.key.toLowerCase() === "v") document.querySelector('[data-tool="select"]')?.click();
  if (event.key.toLowerCase() === "g") document.querySelector('[data-tool="move"]')?.click();
  if (event.key.toLowerCase() === "s") document.querySelector('[data-tool="scale"]')?.click();
  if (event.key.toLowerCase() === "r") document.querySelector('[data-tool="rotate"]')?.click();
  if (part && isEditable(part) && !part.locked && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
    event.preventDefault();
    recordHistory();
    const step = event.shiftKey ? 10 : 1;
    if (event.key === "ArrowLeft") part.x -= step;
    if (event.key === "ArrowRight") part.x += step;
    if (event.key === "ArrowUp") part.y -= step;
    if (event.key === "ArrowDown") part.y += step;
    markDirty();
    renderAll();
  }
}

function setZoom(value) {
  state.zoom = Math.min(2, Math.max(.5, Math.round(value * 10) / 10));
  dom.stageCanvas.style.transform = `scale(${state.zoom})`;
  dom.zoomLabel.textContent = `${Math.round(state.zoom * 100)}%`;
}

function togglePopover(target, other) {
  other.classList.add("hidden");
  target.classList.toggle("hidden");
}

function markDirty() {
  state.dirty = true;
  dom.projectState.textContent = "有未保存的本机改动";
}

function toast(message, type = "info", duration = 2600) {
  const item = document.createElement("div");
  item.className = `toast${type === "error" ? " error" : ""}`;
  item.textContent = message;
  dom.toastRegion.append(item);
  window.setTimeout(() => item.remove(), duration);
}

function showStatusLimit(part) {
  if (part.status === "occluded") toast("这个部件在原图中完全被遮挡，需要其他视角素材", "error");
  else if (part.status === "grouped") toast("该细节仍属于组合照片层，完成精细蒙版前不会假装可拆", "error");
  else if (part.locked) toast("请先解锁这个部件");
}

function isEditable(part) {
  return part && part.kind !== "occluded" && part.status !== "grouped";
}

function selectedPart() { return getPart(state.selectedId); }
function getPart(id) { return state.parts.find((part) => part.id === id); }
function maxZ() { return Math.max(0, ...state.parts.map((part) => part.zIndex || 0)); }
function minZ() { return Math.min(0, ...state.parts.map((part) => part.zIndex || 0)); }
function uniqueId(prefix) { let index = 1; let id = `${prefix}_${String(index).padStart(2, "0")}`; while (getPart(id)) id = `${prefix}_${String(++index).padStart(2, "0")}`; return id; }
function partElementId(id) { return `part-${safeId(id)}`; }
function clipId(id) { return `clip-${safeId(id)}`; }
function safeId(value) { return String(value).replace(/[^a-zA-Z0-9_-]/g, "-"); }
function round(value) { return Math.round(value * 1000) / 1000; }
function normalizeAngle(value) { let angle = value % 360; if (angle > 180) angle -= 360; if (angle < -180) angle += 360; return Math.round(angle); }
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function midpoint(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
function normalizeVector(point) { const length = Math.hypot(point.x, point.y) || 1; return { x: point.x / length, y: point.y / length }; }
function pointerToSvg(event) { const point = new DOMPoint(event.clientX, event.clientY); return point.matrixTransform(dom.svg.getScreenCTM().inverse()); }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]); }
function readFile(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); }); }
function loadImage(src) { return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = src; }); }
function downloadBlob(blob, filename) { const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
