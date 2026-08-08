import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const overview = {
  name: "暖暖 · 熠熠舞曲",
  category: "完整角色模型",
  description: "包含暖暖的脸部、身体、眼睛、头发、299 根骨骼与熠熠舞曲套装。点击模型上的部件可以查看说明。"
};

const objectParts = {
  PFJ0001: ["睫毛与眼妆", "面部细节", "独立睫毛网格与眼部妆面，让近距离观察仍保持完整层次。"],
  PFM0001: ["眉妆", "面部细节", "眉形与面部妆面组件，贴合暖暖原始头部模型。"],
  S0142AEA: ["耳饰", "熠熠舞曲 · 饰品", "紫晶坠饰与细金属结构组成的耳部配件。"],
  S0142AHC: ["羽晶头饰", "熠熠舞曲 · 头饰", "浅色羽饰、紫晶与金色枝叶结构组成的头饰。"],
  S0142AHE: ["颈饰", "熠熠舞曲 · 饰品", "沿颈部展开的金色曲线与紫色宝石坠饰。"],
  S0142ANE: ["手部饰品", "熠熠舞曲 · 饰品", "手腕与手背上的羽状装饰，与胸前造型相呼应。"],
  S0142BB: ["舞曲高跟鞋", "熠熠舞曲 · 鞋履", "浅紫鞋面、金色包边和花叶装饰构成的配套高跟鞋。"],
  S0142D: ["熠熠舞曲礼服", "套装主体", "不对称层叠裙摆、织物纹理、羽饰、花枝与晶体装饰组成的礼服主体。"],
  S0142G: ["臂饰与袖口", "熠熠舞曲 · 饰品", "分布在双臂与手腕位置的花叶、羽毛和薄纱装饰。"],
  S0142H: ["粉紫盘发", "暖暖 · 发型", "粉紫渐变盘发，保留额前碎发、侧边卷发与后方发束的分层结构。"]
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

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(34, 1, .01, 100);
camera.position.set(0, .96, 2.72);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = .94;
renderer.setClearColor(0x000000, 0);
renderer.domElement.setAttribute("aria-label", "暖暖3D模型交互画布");
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

scene.add(new THREE.HemisphereLight(0xf8efff, 0x443654, 2.35));
const keyLight = new THREE.DirectionalLight(0xfff3ee, 3.4);
keyLight.position.set(2.6, 3.8, 3.4);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0xbba9ff, 2.1);
fillLight.position.set(-3.2, 1.6, 2.5);
scene.add(fillLight);
const rimLight = new THREE.PointLight(0xff9ed8, 10, 7, 1.8);
rimLight.position.set(1.7, 1.9, -2.1);
scene.add(rimLight);

const shadow = new THREE.Mesh(new THREE.CircleGeometry(.62, 72), new THREE.MeshBasicMaterial({ color: 0x75548b, transparent: true, opacity: .17, depthWrite: false }));
shadow.rotation.x = -Math.PI / 2;
shadow.scale.set(1, .38, 1);
shadow.position.y = -.012;
scene.add(shadow);

const starPositions = [];
for (let i = 0; i < 90; i += 1) {
  const angle = i * 2.39996;
  const radius = 1.15 + ((i * 37) % 100) / 72;
  starPositions.push(Math.cos(angle) * radius, .22 + ((i * 53) % 160) / 70, -.8 - ((i * 29) % 100) / 50);
}
const starGeometry = new THREE.BufferGeometry();
starGeometry.setAttribute("position", new THREE.Float32BufferAttribute(starPositions, 3));
const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: 0xd9c8ff, size: .012, transparent: true, opacity: .56, depthWrite: false }));
scene.add(stars);

let model = null;
let selectedMesh = null;
let pointerDown = { x: 0, y: 0 };
let cameraGoal = null;
let targetGoal = null;
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function materialsOf(material) { return Array.isArray(material) ? material : [material]; }
function setPart(info) {
  partName.textContent = info.name;
  partCategory.textContent = info.category;
  partDescription.textContent = info.description;
}
function resolvePart(objectName, materialName = "") {
  if (/Eye|Cornea|Eyelash|Eyebrow/i.test(materialName)) return { name: "暖暖的眼睛", category: "角色本体 · 面部", description: "眼球、虹膜、高光层、眉毛与睫毛共同构成的完整眼部组件。" };
  if (/NNSkin_Face/i.test(materialName)) return { name: "暖暖的脸部", category: "角色本体 · 面部", description: "暖暖的原始脸部网格与肤色贴图，包含嘴唇、鼻部和妆感细节。" };
  if (/NNSkin_Body/i.test(materialName)) return { name: "角色身体", category: "角色本体", description: "与服装骨骼共用绑定的完整身体网格，不是用来撑衣服的临时空壳。" };
  const key = Object.keys(objectParts).find(item => objectName.includes(item));
  if (!key) return overview;
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
    if (!material.emissive) return;
    material.userData.baseEmissive ??= material.emissive.clone();
    material.userData.baseEmissiveIntensity ??= material.emissiveIntensity;
    material.emissive.set(0x3a174d);
    material.emissiveIntensity = .32;
  });
  selectedMesh = mesh;
}

renderer.domElement.addEventListener("pointerdown", event => {
  pointerDown = { x: event.clientX, y: event.clientY };
  cameraGoal = null;
  targetGoal = null;
});
renderer.domElement.addEventListener("pointerup", event => {
  if (!model || Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 6) return;
  const bounds = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
  pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObject(model, true).find(item => item.object.isMesh);
  if (!hit) { clearHighlight(); setPart(overview); return; }
  const mesh = hit.object;
  const materials = materialsOf(mesh.material);
  const materialName = materials[hit.face?.materialIndex ?? 0]?.name || materials[0]?.name || "";
  highlight(mesh);
  setPart(resolvePart(mesh.name, materialName));
});

function finishModelLoad(gltf) {
  model = gltf.scene;
  model.traverse(child => {
    if (!child.isMesh) return;
    child.frustumCulled = false;
    child.material = Array.isArray(child.material) ? child.material.map(material => material.clone()) : child.material.clone();
    materialsOf(child.material).forEach(material => {
      if (material.transparent) {
        material.alphaTest = Math.max(material.alphaTest || 0, .025);
        material.depthWrite = material.opacity > .45;
      }
      if (child.name.includes("S0142H")) material.side = THREE.DoubleSide;
    });
  });
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  const scale = 1.78 / Math.max(box.max.y - box.min.y, .01);
  model.scale.setScalar(scale);
  model.position.x -= center.x * scale;
  model.position.z -= center.z * scale;
  const fitted = new THREE.Box3().setFromObject(model);
  model.position.y -= fitted.min.y;
  scene.add(model);
  loadingCard.classList.add("hidden");
  statusDot.classList.add("active");
  statusText.textContent = "完整模型已载入";
}

function showLoadError(error) {
  console.error(error);
  statusDot.classList.add("error");
  statusText.textContent = "模型加载失败";
  loadingTitle.textContent = "模型没有成功载入";
  progressText.textContent = "请刷新页面后重试";
}

async function loadModel() {
  const totalBytes = 11948416;
  const partUrls = Array.from({ length: 23 }, (_, index) => `./models/nikki.part-${String(index).padStart(2, "0")}`);
  let loadedBytes = 0;
  const parts = await Promise.all(partUrls.map(async url => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`模型分片加载失败：${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    loadedBytes += bytes.byteLength;
    const progress = Math.min(99, Math.round(loadedBytes / totalBytes * 100));
    progressBar.style.width = `${progress}%`;
    progressText.textContent = `${progress}% · 首次载入约 12 MB`;
    statusText.textContent = `载入模型 ${progress}%`;
    return bytes;
  }));
  const merged = new Uint8Array(loadedBytes);
  let offset = 0;
  parts.forEach(bytes => { merged.set(bytes, offset); offset += bytes.byteLength; });
  new GLTFLoader().parse(merged.buffer, "", finishModelLoad, showLoadError);
}

loadModel().catch(showLoadError);

const presets = {
  full: [[0, .96, 2.72], [0, .9, 0]],
  face: [[0, 1.5, .72], [0, 1.5, 0]],
  dress: [[.03, .97, 1.35], [0, .94, 0]]
};
document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => {
  const preset = presets[button.dataset.view];
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
    if (camera.position.distanceTo(cameraGoal) < .006) { cameraGoal = null; targetGoal = null; }
  }
  controls.update();
  stars.rotation.y += .00018;
  renderer.render(scene, camera);
}
animate();
