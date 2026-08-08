import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

const outfitMeta = {
  s0142: {
    name: "暖暖 · 熠熠舞曲",
    category: "S0142 · 完整角色模型",
    stat: "熠熠舞曲",
    description: "包含暖暖的脸部、身体、眼睛、头发、299 根骨骼与熠熠舞曲套装。点击模型上的部件可以查看说明。"
  },
  s0366: {
    name: "暖暖 · S0366 完整套装",
    category: "2.8 公开资源包 · 可换装",
    stat: "S0366 完整套装",
    description: "由 2.8 公开资源包中的 11 个 PSK 网格和对应 TGA 贴图转换而成，包含礼服、外裙、发型、鞋履与成套饰品。"
  }
};

const objectParts = {
  PFJ0001: ["睫毛与眼妆", "角色本体 · 面部", "独立睫毛网格与眼部妆面，让近距离观察仍保持完整层次。"],
  PFM0001: ["眉妆", "角色本体 · 面部", "眉形与面部妆面组件，贴合暖暖原始头部模型。"],
  S0142AEA: ["耳饰", "熠熠舞曲 · 饰品", "紫晶坠饰与细金属结构组成的耳部配件。"],
  S0142AHC: ["羽晶头饰", "熠熠舞曲 · 头饰", "浅色羽饰、紫晶与金色枝叶结构组成的头饰。"],
  S0142AHE: ["颈饰", "熠熠舞曲 · 饰品", "沿颈部展开的金色曲线与紫色宝石坠饰。"],
  S0142ANE: ["手部饰品", "熠熠舞曲 · 饰品", "手腕与手背上的羽状装饰，与胸前造型相呼应。"],
  S0142BB: ["舞曲高跟鞋", "熠熠舞曲 · 鞋履", "浅紫鞋面、金色包边和花叶装饰构成的配套高跟鞋。"],
  S0142D: ["熠熠舞曲礼服", "套装主体", "不对称层叠裙摆、织物纹理、羽饰、花枝与晶体装饰组成的礼服主体。"],
  S0142G: ["臂饰与袖口", "熠熠舞曲 · 饰品", "分布在双臂与手腕位置的花叶、羽毛和薄纱装饰。"],
  S0142H: ["粉紫盘发", "暖暖 · 发型", "粉紫渐变盘发，保留额前碎发、侧边卷发与后方发束的分层结构。"],
  S0366ABK: ["S0366 背饰", "2.8 资源包 · 饰品", "展开于身后的大型羽翼与晶体背饰。"],
  S0366AEA: ["S0366 耳饰", "2.8 资源包 · 饰品", "S0366 套装的成套耳部装饰。"],
  S0366AHA: ["S0366 腰饰", "2.8 资源包 · 饰品", "围绕腰线展开的浮雕与花纹装饰。"],
  S0366AHE: ["S0366 颈饰", "2.8 资源包 · 饰品", "与礼服领口相连的颈部装饰。"],
  S0366AXQ: ["S0366 悬浮饰件", "2.8 资源包 · 饰品", "围绕角色悬浮的晶体与装饰部件。"],
  S0366BB: ["S0366 鞋履", "2.8 资源包 · 鞋履", "带有高筒结构与花纹细节的成套鞋履。"],
  S0366D: ["S0366 礼服", "2.8 资源包 · 套装主体", "高细节短礼服主体，包含多层裙摆、浮雕和宝石结构。"],
  S0366G: ["S0366 手套", "2.8 资源包 · 手部", "覆盖手臂的长手套与附属装饰。"],
  S0366H: ["S0366 发型", "2.8 资源包 · 发型", "与套装配套的长发和发饰网格。"],
  S0366S: ["S0366 外裙", "2.8 资源包 · 裙装", "从腰部延伸的轻纱与外层裙摆。"],
  S0366FF: ["S0366 足饰", "2.8 资源包 · 饰品", "鞋履附近的附加足部装饰。"]
};

const posePresets = {
  natural: {},
  elegant: {
    Chest_M: [0, 0, -5], Neck_M: [0, 0, 4], Head_M: [0, 0, 4],
    Shoulder_L: [-12, -12, -42], Elbow_L: [0, -20, -64], Wrist_L: [8, 0, -18],
    Shoulder_R: [5, 8, 8], Elbow_R: [0, 0, 26], Wrist_R: [-8, 0, 8],
    Hip_L: [2, 0, -3], Hip_R: [-2, 0, 3]
  },
  wave: {
    Chest_M: [0, 0, -5], Neck_M: [0, 0, 4], Head_M: [0, 0, 4],
    Shoulder_L: [-8, -10, -44], Elbow_L: [0, -12, -58], Wrist_L: [8, 0, -12],
    Shoulder_R: [8, 10, 44], Elbow_R: [0, 12, 58], Wrist_R: [-8, 0, 12],
    Hip_L: [2, 0, -3], Hip_R: [-2, 0, 3]
  }
};

const mount = document.querySelector("#canvasMount");
const statusText = document.querySelector("#statusText");
const statusDot = document.querySelector("#statusDot");
const loadingCard = document.querySelector("#loadingCard");
const loadingTitle = document.querySelector("#loadingTitle");
const progressBar = document.querySelector("#progressBar");
const progressText = document.querySelector("#progressText");
const partName = document.querySelector("#partName");
const partCategory = document.querySelector("#partCategory");
const partDescription = document.querySelector("#partDescription");
const rotateButton = document.querySelector("#rotateButton");
const outfitStatus = document.querySelector("#outfitStatus");
const outfitStat = document.querySelector("#outfitStat");
const outfitButtons = [...document.querySelectorAll("[data-outfit]")];
const poseButtons = [...document.querySelectorAll("[data-pose]")];

const scene = new THREE.Scene();
const characterRoot = new THREE.Group();
scene.add(characterRoot);

const camera = new THREE.PerspectiveCamera(34, 1, .01, 100);
camera.position.set(0, .96, 2.72);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = .83;
renderer.setClearColor(0x000000, 0);
renderer.domElement.setAttribute("aria-label", "暖暖3D换装与姿势交互画布");
renderer.domElement.tabIndex = 0;
mount.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = .075;
controls.enablePan = false;
controls.minDistance = .46;
controls.maxDistance = 5.2;
controls.minPolarAngle = .12;
controls.maxPolarAngle = Math.PI - .12;
controls.target.set(0, .9, 0);
controls.autoRotateSpeed = .72;

scene.add(new THREE.HemisphereLight(0xeee7ff, 0x20263a, 1.45));
const keyLight = new THREE.DirectionalLight(0xfff0e8, 2.35);
keyLight.position.set(2.6, 3.8, 3.4);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0x9ba9ff, 1.05);
fillLight.position.set(-3.2, 1.6, 2.5);
scene.add(fillLight);
const rimLight = new THREE.PointLight(0xe385ff, 5.2, 7, 1.8);
rimLight.position.set(1.7, 1.9, -2.1);
scene.add(rimLight);

const shadow = new THREE.Mesh(
  new THREE.CircleGeometry(.66, 72),
  new THREE.MeshBasicMaterial({ color: 0x7f69a1, transparent: true, opacity: .22, depthWrite: false })
);
shadow.rotation.x = -Math.PI / 2;
shadow.scale.set(1, .38, 1);
shadow.position.y = -.012;
scene.add(shadow);

const starPositions = [];
for (let i = 0; i < 110; i += 1) {
  const angle = i * 2.39996;
  const radius = 1.05 + ((i * 37) % 100) / 66;
  starPositions.push(Math.cos(angle) * radius, .18 + ((i * 53) % 160) / 68, -.8 - ((i * 29) % 100) / 50);
}
const starGeometry = new THREE.BufferGeometry();
starGeometry.setAttribute("position", new THREE.Float32BufferAttribute(starPositions, 3));
const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: 0xd9c8ff, size: .012, transparent: true, opacity: .65, depthWrite: false }));
scene.add(stars);

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath("./draco/");
dracoLoader.setDecoderConfig({ type: "wasm" });
const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

let baseModel = null;
let resourceOutfit = null;
let resourceOutfitPromise = null;
let selectedMesh = null;
let currentOutfit = "s0142";
let currentPose = "natural";
let pointerDown = { x: 0, y: 0 };
let cameraGoal = null;
let targetGoal = null;
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function materialsOf(material) {
  return Array.isArray(material) ? material : [material];
}

function setPart(info) {
  partName.textContent = info.name;
  partCategory.textContent = info.category;
  partDescription.textContent = info.description;
}

function setOutfitOverview(id) {
  setPart(outfitMeta[id]);
  outfitStat.textContent = outfitMeta[id].stat;
}

function resolvePart(objectName, materialName = "") {
  if (/Eye|Cornea|Eyelash|Eyebrow/i.test(materialName)) {
    return { name: "暖暖的眼睛", category: "角色本体 · 面部", description: "已修正透明度和过曝问题，虹膜、眼白、高光层、眉毛与睫毛共同构成完整眼部组件。" };
  }
  if (/NNSkin_Face/i.test(materialName)) {
    return { name: "暖暖的脸部", category: "角色本体 · 面部", description: "暖暖的原始脸部网格与肤色贴图，保留嘴唇、鼻部和妆感细节。" };
  }
  if (/NNSkin_Body/i.test(materialName)) {
    return { name: "角色身体", category: "角色本体", description: "与服装骨骼共用绑定的完整身体网格。" };
  }
  const key = Object.keys(objectParts).find(item => objectName.includes(item));
  if (!key) return outfitMeta[currentOutfit];
  const [name, category, description] = objectParts[key];
  return { name, category, description };
}

function clearHighlight() {
  if (!selectedMesh) return;
  materialsOf(selectedMesh.material).forEach(material => {
    if (!material.emissive || !material.userData.baseEmissive) return;
    material.emissive.copy(material.userData.baseEmissive);
    material.emissiveIntensity = material.userData.baseEmissiveIntensity ?? 1;
  });
  selectedMesh = null;
}

function highlight(mesh) {
  clearHighlight();
  materialsOf(mesh.material).forEach(material => {
    if (!material.emissive || !material.visible) return;
    material.userData.baseEmissive ??= material.emissive.clone();
    material.userData.baseEmissiveIntensity ??= material.emissiveIntensity;
    material.emissive.set(0x3a174d);
    material.emissiveIntensity = .28;
  });
  selectedMesh = mesh;
}

renderer.domElement.addEventListener("pointerdown", event => {
  pointerDown = { x: event.clientX, y: event.clientY };
  cameraGoal = null;
  targetGoal = null;
});

renderer.domElement.addEventListener("pointerup", event => {
  if (!baseModel || Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 6) return;
  const bounds = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
  pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObject(characterRoot, true).find(item => {
    if (!item.object.isMesh || !item.object.visible) return false;
    const materials = materialsOf(item.object.material);
    return (materials[item.face?.materialIndex ?? 0] || materials[0])?.visible !== false;
  });
  if (!hit) {
    clearHighlight();
    setOutfitOverview(currentOutfit);
    return;
  }
  const mesh = hit.object;
  const materials = materialsOf(mesh.material);
  const materialName = materials[hit.face?.materialIndex ?? 0]?.name || materials[0]?.name || "";
  highlight(mesh);
  setPart(resolvePart(mesh.name, materialName));
});

function configureModel(root, type) {
  root.traverse(child => {
    if (child.isBone) {
      child.userData.bindQuaternion = child.quaternion.clone();
      return;
    }
    if (!child.isMesh) return;
    child.frustumCulled = false;
    child.userData.modelType = type;
    child.material = Array.isArray(child.material) ? child.material.map(material => material.clone()) : child.material.clone();
    materialsOf(child.material).forEach(material => {
      if (material.transparent || material.alphaTest > 0) {
        material.alphaTest = Math.max(material.alphaTest || 0, .025);
        material.depthWrite = material.opacity > .45;
      }
      if (type === "resource" && material.color) {
        if (/_0?2(?:_|$)/.test(material.name)) material.color.set(0xd8bd82);
        else if (/_0?3(?:_|$)/.test(material.name)) material.color.set(0x9fbaf2);
        else if (/S0366H_/i.test(material.name)) material.color.set(0xb8c9f6);
        else if (/Gem|Shinning/i.test(material.name)) {
          material.color.set(0x8aa6f4);
          if (material.emissive) {
            material.emissive.set(0x263e84);
            material.emissiveIntensity = .32;
          }
        } else material.color.set(0xe8def8);
      }
      if (/S0142H|S0366H/.test(child.name)) material.side = THREE.DoubleSide;
      material.userData.outfitDefaultVisible = material.visible;
    });
  });
}

function fitCharacter() {
  const box = new THREE.Box3().setFromObject(baseModel);
  const center = box.getCenter(new THREE.Vector3());
  const scale = 1.78 / Math.max(box.max.y - box.min.y, .01);
  characterRoot.scale.setScalar(scale);
  characterRoot.position.x = -center.x * scale;
  characterRoot.position.z = -center.z * scale;
  const fitted = new THREE.Box3().setFromObject(characterRoot);
  characterRoot.position.y -= fitted.min.y;
}

function showLoading(title, detail) {
  loadingTitle.textContent = title;
  progressText.textContent = detail;
  progressBar.style.width = "0%";
  loadingCard.classList.remove("hidden");
}

function hideLoading() {
  progressBar.style.width = "100%";
  loadingCard.classList.add("hidden");
}

function showLoadError(error) {
  console.error(error);
  statusDot.classList.add("error");
  statusText.textContent = "模型加载失败";
  loadingTitle.textContent = "模型没有成功载入";
  progressText.textContent = "请刷新页面后重试";
}

async function fetchSplitModel({ prefix, count, totalBytes, label, detail }) {
  let loadedBytes = 0;
  const urls = Array.from({ length: count }, (_, index) => `${prefix}${String(index).padStart(2, "0")}`);
  const parts = await Promise.all(urls.map(async url => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${label}分片加载失败：${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    loadedBytes += bytes.byteLength;
    const progress = Math.min(99, Math.round(loadedBytes / totalBytes * 100));
    progressBar.style.width = `${progress}%`;
    progressText.textContent = `${progress}% · ${detail}`;
    statusText.textContent = `${label} ${progress}%`;
    return bytes;
  }));
  const merged = new Uint8Array(loadedBytes);
  let offset = 0;
  parts.forEach(bytes => {
    merged.set(bytes, offset);
    offset += bytes.byteLength;
  });
  return merged.buffer;
}

function parseGlb(buffer) {
  return new Promise((resolve, reject) => gltfLoader.parse(buffer, "", resolve, reject));
}

async function loadBaseModel() {
  const buffer = await fetchSplitModel({
    prefix: "./models/nikki.part-",
    count: 25,
    totalBytes: 12694160,
    label: "载入角色",
    detail: "完整角色与 299 根骨骼，约 13 MB"
  });
  const gltf = await parseGlb(buffer);
  baseModel = gltf.scene;
  configureModel(baseModel, "base");
  characterRoot.add(baseModel);
  fitCharacter();
  applyOutfit("s0142");
  applyPose("natural");
  hideLoading();
  statusDot.classList.add("active");
  statusText.textContent = "角色与骨骼已载入";
}

async function loadResourceOutfit() {
  if (resourceOutfit) return resourceOutfit;
  if (resourceOutfitPromise) return resourceOutfitPromise;
  resourceOutfitPromise = (async () => {
    showLoading("正在载入 S0366 完整套装", "0% · 2.8 资源包转换资产，约 21 MB");
    const buffer = await fetchSplitModel({
      prefix: "./models/s0366.part-",
      count: 41,
      totalBytes: 21151020,
      label: "载入换装",
      detail: "11 件网格与对应贴图，约 21 MB"
    });
    const gltf = await parseGlb(buffer);
    resourceOutfit = gltf.scene;
    configureModel(resourceOutfit, "resource");
    characterRoot.add(resourceOutfit);
    resourceOutfit.visible = false;
    applyPose(currentPose);
    hideLoading();
    return resourceOutfit;
  })().catch(error => {
    resourceOutfitPromise = null;
    throw error;
  });
  return resourceOutfitPromise;
}

function applyOutfit(id) {
  if (!baseModel) return;
  const useOriginal = id === "s0142";
  baseModel.traverse(child => {
    if (!child.isMesh) return;
    if (child.name.includes("S0142D")) {
      child.visible = true;
      materialsOf(child.material).forEach(material => {
        material.visible = useOriginal || /NNSkin|Eye|Cornea/i.test(material.name);
      });
    } else if (child.name.includes("S0142")) {
      child.visible = useOriginal;
    } else {
      child.visible = true;
    }
  });
  if (resourceOutfit) {
    resourceOutfit.visible = !useOriginal;
    resourceOutfit.traverse(child => {
      if (!child.isMesh) return;
      materialsOf(child.material).forEach(material => {
        material.visible = !/NNSkin_Body/i.test(material.name);
      });
    });
  }
  currentOutfit = id;
  clearHighlight();
  setOutfitOverview(id);
  outfitButtons.forEach(button => {
    const active = button.dataset.outfit === id;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  outfitStatus.textContent = useOriginal ? "S0142 · 已载入" : "S0366 · 11件已载入";
  statusText.textContent = useOriginal ? "已切换：熠熠舞曲" : "已切换：S0366 套装";
}

function bonePoseFor(name, preset) {
  if (preset[name]) return preset[name];
  const key = Object.keys(preset).find(item => name.startsWith(`${item}_`) && /^\d+$/.test(name.slice(item.length + 1)));
  return key ? preset[key] : null;
}

function applyPose(id) {
  const preset = posePresets[id];
  if (!preset || !baseModel) return;
  characterRoot.traverse(child => {
    if (!child.isBone || !child.userData.bindQuaternion) return;
    child.quaternion.copy(child.userData.bindQuaternion);
    const rotation = bonePoseFor(child.name, preset);
    if (!rotation) return;
    const delta = new THREE.Quaternion().setFromEuler(new THREE.Euler(
      THREE.MathUtils.degToRad(rotation[0]),
      THREE.MathUtils.degToRad(rotation[1]),
      THREE.MathUtils.degToRad(rotation[2]),
      "XYZ"
    ));
    child.quaternion.multiply(delta);
  });
  currentPose = id;
  poseButtons.forEach(button => {
    const active = button.dataset.pose === id;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

outfitButtons.forEach(button => button.addEventListener("click", async () => {
  const id = button.dataset.outfit;
  if (id === currentOutfit || !baseModel) return;
  if (id === "s0366" && !resourceOutfit) {
    outfitButtons.forEach(item => { item.disabled = true; });
    outfitStatus.textContent = "正在转换载入…";
    try {
      await loadResourceOutfit();
    } catch (error) {
      showLoadError(error);
      outfitStatus.textContent = "载入失败，请重试";
      outfitButtons.forEach(item => { item.disabled = false; });
      return;
    }
    outfitButtons.forEach(item => { item.disabled = false; });
  }
  applyOutfit(id);
}));

poseButtons.forEach(button => button.addEventListener("click", () => applyPose(button.dataset.pose)));

loadBaseModel().catch(showLoadError);

const cameraPresets = {
  full: [[0, .96, 2.72], [0, .9, 0]],
  face: [[0, 1.5, .72], [0, 1.5, 0]],
  dress: [[.03, .97, 1.35], [0, .94, 0]]
};

document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => {
  const preset = cameraPresets[button.dataset.view];
  cameraGoal = new THREE.Vector3(...preset[0]);
  targetGoal = new THREE.Vector3(...preset[1]);
}));

rotateButton.addEventListener("click", () => {
  controls.autoRotate = !controls.autoRotate;
  rotateButton.classList.toggle("is-active", controls.autoRotate);
  rotateButton.setAttribute("aria-pressed", String(controls.autoRotate));
  rotateButton.textContent = controls.autoRotate ? "停止旋转" : "自动旋转";
});

function resize() {
  const width = mount.clientWidth;
  const height = mount.clientHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(height, 1);
  camera.updateProjectionMatrix();
}

new ResizeObserver(resize).observe(mount);
resize();

function animate() {
  requestAnimationFrame(animate);
  if (cameraGoal && targetGoal) {
    camera.position.lerp(cameraGoal, .085);
    controls.target.lerp(targetGoal, .085);
    if (camera.position.distanceTo(cameraGoal) < .006) {
      cameraGoal = null;
      targetGoal = null;
    }
  }
  controls.update();
  stars.rotation.y += .00018;
  renderer.render(scene, camera);
}

animate();
