import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import blueprint from "../data/vehicle-3d.json";
import referenceImageUrl from "../assets/reference/truck-original.png?url";
import {
  buildHaulTruck,
  getObjectStats,
  restoreTransform,
  snapshotTransform
} from "./source-truck-model.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const STORAGE_KEY = "haul-truck-editor:3d:v7";
const MAX_HISTORY = 40;

const dom = {
  stage: $("#stage"),
  canvas: $("#sceneCanvas"),
  loading: $("#loadingScreen"),
  projectStatus: $("#projectStatus"),
  sceneStat: $("#sceneStat"),
  partTree: $("#partTree"),
  partSummary: $("#partSummary"),
  partSearch: $("#partSearch"),
  collapseButton: $("#collapseButton"),
  stageMessage: $("#stageMessage"),
  viewStatus: $("#viewStatus"),
  selectionStatus: $("#selectionStatus"),
  selectionBadge: $("#selectionBadge"),
  selectionBadgeName: $("#selectionBadgeName"),
  referenceCard: $("#referenceCard"),
  referenceImage: $("#referenceImage"),
  calibrationButton: $("#calibrationButton"),
  metricOverlay: $("#metricOverlay"),
  emptyInspector: $("#emptyInspector"),
  inspectorContent: $("#inspectorContent"),
  objectNumber: $("#objectNumber"),
  objectCategory: $("#objectCategory"),
  objectName: $("#objectName"),
  objectId: $("#objectId"),
  objectIcon: $("#objectIcon"),
  visibilityButton: $("#visibilityButton"),
  lockButton: $("#lockButton"),
  duplicateButton: $("#duplicateButton"),
  removeButton: $("#removeButton"),
  resetButton: $("#resetButton"),
  uniformScale: $("#uniformScale"),
  anchorSelect: $("#anchorSelect"),
  snapButton: $("#snapButton"),
  meshCount: $("#meshCount"),
  triangleCount: $("#triangleCount"),
  objectState: $("#objectState"),
  specificationText: $("#specificationText"),
  homeViewButton: $("#homeViewButton"),
  focusButton: $("#focusButton"),
  wireframeButton: $("#wireframeButton"),
  anchorButton: $("#anchorButton"),
  addPartButton: $("#addPartButton"),
  addPopover: $("#addPopover"),
  importModelButton: $("#importModelButton"),
  assetInput: $("#assetInput"),
  undoButton: $("#undoButton"),
  redoButton: $("#redoButton"),
  saveButton: $("#saveButton"),
  exportButton: $("#exportButton"),
  exportPopover: $("#exportPopover"),
  exportPngButton: $("#exportPngButton"),
  exportGlbButton: $("#exportGlbButton"),
  exportJsonButton: $("#exportJsonButton"),
  importJsonButton: $("#importJsonButton"),
  resetProjectButton: $("#resetProjectButton"),
  projectInput: $("#projectInput"),
  toastRegion: $("#toastRegion")
};

const fields = {
  posX: $("#posX"),
  posY: $("#posY"),
  posZ: $("#posZ"),
  rotX: $("#rotX"),
  rotY: $("#rotY"),
  rotZ: $("#rotZ"),
  scaleX: $("#scaleX"),
  scaleY: $("#scaleY"),
  scaleZ: $("#scaleZ")
};

const state = {
  model: null,
  selected: null,
  mode: "select",
  search: "",
  collapsed: new Set(blueprint.categories.filter((item) => !item.open).map((item) => item.id)),
  anchorsVisible: false,
  wireframe: false,
  dirty: false,
  history: [],
  future: [],
  transformSnapshot: null,
  pointerStart: null,
  transforming: false,
  suppressHistory: false,
  calibration: true,
  environmentRoot: null
};

const renderer = createRenderer();
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

const scene = new THREE.Scene();
const daylightBackground = new THREE.Color(0xcfe0e7);
const daylightFog = new THREE.FogExp2(0xd9e4e6, 0.0065);
scene.background = daylightBackground;
scene.fog = daylightFog;

const camera = new THREE.PerspectiveCamera(blueprint.camera.fov, 1, 0.1, 220);
camera.position.fromArray(blueprint.camera.position);

const controls = new OrbitControls(camera, dom.canvas);
controls.target.fromArray(blueprint.camera.target);
controls.enableDamping = true;
controls.dampingFactor = 0.065;
controls.minDistance = 12;
controls.maxDistance = 75;
controls.maxPolarAngle = Math.PI * 0.49;
controls.screenSpacePanning = true;
controls.zoomToCursor = true;
controls.update();

const transform = new TransformControls(camera, dom.canvas);
transform.setSize(0.78);
transform.setTranslationSnap(0.1);
transform.setRotationSnap(5 * Math.PI / 180);
transform.setScaleSnap(0.05);
scene.add(transform.getHelper());

const selectionBox = new THREE.BoxHelper(undefined, 0xf1b65f);
selectionBox.material.depthTest = false;
selectionBox.material.transparent = true;
selectionBox.material.opacity = 0.88;
selectionBox.renderOrder = 1000;
selectionBox.visible = false;
scene.add(selectionBox);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const clock = new THREE.Clock();

function createRenderer() {
  const context = dom.canvas.getContext("webgl2", {
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
    powerPreference: "high-performance"
  });
  if (!context) return createFallbackRenderer();
  try {
    return new THREE.WebGLRenderer({
      canvas: dom.canvas,
      context,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance"
    });
  } catch (error) {
    console.warn("WebGL unavailable; editor data remains accessible", error);
    return createFallbackRenderer();
  }
}

function createFallbackRenderer() {
  return {
    isFallbackRenderer: true,
    shadowMap: {},
    setPixelRatio() {},
    setSize(width, height) {
      dom.canvas.width = width;
      dom.canvas.height = height;
    },
    setClearAlpha() {},
    render() {}
  };
}

init().catch((error) => {
  console.error(error);
  dom.loading.innerHTML = `<strong>三维编辑器载入失败</strong><small>${escapeHtml(error.message)}</small>`;
  dom.projectStatus.querySelector("span:last-child").textContent = "载入失败";
  toast(`载入失败：${error.message}`, "error", 8000);
});

async function init() {
  dom.referenceImage.src = referenceImageUrl;
  state.model = await buildHaulTruck(scene, blueprint);
  exposeEngineeringAudit();
  createEnvironment();
  populateAnchors();
  bindEvents();
  const restored = restoreSavedProject();
  resize();
  renderAll();
  homeView(false);
  if (renderer.isFallbackRenderer) {
    dom.loading.innerHTML = "<strong>当前浏览器没有启用 WebGL</strong><small>车辆数据与部件树已载入，请使用支持 WebGL 2 的桌面浏览器查看模型</small>";
    dom.projectStatus.querySelector("span:last-child").textContent = restored ? "已恢复本机工程 · WebGL 未启用" : "正式尺寸数据已载入 · WebGL 未启用";
  } else {
    dom.loading.classList.add("done");
    dom.projectStatus.querySelector("span:last-child").textContent = restored ? "已恢复本机保存工程" : "T284 比例骨架与原图改造模块已载入";
  }
  animate();
}

function exposeEngineeringAudit() {
  state.model.root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(state.model.root);
  const size = bounds.getSize(new THREE.Vector3());
  const wheelParts = [...state.model.parts.values()].filter((part) => part.userData.category === "wheels");
  window.__HAUL_TRUCK_AUDIT__ = Object.freeze({
    units: "meter",
    envelope: {
      length: rounded(size.x, 2),
      height: rounded(size.y, 2),
      width: rounded(size.z, 2)
    },
    hardTargets: {
      length: blueprint.dimensionsMeters.length,
      minimumWidth: 12,
      modeledWidth: blueprint.dimensionsMeters.width,
      frontPlatformHeight: blueprint.dimensionsMeters.frontPlatformHeight,
      wheelDiameter: blueprint.dimensionsMeters.wheelDiameter,
      bedFloorArea: blueprint.dimensionsMeters.bedFloorArea,
      payloadTons: blueprint.engineering.ratedPayloadTons
    },
    wheelIds: wheelParts.map((part) => part.userData.partId),
    editableParts: state.model.parts.size,
    sourceModel: state.model.spec.sourceModel,
    sourceEnvelope: state.model.spec.sourceEnvelope
  });
}

function createEnvironment() {
  const environmentRoot = new THREE.Group();
  environmentRoot.name = "daylight_industrial_apron";
  state.environmentRoot = environmentRoot;
  scene.add(environmentRoot);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(90, 70), state.model.materials.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.userData.environment = true;
  environmentRoot.add(floor);

  const grid = new THREE.GridHelper(70, 70, 0x919b9d, 0xb6bfc0);
  grid.position.y = 0.012;
  grid.material.transparent = true;
  grid.material.opacity = 0.26;
  grid.userData.environment = true;
  environmentRoot.add(grid);

  const horizon = new THREE.Group();
  horizon.name = "distant_mine_structures";
  const horizonSteel = new THREE.MeshStandardMaterial({ color: 0x8b9899, roughness: 0.86, metalness: 0.5 });
  const horizonConcrete = new THREE.MeshStandardMaterial({ color: 0xc2c6c3, roughness: 0.95, metalness: 0.02 });
  for (const [x, z, sx, sy, sz] of [[-22, -27, 13, 4, 4], [4, -29, 18, 6, 5], [27, -26, 9, 3, 5]]) {
    const building = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), horizonConcrete);
    building.position.set(x, sy / 2, z);
    horizon.add(building);
  }
  for (const x of [-24, 0, 24]) {
    const column = new THREE.Mesh(new THREE.BoxGeometry(0.28, 9, 0.32), horizonSteel);
    column.position.set(x, 4.5, -23);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(16, 0.3, 0.36), horizonSteel);
    beam.position.set(x, 8.8, -23);
    horizon.add(column, beam);
  }
  horizon.traverse((child) => { child.userData.environment = true; });
  environmentRoot.add(horizon);

  const hemisphere = new THREE.HemisphereLight(0xf5fbff, 0x777067, 2.35);
  scene.add(hemisphere);

  const keyLight = new THREE.DirectionalLight(0xfff0ce, 4.25);
  keyLight.position.set(-20, 32, 22);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.left = -28;
  keyLight.shadow.camera.right = 28;
  keyLight.shadow.camera.top = 24;
  keyLight.shadow.camera.bottom = -18;
  keyLight.shadow.camera.near = 1;
  keyLight.shadow.camera.far = 75;
  keyLight.shadow.bias = -0.00025;
  scene.add(keyLight);

  const fill = new THREE.DirectionalLight(0xaed8eb, 1.8);
  fill.position.set(18, 12, -20);
  scene.add(fill);

  const front = new THREE.SpotLight(0xffe1b1, 1.6, 65, Math.PI / 5, 0.72, 1.2);
  front.position.set(-30, 14, 5);
  front.target.position.set(-3, 4, 0);
  scene.add(front, front.target);
}

function bindEvents() {
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(dom.stage);

  controls.addEventListener("change", () => {
    selectionBox.update();
  });

  transform.addEventListener("dragging-changed", (event) => {
    state.transforming = event.value;
    controls.enabled = !event.value;
  });
  transform.addEventListener("mouseDown", () => {
    state.transformSnapshot = captureProjectState();
  });
  transform.addEventListener("objectChange", () => {
    markDirty();
    selectionBox.update();
    renderInspectorValues();
  });
  transform.addEventListener("mouseUp", () => {
    if (state.transformSnapshot) {
      state.history.push(state.transformSnapshot);
      trimHistory();
      state.future = [];
      state.transformSnapshot = null;
      updateUndoButtons();
    }
  });

  dom.canvas.addEventListener("pointerdown", (event) => {
    state.pointerStart = { x: event.clientX, y: event.clientY, button: event.button };
  });
  dom.canvas.addEventListener("pointerup", handleCanvasPointerUp);
  dom.canvas.addEventListener("dblclick", () => focusSelected());

  dom.partTree.addEventListener("click", handleTreeClick);
  dom.partSearch.addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLowerCase();
    renderTree();
  });
  dom.collapseButton.addEventListener("click", () => {
    const allCollapsed = blueprint.categories.every((category) => state.collapsed.has(category.id));
    state.collapsed = allCollapsed ? new Set() : new Set(blueprint.categories.map((category) => category.id));
    renderTree();
  });

  $$("[data-mode]").forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));
  dom.homeViewButton.addEventListener("click", () => homeView());
  dom.calibrationButton.addEventListener("click", toggleCalibration);
  dom.focusButton.addEventListener("click", focusSelected);
  dom.wireframeButton.addEventListener("click", toggleWireframe);
  dom.anchorButton.addEventListener("click", toggleAnchors);
  dom.referenceCard.addEventListener("click", () => dom.referenceCard.classList.toggle("collapsed"));

  dom.visibilityButton.addEventListener("click", toggleVisibility);
  dom.lockButton.addEventListener("click", toggleLock);
  dom.duplicateButton.addEventListener("click", duplicateSelected);
  dom.removeButton.addEventListener("click", removeOrRestoreSelected);
  dom.resetButton.addEventListener("click", resetSelected);
  dom.snapButton.addEventListener("click", snapToAnchor);

  Object.entries(fields).forEach(([key, input]) => input.addEventListener("change", () => applyFieldChange(key, input.value)));

  dom.addPartButton.addEventListener("click", (event) => togglePopover(dom.addPopover, event.currentTarget));
  dom.exportButton.addEventListener("click", (event) => togglePopover(dom.exportPopover, event.currentTarget));
  dom.addPopover.addEventListener("click", (event) => {
    const button = event.target.closest("[data-preset]");
    if (!button) return;
    addPreset(button.dataset.preset);
  });
  dom.importModelButton.addEventListener("click", () => dom.assetInput.click());
  dom.assetInput.addEventListener("change", importAsset);

  $$('[data-close]').forEach((button) => button.addEventListener("click", () => $("#" + button.dataset.close).classList.add("hidden")));
  document.addEventListener("pointerdown", (event) => {
    if (!event.target.closest(".popover") && !event.target.closest("#addPartButton") && !event.target.closest("#exportButton")) closePopovers();
  });

  dom.undoButton.addEventListener("click", undo);
  dom.redoButton.addEventListener("click", redo);
  dom.saveButton.addEventListener("click", saveProject);
  dom.exportPngButton.addEventListener("click", exportPng);
  dom.exportGlbButton.addEventListener("click", exportGlb);
  dom.exportJsonButton.addEventListener("click", exportJson);
  dom.importJsonButton.addEventListener("click", () => dom.projectInput.click());
  dom.projectInput.addEventListener("change", importJson);
  dom.resetProjectButton.addEventListener("click", resetProject);

  window.addEventListener("keydown", handleKeyboard);
  window.addEventListener("beforeunload", (event) => {
    if (!state.dirty) return;
    event.preventDefault();
    event.returnValue = "";
  });
}

function handleCanvasPointerUp(event) {
  if (state.transforming || !state.pointerStart || state.pointerStart.button !== 0) return;
  const distance = Math.hypot(event.clientX - state.pointerStart.x, event.clientY - state.pointerStart.y);
  state.pointerStart = null;
  if (distance > 5) return;
  const rect = dom.canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const candidates = [];
  state.model.parts.forEach((part) => {
    if (!part.visible || part.userData.removed) return;
    part.traverse((child) => {
      if (child.isMesh || child.isInstancedMesh) candidates.push(child);
    });
  });
  const hit = raycaster.intersectObjects(candidates, false)[0];
  selectPart(hit ? state.model.getPartFromObject(hit.object) : null);
}

function handleTreeClick(event) {
  const groupButton = event.target.closest("[data-group]");
  if (groupButton) {
    const id = groupButton.dataset.group;
    state.collapsed.has(id) ? state.collapsed.delete(id) : state.collapsed.add(id);
    renderTree();
    return;
  }
  const row = event.target.closest("[data-part-id]");
  if (!row) return;
  const part = state.model.parts.get(row.dataset.partId);
  if (!part) return;
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (action === "visibility") {
    selectPart(part);
    toggleVisibility();
  } else if (action === "lock") {
    selectPart(part);
    toggleLock();
  } else {
    selectPart(part);
  }
}

function selectPart(part) {
  state.selected = part || null;
  transform.detach();
  if (part && !part.userData.removed) {
    selectionBox.setFromObject(part);
    selectionBox.visible = part.visible;
    if (state.mode !== "select" && !part.userData.locked && part.visible) transform.attach(part);
  } else {
    selectionBox.visible = false;
  }
  renderTree();
  renderInspector();
}

function setMode(mode) {
  state.mode = mode;
  $$('[data-mode]').forEach((button) => button.classList.toggle("active", button.dataset.mode === mode));
  if (!state.selected || state.selected.userData.locked || state.selected.userData.removed || !state.selected.visible || mode === "select") {
    transform.detach();
  } else {
    transform.setMode(mode);
    transform.attach(state.selected);
  }
  dom.stageMessage.textContent = {
    select: "点击车辆或左侧图层选择真实三维部件",
    translate: "拖动三色箭头移动当前部件",
    rotate: "拖动旋转环改变当前部件角度",
    scale: "拖动缩放轴调整当前部件大小"
  }[mode];
}

function renderAll() {
  renderTree();
  renderInspector();
  updateUndoButtons();
  const stats = getObjectStats(state.model.root);
  const editorPartCount = [...state.model.parts.values()].filter((part) => !part.userData.historyOrphan).length;
  dom.sceneStat.innerHTML = `<b>${editorPartCount}</b> 个可编辑对象 · ${formatNumber(stats.triangles)} 面`;
}

function renderTree() {
  const query = state.search;
  let visibleCount = 0;
  const categories = blueprint.categories.map((category) => {
    const partRows = [...state.model.parts.values()]
      .filter((part) => part.userData.category === category.id)
      .filter((part) => !part.userData.historyOrphan)
      .filter((part) => !query || `${part.userData.name} ${part.userData.partId}`.toLowerCase().includes(query));
    if (!partRows.length && query) return "";
    visibleCount += partRows.length;
    const collapsed = state.collapsed.has(category.id) && !query;
    return `
      <section class="tree-group ${collapsed ? "collapsed" : ""}">
        <button class="group-row" type="button" data-group="${category.id}">
          <span class="chevron">⌄</span><b>${escapeHtml(category.name)}</b><em>${partRows.length}</em>
        </button>
        <div class="group-items">
          ${partRows.map((part) => renderPartRow(part)).join("")}
        </div>
      </section>`;
  }).join("");
  dom.partTree.innerHTML = categories || `<div class="empty-inspector"><p>没有找到匹配部件。</p></div>`;
  const editorParts = [...state.model.parts.values()].filter((part) => !part.userData.historyOrphan);
  const activeCount = editorParts.filter((part) => !part.userData.removed).length;
  dom.partSummary.textContent = query ? `找到 ${visibleCount} 个部件` : `${activeCount} 个已装配 · ${editorParts.length - activeCount} 个已拆除`;
}

function renderPartRow(part) {
  const selected = part === state.selected;
  const hidden = !part.visible;
  const removed = part.userData.removed;
  const locked = part.userData.locked;
  const icon = part.userData.category === "wheels" ? "◉" : part.userData.category === "addons" ? "＋" : "▦";
  return `
    <div class="part-row ${selected ? "selected" : ""} ${removed ? "removed" : ""} ${locked ? "locked" : ""}" role="treeitem" tabindex="0" data-part-id="${part.userData.partId}">
      <span class="part-type-icon">${icon}</span>
      <span class="part-name">${escapeHtml(part.userData.name)}</span>
      <button class="part-mini-action" type="button" data-action="visibility" title="${hidden ? "显示" : "隐藏"}">${hidden ? "○" : "◉"}</button>
      <button class="part-mini-action" type="button" data-action="lock" title="${locked ? "解锁" : "锁定"}">${locked ? "◆" : "◇"}</button>
    </div>`;
}

function renderInspector() {
  const part = state.selected;
  dom.emptyInspector.classList.toggle("hidden", Boolean(part));
  dom.inspectorContent.classList.toggle("hidden", !part);
  dom.selectionBadge.classList.toggle("hidden", !part);
  if (!part) {
    dom.objectNumber.textContent = "—";
    dom.selectionStatus.textContent = "未选择部件";
    return;
  }
  const ordered = [...state.model.parts.values()].filter((item) => !item.userData.historyOrphan);
  dom.objectNumber.textContent = `${ordered.indexOf(part) + 1}/${ordered.length}`;
  dom.objectCategory.textContent = part.userData.categoryName;
  dom.objectName.textContent = part.userData.name;
  dom.objectId.textContent = part.userData.partId;
  dom.specificationText.textContent = part.userData.specification || "独立三维对象；可隐藏、拆除、移动、旋转、缩放和恢复。";
  dom.objectIcon.textContent = part.userData.category === "wheels" ? "◉" : part.userData.category === "addons" ? "＋" : "▦";
  dom.selectionStatus.textContent = part.userData.name;
  dom.selectionBadgeName.textContent = part.userData.name;
  dom.visibilityButton.innerHTML = `<span>${part.visible ? "◉" : "○"}</span>${part.visible ? "隐藏" : "显示"}`;
  dom.visibilityButton.classList.toggle("active", !part.visible && !part.userData.removed);
  dom.visibilityButton.disabled = part.userData.removed;
  dom.lockButton.innerHTML = `<span>${part.userData.locked ? "◆" : "◇"}</span>${part.userData.locked ? "解锁" : "锁定"}`;
  dom.lockButton.classList.toggle("active", part.userData.locked);
  dom.removeButton.innerHTML = part.userData.removed ? "<span>↺</span>恢复" : "<span>×</span>拆除";
  dom.removeButton.classList.toggle("restore", part.userData.removed);
  dom.duplicateButton.disabled = part.userData.removed;
  renderInspectorValues();
  const stats = getObjectStats(part);
  dom.meshCount.textContent = formatNumber(stats.meshes);
  dom.triangleCount.textContent = formatNumber(stats.triangles);
  dom.objectState.textContent = part.userData.removed ? "已拆除" : part.userData.locked ? "已锁定" : part.visible ? "正常" : "已隐藏";
}

function renderInspectorValues() {
  const part = state.selected;
  if (!part) return;
  fields.posX.value = rounded(part.position.x);
  fields.posY.value = rounded(part.position.y);
  fields.posZ.value = rounded(part.position.z);
  fields.rotX.value = rounded(THREE.MathUtils.radToDeg(part.rotation.x), 1);
  fields.rotY.value = rounded(THREE.MathUtils.radToDeg(part.rotation.y), 1);
  fields.rotZ.value = rounded(THREE.MathUtils.radToDeg(part.rotation.z), 1);
  fields.scaleX.value = rounded(part.scale.x);
  fields.scaleY.value = rounded(part.scale.y);
  fields.scaleZ.value = rounded(part.scale.z);
  const disabled = part.userData.locked || part.userData.removed;
  Object.values(fields).forEach((input) => { input.disabled = disabled; });
  dom.snapButton.disabled = disabled;
  dom.resetButton.disabled = disabled;
}

function applyFieldChange(key, rawValue) {
  const part = state.selected;
  const value = Number(rawValue);
  if (!part || !Number.isFinite(value) || part.userData.locked || part.userData.removed) return;
  commitMutation(() => {
    if (key.startsWith("pos")) part.position[key.at(-1).toLowerCase()] = value;
    if (key.startsWith("rot")) part.rotation[key.at(-1).toLowerCase()] = THREE.MathUtils.degToRad(value);
    if (key.startsWith("scale")) {
      const axis = key.at(-1).toLowerCase();
      const safeValue = Math.max(0.05, value);
      if (dom.uniformScale.checked) part.scale.setScalar(safeValue);
      else part.scale[axis] = safeValue;
    }
  });
}

function toggleVisibility() {
  const part = state.selected;
  if (!part || part.userData.removed) return;
  commitMutation(() => {
    part.visible = !part.visible;
    if (!part.visible) {
      transform.detach();
      selectionBox.visible = false;
    } else {
      selectionBox.setFromObject(part);
      selectionBox.visible = true;
      if (state.mode !== "select" && !part.userData.locked) transform.attach(part);
    }
  }, part.visible ? `${part.userData.name} 已隐藏` : `${part.userData.name} 已显示`);
}

function toggleLock() {
  const part = state.selected;
  if (!part) return;
  commitMutation(() => {
    part.userData.locked = !part.userData.locked;
    if (part.userData.locked) transform.detach();
    else if (state.mode !== "select" && part.visible && !part.userData.removed) transform.attach(part);
  }, part.userData.locked ? `${part.userData.name} 已解锁` : `${part.userData.name} 已锁定`);
}

function removeOrRestoreSelected() {
  const part = state.selected;
  if (!part) return;
  const restoring = part.userData.removed;
  commitMutation(() => {
    part.userData.removed = !restoring;
    part.visible = restoring;
    transform.detach();
    if (restoring) {
      selectionBox.setFromObject(part);
      selectionBox.visible = true;
    } else {
      selectionBox.visible = false;
    }
  }, restoring ? `${part.userData.name} 已恢复装配` : `${part.userData.name} 已从车辆拆除`);
}

function duplicateSelected() {
  const part = state.selected;
  if (!part || part.userData.removed) return;
  const before = captureProjectState();
  const clone = state.model.duplicatePart(part);
  state.history.push(before);
  trimHistory();
  state.future = [];
  markDirty();
  selectPart(clone);
  renderAll();
  toast(`${part.userData.name} 已复制为独立对象`, "success");
}

function resetSelected() {
  const part = state.selected;
  if (!part || part.userData.locked || part.userData.removed) return;
  commitMutation(() => {
    restoreTransform(part);
    selectionBox.update();
  }, `${part.userData.name} 已恢复初始位置`);
}

function snapToAnchor() {
  const part = state.selected;
  const anchor = state.model.anchors.find((item) => item.id === dom.anchorSelect.value);
  if (!part || !anchor || part.userData.locked || part.userData.removed) return;
  commitMutation(() => {
    part.position.fromArray(anchor.position);
    part.rotation.set(...anchor.rotation);
    selectionBox.update();
  }, `${part.userData.name} 已吸附到${anchor.name}`);
}

function addPreset(preset) {
  const before = captureProjectState();
  const object = state.model.createPreset(preset, dom.anchorSelect.value || "front_deck_center");
  state.history.push(before);
  trimHistory();
  state.future = [];
  markDirty();
  closePopovers();
  selectPart(object);
  renderAll();
  setMode("translate");
  toast(`${object.userData.name} 已作为独立三维部件添加`, "success");
}

async function importAsset(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  closePopovers();
  try {
    const before = captureProjectState();
    let object;
    if (file.name.toLowerCase().endsWith(".glb")) {
      const loader = new GLTFLoader();
      const result = await loader.parseAsync(await file.arrayBuffer(), "");
      object = result.scene;
    } else if (file.type.startsWith("image/")) {
      object = await imageFileToPlane(file);
    } else {
      throw new Error("目前支持 GLB 三维模型或 PNG、WebP、JPG 图片");
    }
    object = state.model.registerExternal(object, stripExtension(file.name));
    state.history.push(before);
    trimHistory();
    state.future = [];
    markDirty();
    selectPart(object);
    renderAll();
    setMode("translate");
    toast(`${file.name} 已导入为独立部件。外部文件请随工程另行保留。`, "success", 5000);
  } catch (error) {
    console.error(error);
    toast(`导入失败：${error.message}`, "error", 6000);
  }
}

function imageFileToPlane(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    new THREE.TextureLoader().load(url, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      const aspect = texture.image.width / texture.image.height || 1;
      const geometry = new THREE.PlaneGeometry(3.2 * aspect, 3.2);
      const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide, alphaTest: 0.02 });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.y = 1.6;
      const group = new THREE.Group();
      group.add(mesh);
      URL.revokeObjectURL(url);
      resolve(group);
    }, undefined, (error) => {
      URL.revokeObjectURL(url);
      reject(error);
    });
  });
}

function homeView(animateCamera = true) {
  const destination = new THREE.Vector3(...blueprint.camera.position);
  const target = new THREE.Vector3(...blueprint.camera.target);
  if (!animateCamera) {
    camera.position.copy(destination);
    controls.target.copy(target);
    controls.update();
  } else {
    tweenCamera(destination, target);
  }
  dom.viewStatus.textContent = "透视 · 工程视角";
}

function focusSelected() {
  const part = state.selected;
  if (!part || part.userData.removed || !part.visible) {
    toast("请先选择一个当前可见的部件");
    return;
  }
  const box = new THREE.Box3().setFromObject(part);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3()).length();
  const direction = camera.position.clone().sub(controls.target).normalize();
  const distance = Math.max(5.5, size * 1.75);
  tweenCamera(center.clone().add(direction.multiplyScalar(distance)), center);
  dom.viewStatus.textContent = `聚焦 · ${part.userData.name}`;
}

function tweenCamera(destination, target) {
  const startPosition = camera.position.clone();
  const startTarget = controls.target.clone();
  const startTime = performance.now();
  const duration = 520;
  const tick = (now) => {
    const raw = Math.min(1, (now - startTime) / duration);
    const progress = 1 - Math.pow(1 - raw, 3);
    camera.position.lerpVectors(startPosition, destination, progress);
    controls.target.lerpVectors(startTarget, target, progress);
    controls.update();
    if (raw < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function toggleWireframe() {
  state.wireframe = !state.wireframe;
  state.model.setWireframe(state.wireframe);
  dom.wireframeButton.classList.toggle("active", state.wireframe);
  dom.viewStatus.textContent = state.wireframe ? "透视 · 结构线模式" : "透视 · 实体材质";
}

function toggleCalibration() {
  state.calibration = !state.calibration;
  dom.calibrationButton.classList.toggle("active", state.calibration);
  dom.metricOverlay.classList.toggle("hidden", !state.calibration);
  dom.stageMessage.textContent = state.calibration
    ? "当前显示原始 T284 素材；尺寸卡是下一阶段八轮改造的硬目标"
    : "明亮日光场景 · 原车与原图改造件均可独立编辑";
  toast(state.calibration ? "已显示正式尺寸基准" : "尺寸基准卡已隐藏");
}

function toggleAnchors() {
  state.anchorsVisible = !state.anchorsVisible;
  state.model.anchorGroup.visible = state.anchorsVisible;
  dom.anchorButton.classList.toggle("active", state.anchorsVisible);
  toast(state.anchorsVisible ? "已显示原型车辆设施安装点" : "安装点已隐藏");
}

function populateAnchors() {
  dom.anchorSelect.innerHTML = state.model.anchors.map((anchor) => `<option value="${anchor.id}">${escapeHtml(anchor.name)}</option>`).join("");
}

function commitMutation(mutation, message = "") {
  if (state.suppressHistory) {
    mutation();
    return;
  }
  state.history.push(captureProjectState());
  trimHistory();
  state.future = [];
  mutation();
  markDirty();
  renderAll();
  selectionBox.update();
  if (message) toast(message, "success");
}

function captureProjectState() {
  return {
    parts: [...state.model.parts.values()].filter((part) => !part.userData.historyOrphan).map((part) => ({
      id: part.userData.partId,
      name: part.userData.name,
      category: part.userData.category,
      preset: part.userData.preset,
      dynamic: part.userData.dynamic,
      transform: snapshotTransform(part),
      visible: part.visible,
      removed: part.userData.removed,
      locked: part.userData.locked
    }))
  };
}

function applyProjectState(snapshot) {
  state.suppressHistory = true;
  const entries = new Map(snapshot.parts.map((entry) => [entry.id, entry]));
  snapshot.parts.forEach((entry) => {
    if (state.model.parts.has(entry.id)) return;
    if (entry.dynamic && ["tent", "campfire", "crate", "shelter"].includes(entry.preset)) state.model.createPreset(entry.preset);
  });
  state.model.parts.forEach((part, id) => {
    const entry = entries.get(id);
    if (!entry) {
      if (part.userData.dynamic) {
        part.userData.removed = true;
        part.userData.historyOrphan = true;
        part.visible = false;
      }
      return;
    }
    part.userData.historyOrphan = false;
    part.userData.name = entry.name || part.userData.name;
    part.userData.removed = Boolean(entry.removed);
    part.userData.locked = Boolean(entry.locked);
    part.visible = Boolean(entry.visible) && !part.userData.removed;
    restoreTransform(part, entry.transform);
  });
  state.suppressHistory = false;
  transform.detach();
  if (state.selected) {
    state.selected = state.model.parts.get(state.selected.userData.partId) || null;
    if (state.selected?.userData.historyOrphan) state.selected = null;
    selectionBox.visible = Boolean(state.selected?.visible && !state.selected?.userData.removed);
    if (selectionBox.visible) selectionBox.setFromObject(state.selected);
  }
  renderAll();
}

function undo() {
  const previous = state.history.pop();
  if (!previous) return;
  state.future.push(captureProjectState());
  applyProjectState(previous);
  markDirty();
  updateUndoButtons();
  toast("已撤销上一步操作");
}

function redo() {
  const next = state.future.pop();
  if (!next) return;
  state.history.push(captureProjectState());
  applyProjectState(next);
  markDirty();
  updateUndoButtons();
  toast("已重做操作");
}

function trimHistory() {
  if (state.history.length > MAX_HISTORY) state.history.splice(0, state.history.length - MAX_HISTORY);
  updateUndoButtons();
}

function updateUndoButtons() {
  dom.undoButton.disabled = state.history.length === 0;
  dom.redoButton.disabled = state.future.length === 0;
}

function saveProject() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      projectId: blueprint.projectId,
      version: blueprint.version,
      savedAt: new Date().toISOString(),
      ...captureProjectState()
    }));
    state.dirty = false;
    dom.projectStatus.classList.remove("dirty");
    dom.projectStatus.querySelector("span:last-child").textContent = "工程已保存到本机";
    toast("当前三维装配工程已保存", "success");
  } catch (error) {
    toast(`保存失败：${error.message}`, "error");
  }
}

function restoreSavedProject() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (!value) return false;
    const saved = JSON.parse(value);
    if (saved.projectId !== blueprint.projectId || !Array.isArray(saved.parts)) return false;
    applyProjectState(saved);
    return true;
  } catch (error) {
    console.warn("Saved project could not be restored", error);
    return false;
  }
}

function exportJson() {
  const content = JSON.stringify({
    projectId: blueprint.projectId,
    version: blueprint.version,
    exportedAt: new Date().toISOString(),
    blueprint: { name: blueprint.name, orientation: blueprint.orientation },
    ...captureProjectState()
  }, null, 2);
  downloadBlob(new Blob([content], { type: "application/json" }), "haul-truck-project.json");
  closePopovers();
  toast("工程 JSON 已导出", "success");
}

async function importJson(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data.projectId !== blueprint.projectId || !Array.isArray(data.parts)) throw new Error("不是当前矿卡编辑器的有效工程文件");
    state.history.push(captureProjectState());
    applyProjectState(data);
    state.future = [];
    markDirty();
    closePopovers();
    toast("三维工程已导入", "success");
  } catch (error) {
    toast(`工程导入失败：${error.message}`, "error", 6000);
  }
}

function exportPng() {
  if (renderer.isFallbackRenderer) {
    closePopovers();
    toast("当前浏览器没有启用 WebGL，无法导出三维画面", "error", 5000);
    return;
  }
  selectionBox.visible = false;
  const helperVisible = transform.getHelper().visible;
  transform.getHelper().visible = false;
  renderer.render(scene, camera);
  dom.canvas.toBlob((blob) => {
    if (blob) downloadBlob(blob, "haul-truck-view.png");
    selectionBox.visible = Boolean(state.selected?.visible && !state.selected?.userData.removed);
    transform.getHelper().visible = helperVisible;
    closePopovers();
    toast("当前三维视角已导出为 PNG", "success");
  }, "image/png");
}

async function exportGlb() {
  closePopovers();
  try {
    dom.projectStatus.querySelector("span:last-child").textContent = "正在生成 GLB 模型……";
    const anchorVisibility = state.model.anchorGroup.visible;
    state.model.anchorGroup.visible = false;
    const exporter = new GLTFExporter();
    const result = await exporter.parseAsync(state.model.root, {
      binary: true,
      onlyVisible: true,
      trs: true,
      includeCustomExtensions: false
    });
    state.model.anchorGroup.visible = anchorVisibility;
    downloadBlob(new Blob([result], { type: "model/gltf-binary" }), "modular-haul-truck.glb");
    dom.projectStatus.querySelector("span:last-child").textContent = "GLB 模型导出完成";
    toast("车辆 GLB 已导出；部件节点名称与编辑器 ID 保持一致", "success", 5000);
  } catch (error) {
    state.model.anchorGroup.visible = state.anchorsVisible;
    console.error(error);
    toast(`GLB 导出失败：${error.message}`, "error", 7000);
  }
}

function resetProject() {
  if (!window.confirm("确定恢复整辆矿卡的初始装配吗？所有本机编辑状态都会清除。")) return;
  state.history.push(captureProjectState());
  const dynamicIds = [...state.model.parts.entries()].filter(([, part]) => part.userData.dynamic).map(([id]) => id);
  dynamicIds.forEach((id) => {
    const object = state.model.parts.get(id);
    state.model.root.remove(object);
    state.model.parts.delete(id);
  });
  state.model.parts.forEach((part) => {
    restoreTransform(part);
    part.visible = true;
    part.userData.removed = false;
    part.userData.locked = false;
  });
  localStorage.removeItem(STORAGE_KEY);
  state.future = [];
  state.selected = null;
  transform.detach();
  selectionBox.visible = false;
  markDirty();
  renderAll();
  closePopovers();
  homeView();
  toast("车辆已经恢复为初始完整装配", "success");
}

function markDirty() {
  state.dirty = true;
  dom.projectStatus.classList.add("dirty");
  dom.projectStatus.querySelector("span:last-child").textContent = "工程有未保存修改";
}

function handleKeyboard(event) {
  if (event.target.matches("input, select, textarea")) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    event.shiftKey ? redo() : undo();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    saveProject();
    return;
  }
  const key = event.key.toLowerCase();
  if (key === "v") setMode("select");
  if (key === "g") setMode("translate");
  if (key === "r") setMode("rotate");
  if (key === "s") setMode("scale");
  if (event.key === "Delete" && state.selected) removeOrRestoreSelected();
  if (event.key === "f") focusSelected();
  if (event.key === "Escape") {
    closePopovers();
    setMode("select");
  }
}

function resize() {
  const stageWidth = Math.max(1, dom.stage.clientWidth);
  const stageHeight = Math.max(1, dom.stage.clientHeight);
  dom.canvas.style.left = "0";
  dom.canvas.style.top = "0";
  dom.canvas.style.width = "100%";
  dom.canvas.style.height = "100%";
  renderer.setSize(Math.round(stageWidth), Math.round(stageHeight), false);
  camera.aspect = stageWidth / stageHeight;
  camera.updateProjectionMatrix();
}

function animate() {
  const time = clock.getElapsedTime();
  controls.update();
  state.model.parts.forEach((part) => {
    if (part.visible && typeof part.userData.animate === "function") part.userData.animate(time);
  });
  if (selectionBox.visible) selectionBox.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function togglePopover(popover) {
  const shouldShow = popover.classList.contains("hidden");
  closePopovers();
  if (shouldShow) popover.classList.remove("hidden");
}

function closePopovers() {
  dom.addPopover.classList.add("hidden");
  dom.exportPopover.classList.add("hidden");
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function toast(message, type = "info", duration = 2800) {
  const element = document.createElement("div");
  element.className = `toast ${type}`;
  element.textContent = message;
  dom.toastRegion.append(element);
  setTimeout(() => element.remove(), duration);
}

function formatNumber(value) {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(value || 0);
}

function rounded(value, digits = 2) {
  return Number(value.toFixed(digits));
}

function stripExtension(filename) {
  return filename.replace(/\.[^.]+$/, "").slice(0, 40) || "导入部件";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  }[character]));
}
