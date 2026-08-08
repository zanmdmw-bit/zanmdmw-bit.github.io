import {
  applyTransform,
  createAddonLayer,
  deepClone,
  layerCanDetach,
  layerCanEdit,
  layerStatus,
  loadVehicleDefinition,
  materialProgress,
  normalizeLayer,
  slugifyAssetName,
  transformSnapshot,
  uniqueLayerId
} from "./vehicle-data.js";

const $ = (selector) => document.querySelector(selector);
const canvas = $("#editorCanvas");
const context = canvas.getContext("2d", { alpha: true, willReadFrequently: false });
const viewport = $("#stageViewport");
const canvasStage = $("#canvasStage");

const dom = {
  projectState: $("#projectState"),
  topProjectState: $(".project-state"),
  layerTree: $("#layerTree"),
  layerSummary: $("#layerSummary"),
  layerSearch: $("#layerSearch"),
  collapseAll: $("#collapseAllButton"),
  selectedStatus: $("#selectedStatus"),
  interactionHint: $("#interactionHint"),
  canvasSize: $("#canvasSize"),
  zoomReadout: $("#zoomReadout"),
  stageLoading: $("#stageLoading"),
  selectionIndex: $("#selectionIndex"),
  emptyInspector: $("#emptyInspector"),
  inspectorContent: $("#inspectorContent"),
  selectedName: $("#selectedName"),
  selectedId: $("#selectedId"),
  assetStatusChip: $("#assetStatusChip"),
  materialWarning: $("#materialWarning"),
  materialProgress: $("#materialProgress"),
  partAssetButton: $("#partAssetButton"),
  partAssetState: $("#partAssetState"),
  revealAssetButton: $("#revealAssetButton"),
  revealAssetState: $("#revealAssetState"),
  anchorSelect: $("#anchorSelect"),
  snapAnchorButton: $("#snapAnchorButton"),
  toggleVisibilityButton: $("#toggleVisibilityButton"),
  toggleLockButton: $("#toggleLockButton"),
  bringForwardButton: $("#bringForwardButton"),
  sendBackwardButton: $("#sendBackwardButton"),
  duplicateButton: $("#duplicateButton"),
  deleteButton: $("#deleteButton"),
  resetTransformButton: $("#resetTransformButton"),
  renameButton: $("#renameButton"),
  addAssetButton: $("#addAssetButton"),
  undoButton: $("#undoButton"),
  redoButton: $("#redoButton"),
  saveButton: $("#saveButton"),
  exportMenuButton: $("#exportMenuButton"),
  exportPopover: $("#exportPopover"),
  exportImageButton: $("#exportImageButton"),
  exportProjectButton: $("#exportProjectButton"),
  importProjectButton: $("#importProjectButton"),
  resetProjectButton: $("#resetProjectButton"),
  projectInput: $("#projectInput"),
  addonInput: $("#addonInput"),
  partInput: $("#partInput"),
  revealInput: $("#revealInput"),
  selectToolButton: $("#selectToolButton"),
  panToolButton: $("#panToolButton"),
  zoomOutButton: $("#zoomOutButton"),
  zoomInButton: $("#zoomInButton"),
  fitButton: $("#fitButton"),
  anchorToggle: $("#anchorToggle"),
  referenceToggle: $("#referenceToggle"),
  toastRegion: $("#toastRegion")
};

const fields = {
  x: $("#fieldX"),
  y: $("#fieldY"),
  width: $("#fieldWidth"),
  height: $("#fieldHeight"),
  rotation: $("#fieldRotation"),
  opacity: $("#fieldOpacity"),
  skewX: $("#fieldSkewX"),
  skewY: $("#fieldSkewY")
};

const outputs = {
  skewX: $("#skewXOutput"),
  skewY: $("#skewYOutput")
};

const state = {
  definition: null,
  initialDefinition: null,
  layers: [],
  selectedId: null,
  tool: "select",
  zoom: 1,
  panX: 0,
  panY: 0,
  fitZoom: 1,
  dragging: null,
  spaceHeld: false,
  history: [],
  future: [],
  dirty: false,
  imageCache: new Map(),
  collapsedGroups: new Set(["scene", "vehicle_core", "front_structure", "platforms", "dump_system", "wheels_far"]),
  search: "",
  anchorsVisible: false,
  referenceVisible: true,
  database: null,
  autosaveTimer: null,
  pendingAssetTarget: null
};

const DATABASE_NAME = "haulTruckEditor:v1";
const DATABASE_VERSION = 1;
const PROJECT_KEY = "current-project";

init().catch((error) => {
  console.error(error);
  dom.stageLoading.innerHTML = `<strong>编辑器载入失败</strong><span>${escapeHtml(error.message)}</span>`;
  dom.projectState.textContent = "工程载入失败";
  toast(error.message, "error", 7000);
});

async function init() {
  const definition = await loadVehicleDefinition();
  state.definition = definition;
  state.initialDefinition = deepClone(definition);
  state.layers = definition.layers;
  canvas.width = definition.canvas.width;
  canvas.height = definition.canvas.height;
  canvasStage.style.width = `${definition.canvas.width}px`;
  canvasStage.style.height = `${definition.canvas.height}px`;
  dom.canvasSize.textContent = `${definition.canvas.width} × ${definition.canvas.height} px`;

  state.database = await openDatabase().catch(() => null);
  const saved = await loadLocalProject().catch(() => null);
  if (saved?.projectId === definition.projectId && Array.isArray(saved.layers)) {
    state.layers = mergeSavedLayers(definition.layers, saved.layers);
    dom.projectState.textContent = "已恢复本机保存的工程";
  } else {
    dom.projectState.textContent = "初始工程已载入";
  }

  await preloadLayerAssets(state.layers);
  bindEvents();
  populateAnchorSelect();
  renderAll();
  requestAnimationFrame(() => {
    fitToViewport();
    dom.stageLoading.classList.add("done");
  });
}

function bindEvents() {
  window.addEventListener("resize", debounce(() => fitToViewport(false), 120));
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", (event) => {
    if (event.code === "Space") state.spaceHeld = false;
  });

  viewport.addEventListener("pointerdown", handlePointerDown);
  viewport.addEventListener("pointermove", handlePointerMove);
  viewport.addEventListener("pointerup", handlePointerUp);
  viewport.addEventListener("pointercancel", handlePointerUp);
  viewport.addEventListener("wheel", handleWheel, { passive: false });
  viewport.addEventListener("contextmenu", (event) => event.preventDefault());

  dom.layerSearch.addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLowerCase();
    renderLayerTree();
  });

  dom.collapseAll.addEventListener("click", () => {
    const all = state.definition.groups.map((group) => group.id);
    const everythingCollapsed = all.every((id) => state.collapsedGroups.has(id));
    state.collapsedGroups = everythingCollapsed ? new Set() : new Set(all);
    renderLayerTree();
  });

  dom.layerTree.addEventListener("click", handleLayerTreeClick);
  dom.addAssetButton.addEventListener("click", () => dom.addonInput.click());
  dom.partAssetButton.addEventListener("click", () => {
    if (!selectedLayer() || selectedLayer().type === "reference") return;
    state.pendingAssetTarget = selectedLayer().id;
    dom.partInput.click();
  });
  dom.revealAssetButton.addEventListener("click", () => {
    if (!selectedLayer() || selectedLayer().type === "reference") return;
    state.pendingAssetTarget = selectedLayer().id;
    dom.revealInput.click();
  });

  dom.addonInput.addEventListener("change", handleAddonImport);
  dom.partInput.addEventListener("change", handlePartImport);
  dom.revealInput.addEventListener("change", handleRevealImport);
  dom.projectInput.addEventListener("change", handleProjectImport);

  dom.undoButton.addEventListener("click", undo);
  dom.redoButton.addEventListener("click", redo);
  dom.saveButton.addEventListener("click", () => saveProject(true));
  dom.exportMenuButton.addEventListener("click", (event) => {
    event.stopPropagation();
    dom.exportPopover.classList.toggle("hidden");
  });
  dom.exportImageButton.addEventListener("click", exportImage);
  dom.exportProjectButton.addEventListener("click", exportProject);
  dom.importProjectButton.addEventListener("click", () => dom.projectInput.click());
  dom.resetProjectButton.addEventListener("click", resetProject);
  document.addEventListener("click", (event) => {
    if (!dom.exportPopover.contains(event.target) && event.target !== dom.exportMenuButton) dom.exportPopover.classList.add("hidden");
  });

  dom.selectToolButton.addEventListener("click", () => setTool("select"));
  dom.panToolButton.addEventListener("click", () => setTool("pan"));
  dom.zoomOutButton.addEventListener("click", () => setZoom(state.zoom / 1.16));
  dom.zoomInButton.addEventListener("click", () => setZoom(state.zoom * 1.16));
  dom.fitButton.addEventListener("click", () => fitToViewport());
  dom.zoomReadout.addEventListener("click", () => fitToViewport());
  dom.anchorToggle.addEventListener("change", (event) => {
    state.anchorsVisible = event.target.checked;
    renderCanvas();
  });
  dom.referenceToggle.addEventListener("change", (event) => {
    state.referenceVisible = event.target.checked;
    renderCanvas();
  });

  dom.renameButton.addEventListener("click", renameSelected);
  dom.resetTransformButton.addEventListener("click", resetSelectedTransform);
  dom.snapAnchorButton.addEventListener("click", snapSelectedToAnchor);
  dom.anchorSelect.addEventListener("change", () => {
    const layer = selectedLayer();
    if (!layer) return;
    commitMutation(() => { layer.anchorId = dom.anchorSelect.value; });
  });
  dom.toggleVisibilityButton.addEventListener("click", toggleSelectedVisibility);
  dom.toggleLockButton.addEventListener("click", toggleSelectedLock);
  dom.bringForwardButton.addEventListener("click", () => moveSelectedLayer(1));
  dom.sendBackwardButton.addEventListener("click", () => moveSelectedLayer(-1));
  dom.duplicateButton.addEventListener("click", duplicateSelected);
  dom.deleteButton.addEventListener("click", deleteOrRestoreSelected);

  for (const [key, input] of Object.entries(fields)) {
    input.addEventListener("change", () => updateSelectedField(key, input.value));
  }
  fields.skewX.addEventListener("input", () => { outputs.skewX.textContent = `${fields.skewX.value}°`; });
  fields.skewY.addEventListener("input", () => { outputs.skewY.textContent = `${fields.skewY.value}°`; });
}

function renderAll() {
  renderLayerTree();
  renderInspector();
  renderCanvas();
  updateHistoryButtons();
  updateProjectState();
}

function renderLayerTree() {
  const groups = state.definition.groups;
  const groupChildren = new Map();
  for (const group of groups) {
    const key = group.parentId || "__root__";
    if (!groupChildren.has(key)) groupChildren.set(key, []);
    groupChildren.get(key).push(group);
  }

  const query = state.search;
  const matching = (layer) => !query || `${layer.name} ${layer.id}`.toLowerCase().includes(query);
  const descendants = (groupId) => state.layers.filter((layer) => layer.parentId === groupId || layer.category === groupId).filter(matching);

  function groupHasMatch(groupId) {
    if (descendants(groupId).length) return true;
    return (groupChildren.get(groupId) || []).some((group) => groupHasMatch(group.id));
  }

  function renderGroup(group, depth = 0) {
    if (query && !groupHasMatch(group.id) && !group.name.toLowerCase().includes(query)) return "";
    const directLayers = state.layers.filter((layer) => (layer.parentId === group.id || layer.category === group.id) && matching(layer));
    const childGroups = groupChildren.get(group.id) || [];
    const open = query || !state.collapsedGroups.has(group.id);
    const count = countGroupLayers(group.id);
    const children = [
      ...childGroups.map((child) => renderGroup(child, depth + 1)),
      ...directLayers.map((layer) => renderLayerRow(layer, depth + 1))
    ].join("");

    return `<section class="layer-group ${open ? "open" : ""}" data-group="${escapeAttr(group.id)}" style="--depth:${depth}">
      <button class="group-row" type="button" data-group-toggle="${escapeAttr(group.id)}" role="treeitem" aria-expanded="${open}">
        <span class="group-chevron">›</span><span>${escapeHtml(group.name)}</span><span class="group-count">${count}</span>
      </button>
      <div class="group-children" role="group">${children}</div>
    </section>`;
  }

  const rootGroups = groupChildren.get("__root__") || [];
  dom.layerTree.innerHTML = rootGroups.map((group) => renderGroup(group)).join("") || `<div class="panel-note"><p>没有匹配的部件。</p></div>`;

  const editable = state.layers.filter((layer) => layerCanEdit(layer)).length;
  const pending = state.layers.filter((layer) => layer.type !== "reference" && !layerCanEdit(layer)).length;
  const addons = state.layers.filter((layer) => layer.type === "addon" && layer.image).length;
  dom.layerSummary.innerHTML = `
    <div class="summary-cell ready"><b>${editable}</b><small>可编辑</small></div>
    <div class="summary-cell pending"><b>${pending}</b><small>待素材</small></div>
    <div class="summary-cell"><b>${addons}</b><small>外加部件</small></div>`;
}

function renderLayerRow(layer, depth) {
  const status = layerStatus(layer);
  const canToggle = layerCanDetach(layer) || layer.type === "reference";
  const visibleIcon = layer.visible && !layer.deleted ? "◉" : "○";
  const lockIcon = layer.locked ? "▣" : "□";
  const classes = [
    "layer-row",
    layer.id === state.selectedId ? "selected" : "",
    layer.deleted ? "deleted" : "",
    !layer.visible ? "hidden-layer" : ""
  ].filter(Boolean).join(" ");

  return `<div class="${classes}" style="--depth:${depth}" data-layer-id="${escapeAttr(layer.id)}" role="treeitem" aria-selected="${layer.id === state.selectedId}">
    <span class="layer-status ${status.key}" title="${escapeAttr(status.label)}"></span>
    <span class="layer-name" title="${escapeAttr(layer.name)}">${escapeHtml(layer.name)}</span>
    <span class="layer-actions">
      <button class="mini-action" type="button" data-layer-action="visibility" data-layer-id="${escapeAttr(layer.id)}" ${canToggle ? "" : "disabled"} title="显示或隐藏">${visibleIcon}</button>
      <button class="mini-action" type="button" data-layer-action="lock" data-layer-id="${escapeAttr(layer.id)}" ${layerCanEdit(layer) ? "" : "disabled"} title="锁定或解锁">${lockIcon}</button>
    </span>
  </div>`;
}

function renderInspector() {
  const layer = selectedLayer();
  if (!layer) {
    dom.emptyInspector.classList.remove("hidden");
    dom.inspectorContent.classList.add("hidden");
    dom.selectionIndex.textContent = "—";
    dom.selectedStatus.textContent = "未选择部件";
    return;
  }

  dom.emptyInspector.classList.add("hidden");
  dom.inspectorContent.classList.remove("hidden");
  const index = state.layers.findIndex((item) => item.id === layer.id) + 1;
  const status = layerStatus(layer);
  const progress = materialProgress(layer);
  const editable = layerCanEdit(layer);
  const unlocked = editable && !layer.locked && !layer.deleted;

  dom.selectionIndex.textContent = `${String(index).padStart(2, "0")} / ${String(state.layers.length).padStart(2, "0")}`;
  dom.selectedName.textContent = layer.name;
  dom.selectedId.textContent = layer.id;
  dom.selectedStatus.textContent = layer.name;
  dom.assetStatusChip.className = `status-chip ${status.key}`;
  dom.assetStatusChip.textContent = status.label;
  dom.materialProgress.textContent = `${progress.current} / ${progress.total}`;
  dom.partAssetState.textContent = layer.image ? (layer.sourceName || "已载入，可替换") : "点击导入";
  dom.partAssetButton.classList.toggle("ready", Boolean(layer.image));
  dom.revealAssetState.textContent = layer.reveal?.image ? (layer.revealSourceName || "已载入，可替换") : (layer.needsReveal ? "点击导入" : "不需要");
  dom.revealAssetButton.classList.toggle("ready", Boolean(layer.reveal?.image));
  dom.revealAssetButton.disabled = layer.type === "reference" || !layer.needsReveal;
  dom.partAssetButton.disabled = layer.type === "reference";

  dom.materialWarning.className = "material-warning";
  if (layer.type === "reference") {
    dom.materialWarning.textContent = "锁定校准层：它暂时承载尚未完成分层的原车像素，不会被当作可拆部件。";
  } else if (editable) {
    dom.materialWarning.classList.add("success");
    dom.materialWarning.textContent = layer.type === "addon"
      ? "这是独立外加素材，可以完整移动、隐藏、复制和导出。"
      : "部件透明图与拆除补底已齐全：隐藏后会露出补全区域，而不是原图残影。";
  } else if (layer.image && layer.needsReveal) {
    dom.materialWarning.textContent = "已有部件透明图，但缺少拆除补底。为避免移动后露出原图残影，编辑功能仍保持锁定。";
  } else if (!layer.embeddedInReference && !layer.image) {
    dom.materialWarning.textContent = layer.note || "该结构在原图中不可完整提取，需要新建符合当前透视的透明素材。";
  } else {
    dom.materialWarning.textContent = layer.note || "该部件仍属于参考原图。需要透明部件图和背后补图，完成后才能真正拆装。";
  }

  const values = {
    x: Math.round(layer.x * 100) / 100,
    y: Math.round(layer.y * 100) / 100,
    width: Math.round(layer.width * 100) / 100,
    height: Math.round(layer.height * 100) / 100,
    rotation: Math.round(layer.rotation * 100) / 100,
    opacity: Math.round(layer.opacity * 100),
    skewX: Math.round(layer.skewX),
    skewY: Math.round(layer.skewY)
  };
  for (const [key, input] of Object.entries(fields)) {
    input.value = values[key];
    input.disabled = !unlocked;
  }
  outputs.skewX.textContent = `${values.skewX}°`;
  outputs.skewY.textContent = `${values.skewY}°`;

  dom.anchorSelect.value = layer.anchorId || "none";
  dom.anchorSelect.disabled = !unlocked;
  dom.snapAnchorButton.disabled = !unlocked || !layer.anchorId || layer.anchorId === "none";
  dom.resetTransformButton.disabled = !unlocked;
  dom.toggleVisibilityButton.disabled = !layerCanDetach(layer);
  dom.toggleVisibilityButton.textContent = layer.visible && !layer.deleted ? "隐藏" : "显示";
  dom.toggleLockButton.disabled = !editable || layer.deleted;
  dom.toggleLockButton.textContent = layer.locked ? "解锁" : "锁定";
  dom.bringForwardButton.disabled = !unlocked;
  dom.sendBackwardButton.disabled = !unlocked;
  dom.duplicateButton.disabled = !unlocked;
  dom.deleteButton.disabled = !layerCanDetach(layer);
  dom.deleteButton.textContent = layer.deleted ? "恢复" : "拆除";
  dom.renameButton.disabled = layer.type === "reference";
}

function renderCanvas(targetContext = context, options = {}) {
  const targetCanvas = targetContext.canvas;
  const width = state.definition.canvas.width;
  const height = state.definition.canvas.height;
  targetContext.save();
  targetContext.setTransform(1, 0, 0, 1, 0, 0);
  targetContext.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
  targetContext.fillStyle = state.definition.canvas.background || "#1a1c1d";
  targetContext.fillRect(0, 0, width, height);

  const sorted = [...state.layers].sort((a, b) => a.zIndex - b.zIndex);
  const referenceLayers = sorted.filter((layer) => layer.type === "reference" || layer.type === "base");
  const componentLayers = sorted.filter((layer) => layer.type !== "reference" && layer.type !== "base");

  for (const layer of referenceLayers) {
    if (layer.type === "reference" && !state.referenceVisible) continue;
    if (!layer.visible || layer.deleted || !layer.image) continue;
    drawImageLayer(targetContext, layer.image, layer);
  }

  for (const layer of componentLayers) {
    if (!layer.reveal?.image || !layer.embeddedInReference) continue;
    drawImageLayer(targetContext, layer.reveal.image, layer.reveal, layer);
  }

  for (const layer of componentLayers) {
    if (!layer.image || !layer.visible || layer.deleted) continue;
    if (layer.embeddedInReference && layer.needsReveal && !layer.reveal?.image) continue;
    drawImageLayer(targetContext, layer.image, layer);
  }

  if (!options.exporting) {
    if (state.anchorsVisible) drawAnchors(targetContext);
    drawSelection(targetContext);
    drawCanvasBadge(targetContext);
  }
  targetContext.restore();
}

function drawImageLayer(ctx, source, transform, fallback = transform) {
  const record = state.imageCache.get(source);
  if (!record?.image) return;
  const values = {
    x: finite(transform.x, fallback.x),
    y: finite(transform.y, fallback.y),
    width: Math.max(1, finite(transform.width, fallback.width)),
    height: Math.max(1, finite(transform.height, fallback.height)),
    rotation: finite(transform.rotation, fallback.rotation),
    skewX: finite(transform.skewX, fallback.skewX),
    skewY: finite(transform.skewY, fallback.skewY),
    opacity: finite(transform.opacity, fallback.opacity)
  };
  const radians = values.rotation * Math.PI / 180;
  const skewX = Math.tan(values.skewX * Math.PI / 180);
  const skewY = Math.tan(values.skewY * Math.PI / 180);
  ctx.save();
  ctx.globalAlpha = clamp(values.opacity, 0, 1);
  ctx.translate(values.x, values.y);
  ctx.rotate(radians);
  ctx.transform(1, skewY, skewX, 1, 0, 0);
  ctx.drawImage(record.image, -values.width / 2, -values.height / 2, values.width, values.height);
  ctx.restore();
}

function drawSelection(ctx) {
  const layer = selectedLayer();
  if (!layer) return;
  const editable = layerCanEdit(layer);
  const matrix = transformMatrix(layer);
  ctx.save();
  ctx.setTransform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f);
  ctx.lineWidth = 1.2 / Math.max(state.zoom, .2);
  ctx.setLineDash(editable ? [5, 4] : [3, 3]);
  ctx.strokeStyle = editable ? "#f0bb68" : "#c79054";
  ctx.fillStyle = editable ? "rgba(240,187,104,.08)" : "rgba(199,144,84,.06)";
  ctx.fillRect(-layer.width / 2, -layer.height / 2, layer.width, layer.height);
  ctx.strokeRect(-layer.width / 2, -layer.height / 2, layer.width, layer.height);
  ctx.setLineDash([]);
  const handle = 5 / Math.max(state.zoom, .2);
  for (const [x, y] of [[-layer.width / 2, -layer.height / 2], [layer.width / 2, -layer.height / 2], [layer.width / 2, layer.height / 2], [-layer.width / 2, layer.height / 2]]) {
    ctx.fillStyle = editable ? "#f0bb68" : "#8d6742";
    ctx.fillRect(x - handle / 2, y - handle / 2, handle, handle);
  }
  ctx.restore();

  if (!editable) {
    const label = layer.embeddedInReference ? "待透明部件＋拆除补底" : "待新建透明素材";
    const x = clamp(layer.x - layer.width / 2, 6, state.definition.canvas.width - 180);
    const y = clamp(layer.y - layer.height / 2 - 22, 6, state.definition.canvas.height - 26);
    ctx.save();
    ctx.font = "10px Microsoft YaHei, sans-serif";
    ctx.fillStyle = "rgba(20,17,13,.88)";
    ctx.fillRect(x, y, 156, 18);
    ctx.fillStyle = "#ddb477";
    ctx.fillText(label, x + 7, y + 12.5);
    ctx.restore();
  }
}

function drawAnchors(ctx) {
  ctx.save();
  ctx.font = "9px Microsoft YaHei, sans-serif";
  for (const anchor of state.definition.anchors.filter((item) => item.id !== "none")) {
    ctx.beginPath();
    ctx.arc(anchor.x, anchor.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(117,169,214,.9)";
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#e5f3ff";
    ctx.stroke();
    const width = ctx.measureText(anchor.name).width + 10;
    ctx.fillStyle = "rgba(11,16,20,.78)";
    ctx.fillRect(anchor.x + 8, anchor.y - 9, width, 17);
    ctx.fillStyle = "#cbe5fa";
    ctx.fillText(anchor.name, anchor.x + 13, anchor.y + 3);
  }
  ctx.restore();
}

function drawCanvasBadge(ctx) {
  const pending = state.layers.filter((layer) => layer.type !== "reference" && !layerCanEdit(layer)).length;
  ctx.save();
  ctx.fillStyle = "rgba(12,14,15,.8)";
  ctx.fillRect(9, 9, 176, 24);
  ctx.fillStyle = "#d8b27c";
  ctx.font = "9px Microsoft YaHei, sans-serif";
  ctx.fillText(`参考合成模式 · ${pending} 个部件待素材`, 18, 24.5);
  ctx.restore();
}

function handleLayerTreeClick(event) {
  const groupToggle = event.target.closest("[data-group-toggle]");
  if (groupToggle) {
    const id = groupToggle.dataset.groupToggle;
    state.collapsedGroups.has(id) ? state.collapsedGroups.delete(id) : state.collapsedGroups.add(id);
    renderLayerTree();
    return;
  }

  const action = event.target.closest("[data-layer-action]");
  if (action) {
    event.stopPropagation();
    const layer = state.layers.find((item) => item.id === action.dataset.layerId);
    if (!layer) return;
    selectLayer(layer.id);
    if (action.dataset.layerAction === "visibility") toggleSelectedVisibility();
    if (action.dataset.layerAction === "lock") toggleSelectedLock();
    return;
  }

  const row = event.target.closest("[data-layer-id]");
  if (row) selectLayer(row.dataset.layerId);
}

function selectLayer(id) {
  state.selectedId = id;
  renderLayerTree();
  renderInspector();
  renderCanvas();
}

function selectedLayer() {
  return state.layers.find((layer) => layer.id === state.selectedId) || null;
}

function handlePointerDown(event) {
  viewport.setPointerCapture(event.pointerId);
  const point = clientToCanvas(event.clientX, event.clientY);
  if (state.tool === "pan" || state.spaceHeld || event.button === 1) {
    state.dragging = { type: "pan", startX: event.clientX, startY: event.clientY, panX: state.panX, panY: state.panY };
    viewport.classList.add("panning");
    return;
  }

  const hit = hitTest(point.x, point.y);
  if (!hit) {
    state.selectedId = null;
    renderAll();
    return;
  }

  selectLayer(hit.id);
  if (!layerCanEdit(hit) || hit.locked || hit.deleted) return;
  pushHistory();
  state.dragging = { type: "layer", id: hit.id, startX: point.x, startY: point.y, x: hit.x, y: hit.y, changed: false };
  dom.interactionHint.textContent = "拖动部件；松开后自动记录操作";
}

function handlePointerMove(event) {
  if (!state.dragging) return;
  if (state.dragging.type === "pan") {
    state.panX = state.dragging.panX + event.clientX - state.dragging.startX;
    state.panY = state.dragging.panY + event.clientY - state.dragging.startY;
    applyStageTransform();
    return;
  }
  if (state.dragging.type === "layer") {
    const point = clientToCanvas(event.clientX, event.clientY);
    const layer = state.layers.find((item) => item.id === state.dragging.id);
    if (!layer) return;
    layer.x = state.dragging.x + point.x - state.dragging.startX;
    layer.y = state.dragging.y + point.y - state.dragging.startY;
    state.dragging.changed = true;
    markDirty();
    renderCanvas();
    renderInspector();
  }
}

function handlePointerUp(event) {
  if (!state.dragging) return;
  if (state.dragging.type === "layer" && !state.dragging.changed) state.history.pop();
  state.dragging = null;
  viewport.classList.remove("panning");
  dom.interactionHint.textContent = "滚轮缩放；空格拖动画布；方向键微调部件";
  updateHistoryButtons();
  scheduleAutosave();
  try { viewport.releasePointerCapture(event.pointerId); } catch {}
}

function handleWheel(event) {
  event.preventDefault();
  const rect = viewport.getBoundingClientRect();
  const cursorX = event.clientX - rect.left;
  const cursorY = event.clientY - rect.top;
  const beforeX = (cursorX - state.panX) / state.zoom;
  const beforeY = (cursorY - state.panY) / state.zoom;
  const factor = event.deltaY < 0 ? 1.1 : .9;
  const next = clamp(state.zoom * factor, .12, 6);
  state.zoom = next;
  state.panX = cursorX - beforeX * next;
  state.panY = cursorY - beforeY * next;
  applyStageTransform();
}

function hitTest(x, y) {
  const candidates = [...state.layers]
    .filter((layer) => layer.image && layer.visible && !layer.deleted && layerCanEdit(layer) && layer.type !== "reference")
    .sort((a, b) => b.zIndex - a.zIndex);

  for (const layer of candidates) {
    const local = inverseTransformPoint(layer, x, y);
    if (Math.abs(local.x) > layer.width / 2 || Math.abs(local.y) > layer.height / 2) continue;
    const record = state.imageCache.get(layer.image);
    if (!record?.alphaContext) return layer;
    const pixelX = Math.floor((local.x + layer.width / 2) / layer.width * record.image.naturalWidth);
    const pixelY = Math.floor((local.y + layer.height / 2) / layer.height * record.image.naturalHeight);
    try {
      const alpha = record.alphaContext.getImageData(pixelX, pixelY, 1, 1).data[3];
      if (alpha > 20) return layer;
    } catch {
      return layer;
    }
  }
  return null;
}

function transformMatrix(layer) {
  const rotation = layer.rotation * Math.PI / 180;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const kx = Math.tan(layer.skewX * Math.PI / 180);
  const ky = Math.tan(layer.skewY * Math.PI / 180);
  return new DOMMatrix([
    cos - sin * ky,
    sin + cos * ky,
    cos * kx - sin,
    sin * kx + cos,
    layer.x,
    layer.y
  ]);
}

function inverseTransformPoint(layer, x, y) {
  try {
    const inverse = transformMatrix(layer).inverse();
    const point = new DOMPoint(x, y).matrixTransform(inverse);
    return { x: point.x, y: point.y };
  } catch {
    return { x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY };
  }
}

async function handleAddonImport(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  try {
    const dataUrl = await readFileAsDataUrl(file);
    const record = await loadAsset(dataUrl);
    const base = slugifyAssetName(file.name);
    const id = uniqueLayerId(`addon_${base}`, state.layers);
    const layer = createAddonLayer({
      id,
      name: file.name.replace(/\.[^.]+$/, ""),
      dataUrl,
      width: record.image.naturalWidth,
      height: record.image.naturalHeight,
      canvas: state.definition.canvas
    });
    pushHistory();
    state.layers.push(layer);
    state.selectedId = layer.id;
    markDirty();
    renderAll();
    toast(`已添加独立部件：${layer.name}`);
  } catch (error) {
    toast(`素材导入失败：${error.message}`, "error");
  }
}

async function handlePartImport(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  const layer = state.layers.find((item) => item.id === state.pendingAssetTarget);
  state.pendingAssetTarget = null;
  if (!file || !layer) return;
  try {
    const dataUrl = await readFileAsDataUrl(file);
    await loadAsset(dataUrl);
    pushHistory();
    layer.image = dataUrl;
    layer.sourceName = file.name;
    layer.assetStatus = layer.type === "addon" ? "addon" : "ready";
    layer.visible = true;
    if (layerCanEdit(layer)) layer.locked = false;
    markDirty();
    renderAll();
    toast(layer.needsReveal && !layer.reveal?.image
      ? `${layer.name}的透明图已载入；补齐拆除补底后才会解锁。`
      : `${layer.name}的部件素材已载入。`);
  } catch (error) {
    toast(`部件素材导入失败：${error.message}`, "error");
  }
}

async function handleRevealImport(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  const layer = state.layers.find((item) => item.id === state.pendingAssetTarget);
  state.pendingAssetTarget = null;
  if (!file || !layer) return;
  try {
    const dataUrl = await readFileAsDataUrl(file);
    const record = await loadAsset(dataUrl);
    pushHistory();
    const fullCanvas = record.image.naturalWidth === state.definition.canvas.width && record.image.naturalHeight === state.definition.canvas.height;
    layer.reveal = {
      image: dataUrl,
      x: fullCanvas ? state.definition.canvas.width / 2 : layer.x,
      y: fullCanvas ? state.definition.canvas.height / 2 : layer.y,
      width: fullCanvas ? state.definition.canvas.width : Math.max(layer.width, record.image.naturalWidth),
      height: fullCanvas ? state.definition.canvas.height : Math.max(layer.height, record.image.naturalHeight),
      rotation: fullCanvas ? 0 : layer.rotation,
      skewX: 0,
      skewY: 0,
      opacity: 1
    };
    layer.revealSourceName = file.name;
    if (layerCanEdit(layer)) layer.locked = false;
    markDirty();
    renderAll();
    toast(layer.image
      ? `${layer.name}已具备透明部件和拆除补底，现在可以真正拆装。`
      : `${layer.name}的补底已载入；还需要透明部件图。`);
  } catch (error) {
    toast(`补底素材导入失败：${error.message}`, "error");
  }
}

function updateSelectedField(key, rawValue) {
  const layer = selectedLayer();
  if (!layer || !layerCanEdit(layer) || layer.locked || layer.deleted) return;
  const number = Number(rawValue);
  if (!Number.isFinite(number)) return;
  pushHistory();
  if (key === "opacity") layer.opacity = clamp(number / 100, 0, 1);
  else if (key === "width" || key === "height") layer[key] = Math.max(1, number);
  else layer[key] = number;
  markDirty();
  renderAll();
}

function toggleSelectedVisibility() {
  const layer = selectedLayer();
  if (!layer || !layerCanDetach(layer)) return;
  pushHistory();
  layer.visible = !layer.visible;
  if (layer.deleted && layer.visible) layer.deleted = false;
  markDirty();
  renderAll();
}

function toggleSelectedLock() {
  const layer = selectedLayer();
  if (!layer || !layerCanEdit(layer) || layer.deleted) return;
  pushHistory();
  layer.locked = !layer.locked;
  markDirty();
  renderAll();
}

function deleteOrRestoreSelected() {
  const layer = selectedLayer();
  if (!layer || !layerCanDetach(layer)) return;
  pushHistory();
  layer.deleted = !layer.deleted;
  layer.visible = !layer.deleted;
  markDirty();
  renderAll();
}

function moveSelectedLayer(direction) {
  const layer = selectedLayer();
  if (!layer || !layerCanEdit(layer) || layer.locked || layer.deleted) return;
  pushHistory();
  layer.zIndex += direction;
  markDirty();
  renderAll();
}

function duplicateSelected() {
  const layer = selectedLayer();
  if (!layer || !layerCanEdit(layer) || layer.locked || layer.deleted) return;
  pushHistory();
  const copy = normalizeLayer(deepClone(layer));
  copy.id = uniqueLayerId(`${layer.id}_copy`, state.layers);
  copy.name = `${layer.name} 副本`;
  copy.x += 18;
  copy.y += 18;
  copy.zIndex += 1;
  copy.type = "addon";
  copy.category = "addons";
  copy.parentId = "addons";
  copy.embeddedInReference = false;
  copy.needsReveal = false;
  copy.reveal = null;
  copy.assetStatus = "addon";
  copy.defaultTransform = transformSnapshot(copy);
  state.layers.push(copy);
  state.selectedId = copy.id;
  markDirty();
  renderAll();
}

function resetSelectedTransform() {
  const layer = selectedLayer();
  if (!layer || !layerCanEdit(layer) || layer.locked || layer.deleted) return;
  pushHistory();
  applyTransform(layer, layer.defaultTransform);
  markDirty();
  renderAll();
}

function snapSelectedToAnchor() {
  const layer = selectedLayer();
  if (!layer || !layerCanEdit(layer) || layer.locked || layer.deleted) return;
  const anchor = state.definition.anchors.find((item) => item.id === dom.anchorSelect.value);
  if (!anchor || anchor.id === "none") return;
  pushHistory();
  layer.anchorId = anchor.id;
  layer.x = anchor.x;
  layer.y = anchor.y;
  layer.rotation = anchor.rotation || 0;
  markDirty();
  renderAll();
  toast(`${layer.name}已吸附到“${anchor.name}”`);
}

function renameSelected() {
  const layer = selectedLayer();
  if (!layer || layer.type === "reference") return;
  const next = window.prompt("输入新的部件名称", layer.name)?.trim();
  if (!next || next === layer.name) return;
  pushHistory();
  layer.name = next;
  markDirty();
  renderAll();
}

function setTool(tool) {
  state.tool = tool;
  dom.selectToolButton.classList.toggle("active", tool === "select");
  dom.panToolButton.classList.toggle("active", tool === "pan");
  viewport.style.cursor = tool === "pan" ? "grab" : "default";
  dom.interactionHint.textContent = tool === "pan" ? "拖动画布；滚轮缩放" : "点击真实透明素材进行选择和拖动";
}

function fitToViewport(reset = true) {
  const rect = viewport.getBoundingClientRect();
  if (rect.width < 50 || rect.height < 50) return;
  const padding = 28;
  const zoom = Math.min((rect.width - padding * 2) / state.definition.canvas.width, (rect.height - padding * 2) / state.definition.canvas.height);
  state.fitZoom = clamp(zoom, .12, 2);
  if (reset) state.zoom = state.fitZoom;
  state.panX = (rect.width - state.definition.canvas.width * state.zoom) / 2;
  state.panY = (rect.height - state.definition.canvas.height * state.zoom) / 2;
  applyStageTransform();
}

function setZoom(zoom) {
  const rect = viewport.getBoundingClientRect();
  const centerX = rect.width / 2;
  const centerY = rect.height / 2;
  const beforeX = (centerX - state.panX) / state.zoom;
  const beforeY = (centerY - state.panY) / state.zoom;
  state.zoom = clamp(zoom, .12, 6);
  state.panX = centerX - beforeX * state.zoom;
  state.panY = centerY - beforeY * state.zoom;
  applyStageTransform();
}

function applyStageTransform() {
  canvasStage.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
  dom.zoomReadout.textContent = `${Math.round(state.zoom * 100)}%`;
}

function clientToCanvas(clientX, clientY) {
  const rect = viewport.getBoundingClientRect();
  return {
    x: (clientX - rect.left - state.panX) / state.zoom,
    y: (clientY - rect.top - state.panY) / state.zoom
  };
}

function handleKeyDown(event) {
  if (event.code === "Space" && !isTypingTarget(event.target)) {
    event.preventDefault();
    state.spaceHeld = true;
  }
  if (isTypingTarget(event.target)) return;
  const command = event.ctrlKey || event.metaKey;
  if (command && event.key.toLowerCase() === "z") {
    event.preventDefault();
    event.shiftKey ? redo() : undo();
    return;
  }
  if (command && event.key.toLowerCase() === "y") {
    event.preventDefault();
    redo();
    return;
  }
  if (command && event.key.toLowerCase() === "s") {
    event.preventDefault();
    saveProject(true);
    return;
  }
  if (event.key === "Escape") {
    state.selectedId = null;
    renderAll();
    return;
  }
  if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    deleteOrRestoreSelected();
    return;
  }
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
    const layer = selectedLayer();
    if (!layer || !layerCanEdit(layer) || layer.locked || layer.deleted) return;
    event.preventDefault();
    pushHistory();
    const step = event.shiftKey ? 10 : 1;
    if (event.key === "ArrowLeft") layer.x -= step;
    if (event.key === "ArrowRight") layer.x += step;
    if (event.key === "ArrowUp") layer.y -= step;
    if (event.key === "ArrowDown") layer.y += step;
    markDirty();
    renderAll();
  }
}

function pushHistory() {
  state.history.push(snapshotLayers());
  if (state.history.length > 60) state.history.shift();
  state.future = [];
  updateHistoryButtons();
}

function undo() {
  const previous = state.history.pop();
  if (!previous) return;
  state.future.push(snapshotLayers());
  restoreSnapshot(previous);
}

function redo() {
  const next = state.future.pop();
  if (!next) return;
  state.history.push(snapshotLayers());
  restoreSnapshot(next);
}

function restoreSnapshot(snapshot) {
  state.layers = snapshot.map((layer) => normalizeLayer(layer));
  if (!state.layers.some((layer) => layer.id === state.selectedId)) state.selectedId = null;
  preloadLayerAssets(state.layers).then(renderAll);
  markDirty();
  updateHistoryButtons();
}

function snapshotLayers() {
  return deepClone(state.layers);
}

function commitMutation(fn) {
  pushHistory();
  fn();
  markDirty();
  renderAll();
}

function markDirty() {
  state.dirty = true;
  updateProjectState();
  scheduleAutosave();
}

function updateProjectState() {
  dom.topProjectState.classList.toggle("dirty", state.dirty);
  if (state.dirty) dom.projectState.textContent = "有尚未手动保存的修改（已自动保存在本机）";
}

function updateHistoryButtons() {
  dom.undoButton.disabled = !state.history.length;
  dom.redoButton.disabled = !state.future.length;
}

function scheduleAutosave() {
  window.clearTimeout(state.autosaveTimer);
  state.autosaveTimer = window.setTimeout(() => saveProject(false), 600);
}

async function saveProject(showToast) {
  const payload = projectPayload();
  if (state.database) {
    await databasePut(PROJECT_KEY, payload).catch(() => null);
  }
  state.dirty = false;
  dom.projectState.textContent = `已保存在本机 · ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
  updateProjectState();
  if (showToast) toast("工程已保存在当前浏览器。需要跨设备时，请导出工程 JSON。");
}

function projectPayload() {
  return {
    schemaVersion: state.definition.schemaVersion,
    projectId: state.definition.projectId,
    title: state.definition.title,
    savedAt: new Date().toISOString(),
    canvas: state.definition.canvas,
    orientation: state.definition.orientation,
    anchors: state.definition.anchors,
    groups: state.definition.groups,
    layers: snapshotLayers()
  };
}

async function exportImage() {
  dom.exportPopover.classList.add("hidden");
  const output = document.createElement("canvas");
  output.width = state.definition.canvas.width;
  output.height = state.definition.canvas.height;
  const outputContext = output.getContext("2d");
  renderCanvas(outputContext, { exporting: true });
  const blob = await new Promise((resolve) => output.toBlob(resolve, "image/png"));
  if (!blob) return toast("图片导出失败。", "error");
  downloadBlob(blob, `矿卡改装-${dateStamp()}.png`);
  toast("当前画面已导出为 PNG。辅助线和选中框不会进入图片。");
}

function exportProject() {
  dom.exportPopover.classList.add("hidden");
  const blob = new Blob([JSON.stringify(projectPayload(), null, 2)], { type: "application/json;charset=utf-8" });
  downloadBlob(blob, `矿卡工程-${dateStamp()}.json`);
  toast("工程 JSON 已导出，其中包含临时导入的素材数据。");
}

async function handleProjectImport(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    if (payload.projectId !== state.definition.projectId || !Array.isArray(payload.layers)) throw new Error("不是当前矿卡编辑器的有效工程文件");
    pushHistory();
    state.layers = payload.layers.map((layer) => normalizeLayer(layer));
    state.selectedId = null;
    await preloadLayerAssets(state.layers);
    markDirty();
    renderAll();
    toast("工程文件已导入。");
  } catch (error) {
    toast(`工程导入失败：${error.message}`, "error");
  }
}

function resetProject() {
  dom.exportPopover.classList.add("hidden");
  if (!window.confirm("确定重置整个工程吗？临时添加的部件和所有位置修改都会被清除。")) return;
  pushHistory();
  state.layers = deepClone(state.initialDefinition.layers).map((layer) => normalizeLayer(layer));
  state.selectedId = null;
  state.referenceVisible = true;
  dom.referenceToggle.checked = true;
  markDirty();
  preloadLayerAssets(state.layers).then(renderAll);
  toast("工程已恢复到初始部件树。撤销仍可找回刚才的状态。");
}

async function preloadLayerAssets(layers) {
  const sources = new Set();
  for (const layer of layers) {
    if (layer.image) sources.add(layer.image);
    if (layer.reveal?.image) sources.add(layer.reveal.image);
  }
  await Promise.all([...sources].map((source) => loadAsset(source).catch((error) => {
    console.warn("Asset failed", source, error);
  })));
}

function loadAsset(source) {
  if (state.imageCache.has(source)) return state.imageCache.get(source).promise;
  const record = {};
  record.promise = new Promise((resolve, reject) => {
    const image = new Image();
    if (!source.startsWith("data:")) image.crossOrigin = "anonymous";
    image.onload = () => {
      record.image = image;
      const alphaCanvas = document.createElement("canvas");
      alphaCanvas.width = image.naturalWidth;
      alphaCanvas.height = image.naturalHeight;
      const alphaContext = alphaCanvas.getContext("2d", { willReadFrequently: true });
      alphaContext.drawImage(image, 0, 0);
      record.alphaCanvas = alphaCanvas;
      record.alphaContext = alphaContext;
      resolve(record);
    };
    image.onerror = () => reject(new Error("图片无法读取"));
    image.src = source;
  });
  state.imageCache.set(source, record);
  return record.promise;
}

function populateAnchorSelect() {
  dom.anchorSelect.innerHTML = state.definition.anchors.map((anchor) => `<option value="${escapeAttr(anchor.id)}">${escapeHtml(anchor.name)}</option>`).join("");
}

function countGroupLayers(groupId) {
  const childGroupIds = state.definition.groups.filter((group) => group.parentId === groupId).map((group) => group.id);
  const direct = state.layers.filter((layer) => layer.parentId === groupId || layer.category === groupId).length;
  return direct + childGroupIds.reduce((sum, id) => sum + countGroupLayers(id), 0);
}

function mergeSavedLayers(initial, saved) {
  const initialMap = new Map(initial.map((layer) => [layer.id, normalizeLayer(layer)]));
  const merged = [];
  for (const raw of saved) {
    const normalized = normalizeLayer(raw);
    const base = initialMap.get(normalized.id);
    if (base) {
      normalized.note ||= base.note;
      normalized.defaultTransform ||= base.defaultTransform;
      initialMap.delete(normalized.id);
    }
    merged.push(normalized);
  }
  merged.push(...initialMap.values());
  return merged;
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) return reject(new Error("IndexedDB unavailable"));
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("projects")) database.createObjectStore("projects");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function databasePut(key, value) {
  return new Promise((resolve, reject) => {
    const transaction = state.database.transaction("projects", "readwrite");
    transaction.objectStore("projects").put(value, key);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
}

function loadLocalProject() {
  return new Promise((resolve, reject) => {
    if (!state.database) return resolve(null);
    const transaction = state.database.transaction("projects", "readonly");
    const request = transaction.objectStore("projects").get(PROJECT_KEY);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function toast(message, type = "normal", duration = 4200) {
  const item = document.createElement("div");
  item.className = `toast ${type === "error" ? "error" : ""}`;
  item.textContent = message;
  dom.toastRegion.appendChild(item);
  window.setTimeout(() => item.remove(), duration);
}

function dateStamp() {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
}

function debounce(fn, wait) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

function isTypingTarget(target) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[character]));
}

function escapeAttr(value) {
  return escapeHtml(value);
}
