import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const SOURCE_MODEL_PART_URLS = Object.entries(import.meta.glob(
  "../source-assets/models/parts/liebherr-t284.part-*",
  { eager: true, query: "?url", import: "default" }
))
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([, url]) => url);
const TARGET_WHEEL_DIAMETER = 4.9;

const SOURCE_PARTS = new Map([
  ["tire 59/80 r63 michelin002_1", ["source_tire_assembly", "原型六轮轮胎总成", "wheels", "源素材把六条轮胎合并在同一组网格中；下一阶段将按空间区域切分为独立轮组。"]],
  ["rim t287_2", ["source_rim_assembly", "原型六轮轮毂总成", "wheels", "原始 T284 轮毂总成。"]],
  ["64_3", ["front_wheel_support", "前轮转向与支撑总成", "wheels"]],
  ["Object003_4", ["rear_axle_housing", "后轮轴壳", "wheels"]],
  ["Object006_5", ["rear_drive_housing", "后轮驱动壳体", "wheels"]],
  ["axxle_6", ["rear_axle_detail", "后轴机械细节", "wheels"]],
  ["Object007_7", ["rear_axle_fasteners", "后轴紧固件", "wheels"]],
  ["REDUCTORES_8", ["rear_reduction_gears", "后轮减速器总成", "wheels"]],
  ["tanbor_9", ["front_wheel_hubs", "前轮轮毂总成", "wheels"]],
  ["barra frontal_10", ["front_crossmember", "前部承载横梁", "structure"]],
  ["ca1_11", ["front_body_shell", "车头主体外壳", "front"]],
  ["65_12", ["front_service_panel", "车头检修面板", "front"]],
  ["parrilla_13", ["front_grille_mesh", "车头主格栅", "front"]],
  ["066_14", ["front_outer_shell", "前部外壳结构", "front"]],
  ["006_15", ["front_inner_shell", "前部内衬结构", "front"]],
  ["Object002_18", ["main_chassis", "主承载车架", "structure"]],
  ["barrera_19", ["front_platform_rail", "前维护平台栏杆", "access"]],
  ["base plataforma _20", ["front_platform_base", "前维护平台底座", "front"]],
  ["pltf 1_21", ["front_platform_floor", "前维护平台踏板", "front"]],
  ["air filter001_22", ["air_filter_bank", "空气滤清器组", "details"]],
  ["pipe line air_23", ["air_pipework", "进气管路", "details"]],
  ["soporte001_24", ["air_system_brackets", "进气系统支架", "details"]],
  ["AC case_25", ["air_conditioning_unit", "空调设备箱", "front"]],
  ["case fram_28", ["equipment_room_frame", "设备室框架", "front"]],
  ["case bx_29", ["equipment_room_shell", "设备室箱体", "front"]],
  ["parrilla001_30", ["equipment_room_vent", "设备室通风格栅", "front"]],
  ["case door_31", ["equipment_room_door", "设备室检修门", "front"]],
  ["jalador_32", ["equipment_room_handle", "设备室门把手", "details"]],
  ["bisagras_33", ["equipment_room_hinges", "设备室门铰链", "details"]],
  ["case tornill_34", ["equipment_room_fasteners", "设备室紧固件", "details"]],
  ["cab ss_35", ["driver_cab_shell", "驾驶室外壳", "front"]],
  ["cab gls_36", ["driver_cab_glass", "驾驶室玻璃", "front"]],
  ["buket frame_37", ["dump_bed_frame", "货斗承载框架", "dump"]],
  ["buket body_38", ["dump_bed_body", "货斗本体", "dump", "原型 T284 倾斜自卸货斗。"]],
  ["fuel tank_41", ["fuel_tank", "燃料箱总成", "structure"]],
  ["pasos 03_45", ["front_access_steps", "前部登车踏步", "access"]],
  ["baranada 2_46", ["front_access_guard", "登车踏步护栏", "access"]],
  ["base silindro_47", ["dump_cylinder_base", "货斗举升缸底座", "dump"]],
  ["silindro _48", ["dump_cylinder", "货斗液压举升缸", "dump"]],
  ["retro eje _56", ["mirror_supports", "后视镜支架", "details"]],
  ["retro visor _57", ["mirror_housings", "后视镜外壳", "details"]],
  ["retro espejo_58", ["mirror_glass", "后视镜镜片", "details"]],
  ["bass_59", ["lower_body_base", "车体底部基座", "structure"]],
  ["rfct tr_60", ["body_reflectors", "车身反光标识", "details"]],
  ["camr_61", ["camera_mounts", "车载摄像头支架", "details"]],
  ["camr vdro_62", ["camera_glass", "车载摄像头玻璃", "details"]],
  ["barra001_63", ["rear_body_crossmember", "后部承载横梁", "structure"]],
  ["radiator_65", ["radiator_core", "散热器芯体", "details"]],
  ["parrilla.001_66", ["radiator_grille", "散热器格栅", "details"]]
]);
const SOURCE_PART_LOOKUP = new Map(
  [...SOURCE_PARTS.entries()].map(([name, definition]) => [normalizedSourceKey(name), definition])
);

export async function buildHaulTruck(scene, blueprint) {
  const root = new THREE.Group();
  root.name = "liebherr_t284_source_editor";
  root.userData.units = "meter";
  root.userData.source = "Sketchfab / gelber / CC BY 4.0";
  scene.add(root);

  const categoryNames = new Map(blueprint.categories.map((category) => [category.id, category.name]));
  const materials = createEditorMaterials();
  const parts = new Map();
  let addonSequence = 1;

  const registerPart = (id, name, category, object, options = {}) => {
    let safeId = id;
    let collisionIndex = 2;
    while (parts.has(safeId)) {
      safeId = id + "_" + collisionIndex;
      collisionIndex += 1;
    }
    object.name = safeId;
    Object.assign(object.userData, {
      partId: safeId,
      name,
      category,
      categoryName: categoryNames.get(category) || category,
      locked: Boolean(options.locked),
      removed: false,
      historyOrphan: false,
      dynamic: Boolean(options.dynamic),
      preset: options.preset || null,
      specification: options.specification || null,
      sourceName: options.sourceName || null
    });
    object.userData.original = snapshotTransform(object);
    object.traverse((child) => {
      child.userData.partId = safeId;
      if (child.isMesh || child.isSkinnedMesh) {
        child.castShadow = options.castShadow !== false;
        child.receiveShadow = options.receiveShadow !== false;
      }
    });
    if (object.parent !== root) root.add(object);
    parts.set(safeId, object);
    return object;
  };

  const loader = new GLTFLoader();
  const sourceBuffers = await Promise.all(SOURCE_MODEL_PART_URLS.map(async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`模型分块载入失败：${response.status} ${url}`);
    return response.arrayBuffer();
  }));
  const sourceObjectUrl = URL.createObjectURL(new Blob(sourceBuffers, { type: "model/gltf-binary" }));
  let gltf;
  try {
    gltf = await loader.loadAsync(sourceObjectUrl);
  } finally {
    URL.revokeObjectURL(sourceObjectUrl);
  }
  const alignment = new THREE.Group();
  alignment.name = "source_alignment";
  alignment.add(gltf.scene);
  root.add(alignment);

  const semanticRoot = gltf.scene.getObjectByName("GLTF_SceneRootNode") || gltf.scene;
  const excludedNames = new Set(["Plane_75", "Armature_100", "metarig papa_129", "metarig mama_158", "Armature bluey_175"]);
  for (const child of [...semanticRoot.children]) {
    if (excludedNames.has(child.name)) child.removeFromParent();
  }

  gltf.scene.traverse((child) => {
    if (!child.isMesh && !child.isSkinnedMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
    const materialList = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materialList) {
      if (!material) continue;
      if (material.map) {
        material.map.colorSpace = THREE.SRGBColorSpace;
        material.map.anisotropy = 8;
      }
    }
  });

  alignment.updateMatrixWorld(true);
  const tireNode = semanticRoot.getObjectByName("tire 59/80 r63 michelin002_1");
  const tireSize = tireNode
    ? new THREE.Box3().setFromObject(tireNode).getSize(new THREE.Vector3())
    : new THREE.Vector3(1, TARGET_WHEEL_DIAMETER, 1);
  const sourceWheelDiameter = tireSize.y || TARGET_WHEEL_DIAMETER;
  alignment.scale.setScalar(TARGET_WHEEL_DIAMETER / sourceWheelDiameter);
  alignment.rotation.y = -Math.PI / 2;
  alignment.updateMatrixWorld(true);

  const alignedBox = new THREE.Box3().setFromObject(alignment);
  const alignedCenter = alignedBox.getCenter(new THREE.Vector3());
  alignment.position.set(-alignedCenter.x, -alignedBox.min.y, -alignedCenter.z);
  alignment.updateMatrixWorld(true);

  const sourceNodes = [...semanticRoot.children].filter((object) => hasRenderableMesh(object));
  sourceNodes.forEach((object, index) => {
    const definition = SOURCE_PART_LOOKUP.get(normalizedSourceKey(object.name));
    const fallbackId = "source_part_" + String(index + 1).padStart(2, "0");
    const id = definition?.[0] || fallbackId;
    const name = definition?.[1] || readableSourceName(object.name, index);
    const category = definition?.[2] || classifySourcePart(object.name);
    const specification = definition?.[3] || "来自 Liebherr T284 源模型的独立网格组，可隐藏、拆除、移动、旋转、缩放和恢复。";
    const pivot = createWorldCenteredPivot(root, object);
    registerPart(id, name, category, pivot, {
      specification,
      sourceName: object.name
    });
  });
  root.remove(alignment);

  const anchors = createSourceAnchors();
  const anchorGroup = createAnchors(anchors, materials);
  anchorGroup.name = "installation_anchors";
  anchorGroup.visible = false;
  root.add(anchorGroup);

  const getPartFromObject = (object) => {
    let current = object;
    while (current && current !== scene) {
      if (current.userData?.partId && parts.has(current.userData.partId)) return parts.get(current.userData.partId);
      current = current.parent;
    }
    return null;
  };

  const createPreset = (preset, anchorId = "front_deck_center") => {
    const anchor = anchors.find((item) => item.id === anchorId) || anchors[0];
    const definitions = {
      tent: ["工业帐篷", makeTent],
      campfire: ["篝火炉", makeCampfire],
      crate: ["储物箱", makeCrate],
      shelter: ["铁棚生活区", makeShelter]
    };
    const definition = definitions[preset] || definitions.crate;
    const object = definition[1](materials);
    object.position.fromArray(anchor.position);
    object.rotation.set(...anchor.rotation);
    const sequence = addonSequence++;
    return registerPart(
      "addon_" + preset + "_" + String(sequence).padStart(2, "0"),
      definition[0] + " " + sequence,
      "addons",
      object,
      { dynamic: true, preset }
    );
  };

  const registerExternal = (object, name = "导入部件") => {
    fitImportedObject(object, 3.2);
    object.position.fromArray(anchors.find((item) => item.id === "front_deck_center").position);
    const sequence = addonSequence++;
    return registerPart(
      "addon_imported_" + String(sequence).padStart(2, "0"),
      name + " " + sequence,
      "addons",
      object,
      { dynamic: true, preset: "external" }
    );
  };

  const duplicatePart = (source) => {
    const clone = source.clone(true);
    clone.position.x += 0.7;
    clone.position.z += 0.7;
    const baseId = source.userData.partId.replace(/_copy_\d+$/, "");
    let copyIndex = 1;
    while (parts.has(baseId + "_copy_" + copyIndex)) copyIndex += 1;
    return registerPart(
      baseId + "_copy_" + copyIndex,
      source.userData.name + " 副本 " + copyIndex,
      source.userData.category,
      clone,
      {
        dynamic: true,
        preset: source.userData.preset || "clone",
        specification: source.userData.specification,
        sourceName: source.userData.sourceName
      }
    );
  };

  const setWireframe = (enabled) => {
    const changed = new Set();
    parts.forEach((part) => {
      part.traverse((child) => {
        if (!child.isMesh && !child.isSkinnedMesh) return;
        const materialList = Array.isArray(child.material) ? child.material : [child.material];
        for (const material of materialList) {
          if (!material || material.transparent || changed.has(material)) continue;
          material.wireframe = enabled;
          material.needsUpdate = true;
          changed.add(material);
        }
      });
    });
  };

  const modelBox = new THREE.Box3().setFromObject(root);
  const modelSize = modelBox.getSize(new THREE.Vector3());
  const spec = {
    ...blueprint.dimensionsMeters,
    sourceEnvelope: {
      length: modelSize.x,
      height: modelSize.y,
      width: modelSize.z
    },
    sourceWheelDiameter,
    sourceModel: "Liebherr T284"
  };
  root.userData.spec = spec;

  return {
    root,
    parts,
    materials,
    anchors,
    anchorGroup,
    categoryNames,
    spec,
    getPartFromObject,
    createPreset,
    registerExternal,
    registerPart,
    duplicatePart,
    setWireframe
  };
}

function hasRenderableMesh(object) {
  let found = false;
  object.traverse((child) => {
    if (child.isMesh || child.isSkinnedMesh) found = true;
  });
  return found;
}

function normalizedSourceKey(value) {
  return value
    .replace(/[._\s]+\d+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function createWorldCenteredPivot(root, object) {
  root.updateMatrixWorld(true);
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  const pivot = new THREE.Group();
  pivot.position.copy(root.worldToLocal(center.clone()));
  root.add(pivot);
  pivot.attach(object);
  return pivot;
}

function classifySourcePart(name) {
  const value = name.toLowerCase();
  if (/tire|rim|axxle|reductor|tanbor|wheel/.test(value)) return "wheels";
  if (/buket|silindro|ansul|tuerca/.test(value)) return "dump";
  if (/plataforma|pltf|barrera|pasos|baranada/.test(value)) return "access";
  if (/cab|case|parrilla|radiator/.test(value)) return "front";
  if (/bass|barra|frame|tank/.test(value)) return "structure";
  return "details";
}

function readableSourceName(sourceName, index) {
  const cleaned = sourceName
    .replace(/[_\.]+/g, " ")
    .replace(/\s+\d+$/, "")
    .trim();
  return "源模型部件 " + String(index + 1).padStart(2, "0") + " · " + cleaned;
}

function createSourceAnchors() {
  return [
    { id: "front_deck_left", name: "原型前平台 · 驾驶室侧", position: [-3.8, 6.35, 3.6], rotation: [0, 0, 0] },
    { id: "front_deck_center", name: "原型前平台 · 中央", position: [-3.8, 6.35, 0], rotation: [0, 0, 0] },
    { id: "front_deck_right", name: "原型前平台 · 设备侧", position: [-3.8, 6.35, -3.6], rotation: [0, 0, 0] },
    { id: "upper_platform", name: "原型车头上层平台", position: [-3.7, 8.25, 0], rotation: [0, 0, 0] },
    { id: "dump_front", name: "原型货斗 · 前部", position: [0.3, 9.2, 0], rotation: [0, 0, 0] },
    { id: "dump_center", name: "原型货斗 · 中央", position: [3.0, 8.8, 0], rotation: [0, 0, 0] },
    { id: "rear_frame", name: "原型车尾承载区", position: [6.0, 5.2, 0], rotation: [0, 0, 0] }
  ];
}

function createEditorMaterials() {
  return {
    floor: new THREE.MeshStandardMaterial({ color: 0xb9b8b0, roughness: 0.94, metalness: 0.04 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x646c69, roughness: 0.52, metalness: 0.9 }),
    steelDark: new THREE.MeshStandardMaterial({ color: 0x2e3533, roughness: 0.62, metalness: 0.88 }),
    paint: new THREE.MeshStandardMaterial({ color: 0xa97738, roughness: 0.76, metalness: 0.56 }),
    fabric: new THREE.MeshStandardMaterial({ color: 0x5c6b58, roughness: 0.96, metalness: 0.02, side: THREE.DoubleSide }),
    fabricDark: new THREE.MeshStandardMaterial({ color: 0x28352b, roughness: 0.98, metalness: 0.02, side: THREE.DoubleSide }),
    wood: new THREE.MeshStandardMaterial({ color: 0x5a311d, roughness: 0.9, metalness: 0.02 }),
    flameOuter: new THREE.MeshBasicMaterial({ color: 0xff6a1a, transparent: true, opacity: 0.82 }),
    flameInner: new THREE.MeshBasicMaterial({ color: 0xffd45c, transparent: true, opacity: 0.9 }),
    anchor: new THREE.MeshBasicMaterial({ color: 0xf4b454, transparent: true, opacity: 0.86 })
  };
}

function createAnchors(anchors, materials) {
  const group = new THREE.Group();
  anchors.forEach((anchor) => {
    const marker = new THREE.Group();
    marker.name = anchor.id;
    marker.position.fromArray(anchor.position);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.04, 8, 28), materials.anchor);
    ring.rotation.x = Math.PI / 2;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.52, 8), materials.anchor);
    stem.position.y = 0.24;
    marker.add(ring, stem);
    marker.traverse((child) => { child.userData.helper = true; });
    group.add(marker);
  });
  return group;
}

function makeTent(materials) {
  const group = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(-1.55, 0);
  shape.lineTo(0, 1.65);
  shape.lineTo(1.55, 0);
  shape.closePath();
  const body = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: 2.8, bevelEnabled: false }),
    materials.fabric
  );
  body.geometry.translate(0, 0, -1.4);
  group.add(body);
  return group;
}

function makeCampfire(materials) {
  const group = new THREE.Group();
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.56, 0.28, 24, 1, true), materials.steelDark);
  bowl.position.y = 0.34;
  const outer = new THREE.Mesh(new THREE.ConeGeometry(0.48, 1.05, 9), materials.flameOuter);
  outer.position.y = 1.05;
  const inner = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.72, 8), materials.flameInner);
  inner.position.y = 0.9;
  const light = new THREE.PointLight(0xff8d32, 3.2, 8, 2);
  light.position.y = 1.2;
  group.add(bowl, outer, inner, light);
  group.userData.animate = (time) => {
    outer.scale.y = 0.92 + Math.sin(time * 8) * 0.08;
    light.intensity = 2.8 + Math.sin(time * 10) * 0.45;
  };
  return group;
}

function makeCrate(materials) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 1.25, 1.4), materials.paint);
  body.position.y = 0.625;
  const lid = new THREE.Mesh(new THREE.BoxGeometry(2.08, 0.1, 1.48), materials.steelDark);
  lid.position.y = 1.3;
  group.add(body, lid);
  return group;
}

function makeShelter(materials) {
  const group = new THREE.Group();
  const roof = new THREE.Mesh(new THREE.BoxGeometry(4.48, 0.18, 3.78), materials.paint);
  roof.position.y = 2.75;
  const back = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.65, 0.12), materials.steelDark);
  back.position.set(0, 1.325, 1.7);
  group.add(roof, back);
  for (const x of [-2.1, 2.1]) {
    for (const z of [-1.7, 1.7]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.65, 10), materials.steel);
      post.position.set(x, 1.325, z);
      group.add(post);
    }
  }
  return group;
}

function fitImportedObject(object, targetSize) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const largest = Math.max(size.x, size.y, size.z) || 1;
  object.scale.multiplyScalar(targetSize / largest);
  object.updateMatrixWorld(true);
  const fittedBox = new THREE.Box3().setFromObject(object);
  const center = fittedBox.getCenter(new THREE.Vector3());
  object.position.x -= center.x;
  object.position.z -= center.z;
  object.position.y -= fittedBox.min.y;
}

export function snapshotTransform(object) {
  return {
    position: object.position.toArray(),
    quaternion: object.quaternion.toArray(),
    scale: object.scale.toArray()
  };
}

export function restoreTransform(object, snapshot = object.userData.original) {
  if (!snapshot) return;
  object.position.fromArray(snapshot.position);
  object.quaternion.fromArray(snapshot.quaternion);
  object.scale.fromArray(snapshot.scale);
  object.updateMatrixWorld(true);
}

export function getObjectStats(object) {
  let meshes = 0;
  let triangles = 0;
  object.traverse((child) => {
    if (!child.isMesh && !child.isSkinnedMesh && !child.isInstancedMesh) return;
    meshes += child.isInstancedMesh ? child.count : 1;
    const geometry = child.geometry;
    if (!geometry) return;
    const count = geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3;
    triangles += Math.round(count * (child.isInstancedMesh ? child.count : 1));
  });
  return { meshes, triangles };
}
