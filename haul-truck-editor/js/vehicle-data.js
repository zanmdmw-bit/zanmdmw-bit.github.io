const DEFINITION_URL = "./data/vehicle.json";

export async function loadVehicleDefinition() {
  const response = await fetch(DEFINITION_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`车辆数据载入失败：${response.status}`);
  return normalizeDefinition(await response.json());
}

export function normalizeDefinition(definition) {
  const data = deepClone(definition);
  data.layers = data.layers.map((raw) => normalizeLayer(raw));
  data.groups = [...data.groups].sort((a, b) => a.order - b.order);
  data.anchors = data.anchors || [];
  return data;
}

export function normalizeLayer(raw) {
  const layer = {
    id: raw.id,
    name: raw.name || raw.id,
    category: raw.category || "addons",
    parentId: raw.parentId || raw.category || null,
    type: raw.type || "part",
    image: raw.image || null,
    reveal: raw.reveal || null,
    x: finite(raw.x, 0),
    y: finite(raw.y, 0),
    width: Math.max(1, finite(raw.width, 100)),
    height: Math.max(1, finite(raw.height, 100)),
    rotation: finite(raw.rotation, 0),
    skewX: finite(raw.skewX, 0),
    skewY: finite(raw.skewY, 0),
    opacity: clamp(finite(raw.opacity, 1), 0, 1),
    zIndex: finite(raw.zIndex, 100),
    visible: raw.visible !== false,
    locked: raw.locked === true,
    deleted: raw.deleted === true,
    assetStatus: raw.assetStatus || (raw.image ? "ready" : "pending"),
    embeddedInReference: raw.embeddedInReference === true,
    needsReveal: raw.needsReveal === true,
    anchorId: raw.anchorId || "none",
    note: raw.note || "",
    sourceName: raw.sourceName || null,
    revealSourceName: raw.revealSourceName || null
  };

  layer.defaultTransform = raw.defaultTransform || transformSnapshot(layer);
  return layer;
}

export function createAddonLayer({ id, name, dataUrl, width, height, canvas }) {
  const maxWidth = canvas.width * .32;
  const maxHeight = canvas.height * .46;
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  const displayWidth = Math.max(24, Math.round(width * scale));
  const displayHeight = Math.max(24, Math.round(height * scale));

  return normalizeLayer({
    id,
    name,
    category: "addons",
    parentId: "addons",
    type: "addon",
    image: dataUrl,
    x: canvas.width / 2,
    y: canvas.height / 2,
    width: displayWidth,
    height: displayHeight,
    rotation: 0,
    skewX: 0,
    skewY: 0,
    opacity: 1,
    zIndex: 800,
    visible: true,
    locked: false,
    deleted: false,
    assetStatus: "addon",
    embeddedInReference: false,
    needsReveal: false,
    anchorId: "none",
    sourceName: name
  });
}

export function layerStatus(layer) {
  if (layer.type === "reference") return { key: "reference", label: "参考层" };
  if (layer.type === "addon" && layer.image) return { key: "addon", label: "外加部件" };
  if (layer.image && (!layer.needsReveal || layer.reveal?.image)) return { key: "ready", label: "可编辑" };
  if (layer.image && layer.needsReveal && !layer.reveal?.image) return { key: "pending", label: "待补底" };
  return { key: "pending", label: "待素材" };
}

export function layerCanEdit(layer) {
  if (!layer || layer.type === "reference") return false;
  if (layer.type === "addon") return Boolean(layer.image);
  if (!layer.image) return false;
  if (layer.embeddedInReference && layer.needsReveal && !layer.reveal?.image) return false;
  return true;
}

export function layerCanDetach(layer) {
  return layerCanEdit(layer);
}

export function materialProgress(layer) {
  if (layer.type === "reference") return { current: 1, total: 1 };
  if (layer.type === "addon" || !layer.needsReveal) return { current: layer.image ? 1 : 0, total: 1 };
  return { current: Number(Boolean(layer.image)) + Number(Boolean(layer.reveal?.image)), total: 2 };
}

export function transformSnapshot(layer) {
  return {
    x: layer.x,
    y: layer.y,
    width: layer.width,
    height: layer.height,
    rotation: layer.rotation,
    skewX: layer.skewX,
    skewY: layer.skewY,
    opacity: layer.opacity
  };
}

export function applyTransform(layer, transform) {
  for (const key of ["x", "y", "width", "height", "rotation", "skewX", "skewY", "opacity"]) {
    if (Number.isFinite(transform[key])) layer[key] = transform[key];
  }
}

export function deepClone(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function slugifyAssetName(name) {
  return name
    .replace(/\.[^.]+$/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "_")
    .replace(/^_+|_+$/g, "") || "new_part";
}

export function uniqueLayerId(base, layers) {
  const used = new Set(layers.map((layer) => layer.id));
  if (!used.has(base)) return base;
  let index = 2;
  while (used.has(`${base}_${String(index).padStart(2, "0")}`)) index += 1;
  return `${base}_${String(index).padStart(2, "0")}`;
}

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
